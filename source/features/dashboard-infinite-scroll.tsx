import './dashboard-infinite-scroll.css';

import {mergeSignals, signalFromEvent} from 'abort-utils';
import React from 'dom-chef';
import * as pageDetect from 'github-url-detection';
import {$optional, closestElementOptional, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import {getDashboardRows, getNextDashboardPage} from '../helpers/dashboard-pagination.js';
import observe from '../helpers/selector-observer.js';

function start(signal: AbortSignal, nextLink: HTMLAnchorElement): void {
	if (elementExists('.rgh-dashboard-infinite-scroll')) {
		return;
	}

	const firstRow = $optional('main li[class*="listItem"]');
	let nextUrl = getNextDashboardPage(nextLink, location.href);
	if (!firstRow || !nextUrl) {
		return;
	}

	const list = firstRow.parentElement!;
	const status = <span role="status">Scroll to load more results.</span>;
	const retry = document.createElement('button');
	retry.type = 'button';
	retry.className = 'btn btn-sm';
	retry.textContent = 'Retry loading';
	retry.hidden = true;
	const sentinel = document.createElement('div');
	sentinel.className = 'rgh-dashboard-infinite-scroll';
	sentinel.append(status, retry);
	const pagination = closestElementOptional('nav', nextLink) ?? nextLink.parentElement!;
	pagination.before(sentinel);

	const seen = new Set(getDashboardRows(document, location.href).map(item => item.url));
	const requested = new Set([location.href.split('#', 1)[0]]);
	const addedRows = new Set<Element>();
	let busy = false;
	let observer: IntersectionObserver; // eslint-disable-line prefer-const -- The loader closes over the observer before construction.

	const loadNext = async (): Promise<void> => {
		if (!nextUrl || busy || signal.aborted || requested.has(nextUrl)) {
			return;
		}

		const url = nextUrl;
		busy = true;
		requested.add(url);
		retry.hidden = true;
		status.textContent = 'Loading more results…';
		try {
			const response = await fetch(url, {
				signal,
				redirect: 'error',
				headers: {accept: 'text/html'},
			});
			// A login page or a changed response format must leave native pagination usable.
			if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
				throw new Error('Could not load a results page');
			}

			const page = new DOMParser().parseFromString(await response.text(), 'text/html');
			const items = getDashboardRows(page, url);
			if (items.length === 0) {
				throw new Error('The results layout changed or the session expired');
			}

			if (signal.aborted || !list.isConnected) {
				return;
			}

			let added = 0;
			for (const item of items) {
				if (seen.has(item.url)) {
					continue;
				}

				seen.add(item.url);
				// Build from text and validated links, never insert fetched HTML or React controls.
				const row = (
					<li className="listItem rgh-dashboard-row">
						<h3 className="heading h4">
							<a className="anchor" href={item.url}>{item.title}</a>
						</h3>
						<div className="text-small color-fg-muted">{item.description}</div>
					</li>
				);
				list.append(row);
				addedRows.add(row);
				added++;
			}

			nextUrl = getNextDashboardPage($optional('a[rel="next"]', page), url);
			if (!nextUrl || requested.has(nextUrl)) {
				nextUrl = undefined;
				status.textContent = 'End of results.';
				observer.disconnect();
				return;
			}

			status.textContent = `Loaded ${added} more results. Scroll for more.`;
			observer.unobserve(sentinel);
			observer.observe(sentinel);
		} catch {
			if (signal.aborted) {
				return;
			}

			requested.delete(url);
			status.textContent = 'Could not load more results. Retry or use the pagination below.';
			retry.hidden = false;
			observer.disconnect();
		} finally {
			busy = false;
		}
	};

	observer = new IntersectionObserver(entries => {
		if (entries.some(entry => entry.isIntersecting)) {
			void loadNext();
		}
	}, {rootMargin: '400px'});
	retry.addEventListener('click', loadNext, {signal});
	observer.observe(sentinel);
	signal.addEventListener('abort', () => {
		observer.disconnect();
		sentinel.remove();
		for (const row of addedRows) {
			row.remove();
		}
	}, {once: true});
}

function init(signal: AbortSignal): void {
	signal = mergeSignals(signal, signalFromEvent(document, 'soft-nav:start', {signal}));
	const selector = 'main a[rel="next"][href]:not([aria-disabled="true"])';
	const nextLink = $optional(selector);
	if (nextLink) {
		start(signal, nextLink);
	}

	observe(selector, start.bind(undefined, signal), {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isGlobalIssueOrPRList,
	],
	init,
});

/*

Test URLs:
- https://github.com/issues/search?q=repo%3Arefined-github%2Frefined-github+is%3Aissue
- https://github.com/pulls/search?q=repo%3Arefined-github%2Frefined-github
- https://github.com/refined-github/refined-github/pulls (no automatic loading)

*/
