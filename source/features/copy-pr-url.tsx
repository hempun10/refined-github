import {mergeSignals, signalFromEvent} from 'abort-utils';
import delegate, {type DelegateEvent} from 'delegate-it';
import React from 'dom-chef';
import * as pageDetect from 'github-url-detection';
import {$$optional, $optional, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import {buildRepoUrl, getConversationNumber} from '../github-helpers/index.js';
import delay from '../helpers/delay.js';
import observe from '../helpers/selector-observer.js';

function addCopyButton(header: HTMLElement): void {
	if (elementExists('.rgh-copy-pr-url', header)) {
		return;
	}

	const hasNativeCopy = $$optional(':is(button, clipboard-copy)', header).some(button => {
		const labelledBy = button.getAttribute('aria-labelledby');
		const label = button.getAttribute('aria-label') ?? (labelledBy
			// GitHub can remove a tooltip before its button during a render.
			? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ')
			: button.textContent.trim());
		return button.getClientRects().length > 0 && /copy (?:pull request )?(?:url|link)(?: to clipboard)?$/i.test(label);
	});
	if (hasNativeCopy) {
		return;
	}

	header.prepend(
		<button type="button" className="btn btn-sm rgh-copy-pr-url" aria-label="Copy pull request URL">Copy PR URL</button>,
		<span className="sr-only rgh-copy-pr-url-status" role="status" />,
	);
}

async function copyUrl({delegateTarget: button}: DelegateEvent<MouseEvent, HTMLButtonElement>): Promise<void> {
	button.disabled = true;
	const status = $optional('.rgh-copy-pr-url-status', button.parentElement!);
	try {
		await navigator.clipboard.writeText(buildRepoUrl('pull', getConversationNumber()!));
		button.textContent = 'Copied!';
	} catch {
		button.textContent = 'Copy failed. Retry';
	}

	if (status) {
		status.textContent = button.textContent;
	}

	await delay(2000);
	button.textContent = 'Copy PR URL';
	button.disabled = false;
}

function init(signal: AbortSignal): void {
	signal = mergeSignals(signal, signalFromEvent(document, 'soft-nav:start', {signal}));
	const headers = [
		'[data-component="PH_Actions"]', // React PR header
		'.gh-header-actions', // Legacy files and commits headers
	];
	for (const header of $$optional(headers)) {
		addCopyButton(header);
	}

	observe(headers, addCopyButton, {signal});
	delegate('.rgh-copy-pr-url', 'click', copyUrl, {signal});
	signal.addEventListener('abort', () => {
		for (const element of $$optional(':is(.rgh-copy-pr-url, .rgh-copy-pr-url-status)')) {
			element.remove();
		}
	}, {once: true});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isPR,
	],
	init,
});

/*

Test URLs:
- https://github.com/refined-github/refined-github/pull/10366
- https://github.com/refined-github/refined-github/pull/10366/files
- https://github.com/refined-github/refined-github/issues/10000 (no button)

*/
