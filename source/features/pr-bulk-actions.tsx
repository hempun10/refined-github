import './pr-bulk-actions.css';

import {mergeSignals, signalFromEvent} from 'abort-utils';
import delegate from 'delegate-it';
import React from 'dom-chef';
import * as pageDetect from 'github-url-detection';
import {$optional, closestElement, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import openTabs from '../helpers/open-tabs.js';
import pluralize from '../helpers/pluralize.js';
import observe from '../helpers/selector-observer.js';

function stopRowAction(event: Event): void {
	event.stopPropagation();
}

function init(signal: AbortSignal): void {
	signal = mergeSignals(signal, signalFromEvent(document, 'soft-nav:start', {signal}));
	const checkboxes = new Map<HTMLInputElement, HTMLAnchorElement>();
	const customCheckboxes = new Set<HTMLInputElement>();
	const count = <span role="status" />;
	const toolbar = document.createElement('div');
	toolbar.className = 'rgh-pr-bulk-actions';
	toolbar.hidden = true;
	toolbar.setAttribute('role', 'region');
	toolbar.setAttribute('aria-label', 'Selected pull requests');
	toolbar.append(
		count,
		<button type="button" className="btn btn-sm rgh-pr-copy">Copy URLs</button>,
		<button type="button" className="btn btn-sm rgh-pr-open">Open PRs</button>,
		<button type="button" className="btn btn-sm rgh-pr-clear">Clear selection</button>,
	);
	document.body.append(toolbar);

	const selectedUrls = (): string[] => [
		...new Set(
			[...checkboxes].filter(([box, link]) => box.checked && box.isConnected && link.isConnected).map(([, link]) =>
				link.href
			),
		),
	];

	const update = (): void => {
		for (const [box, link] of checkboxes) {
			if (!box.isConnected || !link.isConnected) {
				checkboxes.delete(box);
				continue;
			}

			closestElement(['li[class*="listItem"]', '.js-issue-row'], link).classList.toggle('rgh-pr-selected', box.checked);
		}

		const urls = selectedUrls();
		toolbar.hidden = urls.length === 0;
		count.textContent = pluralize(urls.length, '$$ PR') + ' selected';
	};

	const addCheckbox = (link: HTMLAnchorElement): void => {
		if (new URL(link.href).origin !== location.origin) {
			return;
		}

		const row = closestElement(['li[class*="listItem"]', '.js-issue-row'], link);
		if (elementExists('[role="checkbox"]', row)) {
			return; // Leave non-input native selection controls to GitHub.
		}

		let box = $optional('input[type="checkbox"]', row);
		if (!box) {
			box = document.createElement('input');
			box.type = 'checkbox';
			box.className = 'rgh-pr-select';
			box.setAttribute('aria-label', `Select PR: ${link.textContent.trim()}`);
			box.addEventListener('click', stopRowAction, {signal});
			box.addEventListener('keydown', stopRowAction, {signal});
			link.before(box);
			customCheckboxes.add(box);
		}

		checkboxes.set(box, link);
		update();
	};

	const copy = async (): Promise<void> => {
		const urls = selectedUrls();
		try {
			await navigator.clipboard.writeText(urls.join('\n'));
			count.textContent = pluralize(urls.length, '$$ PR URL') + ' copied';
		} catch {
			count.textContent = 'Could not copy URLs. Try again.';
		}
	};

	const open = async (): Promise<void> => {
		try {
			await openTabs(selectedUrls());
		} catch {
			count.textContent = 'Could not open PRs. Try again.';
		}
	};

	const clear = (): void => {
		const selected = [...checkboxes.keys()].filter(box => box.checked && box.isConnected);
		for (const box of selected) {
			box.click();
		}

		update();
		// Return focus to the list when its toolbar becomes hidden.
		selected[0]?.focus();
	};

	observe(
		[
			'li[class*="listItem"] h3 a[href*="/pull/"]', // React repository and global lists
			'.js-issue-row a.js-navigation-open[href*="/pull/"]', // Legacy lists
		],
		addCheckbox,
		{signal},
	);
	delegate('main input[type="checkbox"]', 'change', update, {signal});
	delegate('.rgh-pr-copy', 'click', copy, {signal});
	delegate('.rgh-pr-open', 'click', open, {signal});
	delegate('.rgh-pr-clear', 'click', clear, {signal});
	signal.addEventListener('abort', () => {
		toolbar.remove();
		for (const [box, link] of checkboxes) {
			if (link.isConnected) {
				closestElement(['li[class*="listItem"]', '.js-issue-row'], link).classList.remove('rgh-pr-selected');
			}

			if (customCheckboxes.has(box)) {
				box.remove();
			}
		}
	}, {once: true});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isPRList,
	],
	init,
});

/*

Test URLs:
- https://github.com/refined-github/refined-github/pulls
- https://github.com/pulls/search?q=repo%3Arefined-github%2Frefined-github
- https://github.com/refined-github/refined-github/issues (no PR selection)

*/
