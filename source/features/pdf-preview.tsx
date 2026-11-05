import './pdf-preview.css';

import {mergeSignals, signalFromEvent} from 'abort-utils';
import delegate, {type DelegateEvent} from 'delegate-it';
import React from 'dom-chef';
import {isAlteredClick} from 'filter-altered-clicks';
import * as pageDetect from 'github-url-detection';
import EyeIcon from 'octicons-plain-react/Eye';
import {$$optional, closestElementOptional, elementExists} from 'select-dom';
import {assertError} from 'ts-extras';

import features from '../feature-manager.js';
import {getPdfUrl} from '../helpers/pdf-preview.js';
import observe from '../helpers/selector-observer.js';

function openPdf(url: URL, signal: AbortSignal): void {
	if (elementExists('dialog[open]')) {
		return;
	}

	const controller = new AbortController();
	signal = mergeSignals(signal, controller.signal);
	const status = <p role="status">Loading PDF…</p>;
	const dialog = document.createElement('dialog');
	dialog.className = 'rgh-pdf-preview';
	dialog.setAttribute('aria-label', 'PDF preview');
	dialog.append(
		<div className="d-flex flex-justify-between flex-items-center mb-2">
			<a href={url.href} target="_blank" rel="noopener noreferrer">Open original PDF</a>
			<form method="dialog">
				<button className="btn btn-sm" aria-label="Close PDF preview">Close</button>
			</form>
		</div>,
		status,
	);
	dialog.addEventListener('click', event => {
		if (event.target !== dialog) {
			return;
		}

		const bounds = dialog.getBoundingClientRect();
		if (
			event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top
			|| event.clientY > bounds.bottom
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
		dialog.remove();
	}, {once: true});
	document.body.append(dialog);
	dialog.showModal();

	try {
		const viewerUrl = chrome.runtime.getURL('assets/pdf-preview.html');
		const viewerOrigin = new URL(viewerUrl).origin;
		const frame = document.createElement('iframe');

		// Shortcut: native PDF frames consume Escape, use a renderer with key forwarding if that must close the modal.
		frame.title = 'PDF preview';
		frame.src = viewerUrl;
		frame.addEventListener('load', () => {
			// Do not send signed PDF URLs to a redirected frame.
			frame.contentWindow?.postMessage({type: 'rgh-pdf-preview', url: url.href}, viewerOrigin);
			status.remove();
		}, {once: true, signal});
		frame.addEventListener('error', () => {
			status.textContent = 'Could not open the preview. Use the original PDF link.';
		}, {once: true, signal});
		globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
			const {data} = event;
			if (
				data !== null && typeof data === 'object' && 'type' in data && data.type === 'rgh-pdf-close'
				&& event.origin === viewerOrigin && event.source === frame.contentWindow
			) {
				dialog.close();
			}
		}, {signal});
		dialog.append(frame);
	} catch (error) {
		if (!signal.aborted) {
			assertError(error);
			status.textContent = error.message;
		}
	}
}

function init(signal: AbortSignal): void {
	if (!navigator.pdfViewerEnabled) {
		return;
	}

	signal = mergeSignals(signal, signalFromEvent(document, 'soft-nav:start', {signal}));
	const buttons = new Set<HTMLElement>();
	const addPreview = (link: HTMLAnchorElement): void => {
		const url = getPdfUrl(link.href);
		if (!url || link.classList.contains('rgh-pdf-preview-button')) {
			return;
		}

		const container = closestElementOptional([
			'.react-directory-filename-column', // Repository file rows
			'.file-header', // Legacy PR diff headers
			'[class*="diff-file-header"]', // React PR diff headers
		], link)
			?? (pageDetect.isSingleFile() && !closestElementOptional('.markdown-body', link) ? link.parentElement : null);
		if (!container || elementExists('.rgh-pdf-preview-button', container)) {
			return;
		}

		const button = <a
			href={url.href}
			className="btn btn-sm rgh-pdf-preview-button"
			aria-label="Preview PDF"
			title="Preview PDF"
		>
			<EyeIcon />
		</a>;
		container.append(button);
		buttons.add(button);
	};

	const selector = 'main a[href]:not(.rgh-pdf-preview-button)';
	for (const link of $$optional(selector)) {
		addPreview(link);
	}

	const openPreview = (event: DelegateEvent<MouseEvent, HTMLAnchorElement>): void => {
		if (event.defaultPrevented || isAlteredClick(event) || elementExists('dialog[open]')) {
			return;
		}

		const url = getPdfUrl(event.delegateTarget.href);
		if (!url) {
			return;
		}

		event.preventDefault();
		openPdf(url, signal);
	};

	observe(selector, addPreview, {signal});
	// Legacy diff headers keep the file link in a closed menu, where the animation-based observer never fires
	observe('.file-header', header => {
		for (const link of $$optional('a[href]', header)) {
			addPreview(link);
		}
	}, {signal});
	delegate(
		[
			'.markdown-body a[href]', // Descriptions, comments, and README links
			'a.rgh-pdf-preview-button', // File preview controls
		],
		'click',
		openPreview,
		{signal},
	);
	signal.addEventListener('abort', () => {
		for (const button of buttons) {
			button.remove();
		}
	}, {once: true});
}

void features.add(import.meta.url, {init});

/*

Test URLs:
- https://github.com/mozilla/pdf.js/issues/22437
- https://github.com/mozilla/pdf.js/tree/master/examples/learning
- https://github.com/mozilla/pdf.js/blob/master/examples/learning/helloworld.pdf
- https://github.com/py-pdf/sample-files/pull/45/files

*/
