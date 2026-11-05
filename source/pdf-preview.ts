import {$} from 'select-dom';

import {fetchPdf, getPdfUrl} from './helpers/pdf-preview.js';

const fileAccess = {origins: ['https://objects.githubusercontent.com/*', 'https://raw.githubusercontent.com/*']};
const controller = new AbortController();
const access = $('#access');
const button = $<HTMLButtonElement>('#allow');
const status = $('[role="status"]');
let initialized = false;
let objectUrl: string | undefined;

globalThis.addEventListener('message', async (event: MessageEvent<unknown>) => {
	const {data} = event;
	if (
		initialized || data === null || typeof data !== 'object' || event.source !== globalThis.parent
		|| !event.origin.startsWith('https://')
		|| !('type' in data) || data.type !== 'rgh-pdf-preview'
		|| !('url' in data) || typeof data.url !== 'string'
		|| !await chrome.permissions.contains({origins: [event.origin + '/*']})
	) {
		return;
	}

	const url = getPdfUrl(data.url, event.origin);
	if (initialized || !url) {
		return;
	}

	initialized = true;
	globalThis.addEventListener('keydown', keyEvent => {
		if (keyEvent.key === 'Escape') {
			globalThis.parent.postMessage({type: 'rgh-pdf-close'}, event.origin);
		}
	});

	const load = async (): Promise<void> => {
		access.hidden = true;
		status.textContent = 'Loading PDF…';
		try {
			const bytes = await fetchPdf(url, controller.signal);
			controller.signal.throwIfAborted();
			objectUrl = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
			const frame = document.createElement('iframe');
			frame.title = 'PDF document';
			frame.src = objectUrl;
			document.body.replaceChildren(frame);
		} catch (error) {
			if (!controller.signal.aborted) {
				status.textContent = error instanceof Error ? error.message : 'Could not load the PDF.';
				access.hidden = false;
				button.textContent = 'Try again';
			}
		}
	};

	button.addEventListener('click', async () => {
		button.disabled = true;
		status.textContent = 'Waiting for permission…';
		try {
			// Request before any other await to preserve the button's user activation.
			if (!await chrome.permissions.request(fileAccess)) {
				status.textContent = 'Access was not granted. You can still open the original PDF.';
				return;
			}

			await load();
		} catch (error) {
			status.textContent = error instanceof Error ? error.message : 'Could not request PDF file access.';
		} finally {
			button.disabled = false;
		}
	});

	if (await chrome.permissions.contains(fileAccess)) {
		await load();
	} else {
		access.hidden = false;
		status.textContent = '';
	}
});

globalThis.addEventListener('pagehide', () => {
	controller.abort();
	if (objectUrl) {
		URL.revokeObjectURL(objectUrl);
	}
}, {once: true});
