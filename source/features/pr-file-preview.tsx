import './pr-file-preview.css';

import {mergeSignals} from 'abort-utils';
import delegate, {type DelegateEvent} from 'delegate-it';
import React from 'dom-chef';
import {isAlteredClick} from 'filter-altered-clicks';
import * as pageDetect from 'github-url-detection';
import EyeIcon from 'octicons-plain-react/Eye';
import {$optional, closestElement, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import observe from '../helpers/selector-observer.js';

const maximumSize = 1_000_000;

export function getRawUrl(blobUrl: string): string {
	const url = new URL(blobUrl);
	const parts = url.pathname.split('/');
	parts[3] = 'raw';
	url.pathname = parts.join('/');
	url.hash = '';
	return url.href;
}

async function loadText(url: string, signal: AbortSignal): Promise<string> {
	const response = await fetch(url, {signal});
	if (!response.ok) {
		throw new Error('Could not load the file.');
	}

	// Null when the server omits Content-Type
	if (!response.headers.get('content-type')?.startsWith('text/')) {
		throw new Error('This file type can’t be previewed.');
	}

	const tooLarge = new Error('This file is too large to preview.');
	if (Number(response.headers.get('content-length')) > maximumSize) {
		throw tooLarge;
	}

	// Ponytail: compressed responses are read fully before this check; stream with a byte cap if huge files become common
	const text = await response.text();
	if (text.length > maximumSize) {
		throw tooLarge;
	}

	return text;
}

// Ponytail: big files stay plain to keep the preview instant; highlight in a worker if that matters
const maximumHighlightSize = 200_000;

export async function highlight(code: HTMLElement, text: string, path: string): Promise<void> {
	if (text.length > maximumHighlightSize) {
		return;
	}

	const language = path.split('/').pop()!.split('.').pop()!.toLowerCase();
	// Loaded on first preview only
	const {default: hljs} = await import('highlight.js/lib/common');
	if (hljs.getLanguage(language)) {
		// The highlighter escapes the source text
		code.innerHTML = hljs.highlight(text, {language, ignoreIllegals: true}).value;
	}
}

async function openPreview(path: string, blobUrl: string, signal: AbortSignal): Promise<void> {
	const controller = new AbortController();
	signal = mergeSignals(signal, controller.signal);
	const status = <p role="status">Loading file…</p>;
	const body = <div className="rgh-file-preview-body">{status}</div>;
	const dialog = document.createElement('dialog');
	dialog.className = 'rgh-file-preview';
	dialog.setAttribute('aria-label', `Preview of ${path}`);
	dialog.append(
		<div className="d-flex flex-items-center gap-2 mb-2">
			<strong className="flex-auto min-width-0 text-mono f6 css-truncate css-truncate-overflow">{path}</strong>
			<a href={blobUrl} target="_blank" rel="noopener noreferrer">Open file</a>
			<form method="dialog">
				<button className="btn btn-sm" aria-label="Close file preview">Close</button>
			</form>
		</div>,
		body,
	);
	dialog.addEventListener('click', event => {
		const bounds = dialog.getBoundingClientRect();
		if (
			event.target === dialog
			&& (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top
				|| event.clientY > bounds.bottom)
		) {
			dialog.close();
		}
	});
	dialog.addEventListener('close', () => {
		controller.abort();
		dialog.remove();
	}, {once: true});
	signal.addEventListener('abort', () => {
		dialog.close();
	}, {once: true});
	document.body.append(dialog);
	dialog.showModal();

	try {
		const text = await loadText(getRawUrl(blobUrl), signal);
		const lineCount = text.replace(/\n$/, '').split('\n').length;
		const code = <pre>{text}</pre>;
		body.replaceChildren(
			<div className="rgh-file-preview-code" tabIndex={0} aria-label={`Contents of ${path}`}>
				<pre aria-hidden="true" className="rgh-file-preview-numbers">
					{Array.from({length: lineCount}, (_, index) => index + 1).join('\n')}
				</pre>
				{code}
			</div>,
		);
		await highlight(code, text, path);
	} catch (error) {
		if (!signal.aborted) {
			status.textContent = error instanceof Error ? error.message : 'Could not load the file.';
		}
	}
}

function init(signal: AbortSignal): void {
	observe('.file-header[data-path]', header => {
		const view = $optional('a[href*="/blob/"]', header);
		const menu = $optional('details.js-file-header-dropdown', header);
		if (!view || !menu || /\.pdf$/i.test(header.dataset.path!) || elementExists('.rgh-file-preview-button', header)) {
			return;
		}

		menu.before(
			<a
				href={view.href}
				className="Button Button--iconOnly Button--invisible Button--medium rgh-file-preview-button"
				aria-label="Preview file"
				title="Preview file"
			>
				<EyeIcon />
			</a>,
		);
	}, {signal});

	const onClick = (event: DelegateEvent<MouseEvent, HTMLAnchorElement>): void => {
		if (isAlteredClick(event) || elementExists('dialog[open]')) {
			return;
		}

		event.preventDefault();
		const path = closestElement('.file-header', event.delegateTarget).dataset.path!;
		void openPreview(path, event.delegateTarget.href, signal);
	};

	delegate('a.rgh-file-preview-button', 'click', onClick, {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isPRFiles,
	],
	init,
});

/*

Test URLs:
- https://github.com/refined-github/refined-github/pull/10103/files

*/
