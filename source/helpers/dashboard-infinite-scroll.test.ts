import {$, $$optional, elementExists} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import observe from './selector-observer.js';
import '../features/dashboard-infinite-scroll.js'; // eslint-disable-line import-x/no-unassigned-import -- Register the feature under test

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('./selector-observer.js', () => ({default: vi.fn()}));

const loader = vi.mocked(features.add).mock.calls[0][1];
let controller: AbortController;
let intersect = (): void => {
	throw new Error('Observer not initialized');
};

function results(ids: number[], next = ''): Response {
	const html = '<main><ul>'
		+ ids.map(id => `<li class="listItem"><h3><a href="/o/r/issues/${id}">Issue ${id}</a></h3></li>`).join('')
		+ '</ul>' + (next ? `<a rel="next" href="${next}">Next</a>` : '') + '</main>';
	return new Response(html, {headers: {'content-type': 'text/html'}});
}

beforeEach(async () => {
	controller = new AbortController();
	history.replaceState({}, '', '/issues/search?q=repo%3Ao%2Fr');
	document.body.innerHTML =
		'<main><ul><li class="listItem"><h3><a href="/o/r/issues/1">One</a></h3></li></ul><nav><a rel="next" href="?q=repo%3Ao%2Fr&page=2">Next</a></nav></main>';
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			observe = vi.fn();
			unobserve = vi.fn();
			disconnect = vi.fn();
			constructor(callback: (entries: Array<{isIntersecting: boolean}>) => void) {
				intersect = () => {
					callback([{isIntersecting: true}]);
				};
			}
		},
	);
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected a feature initializer');
	}

	await loader.init(controller.signal);
	vi.mocked(observe).mock.calls[0][1]($('a[rel="next"]'), {signal: controller.signal});
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
	vi.unstubAllGlobals();
});

test('serializes requests, deduplicates items, follows next links and stops at the end', async () => {
	const fetch = vi.fn().mockResolvedValueOnce(results([1, 2], '?q=repo%3Ao%2Fr&page=3')).mockResolvedValueOnce(
		results([3]),
	);
	vi.stubGlobal('fetch', fetch);
	intersect();
	intersect();
	await vi.waitFor(() => {
		expect($$optional('.rgh-dashboard-row')).toHaveLength(1);
	});
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(fetch).toHaveBeenCalledWith(
		'https://github.com/issues/search?q=repo%3Ao%2Fr&page=2',
		expect.objectContaining({redirect: 'error', headers: {accept: 'text/html'}}),
	);
	intersect();
	await vi.waitFor(() => {
		expect($('.rgh-dashboard-infinite-scroll [role="status"]').textContent).toBe('End of results.');
	});
	intersect();
	expect(fetch).toHaveBeenCalledTimes(2);
	expect($$optional('.rgh-dashboard-row')).toHaveLength(2);
	expect(elementExists('a[rel="next"]')).toBe(true);
});

test('continues past a duplicate-only page to later unseen results', async () => {
	const fetch = vi.fn().mockResolvedValueOnce(results([1], '?q=repo%3Ao%2Fr&page=3')).mockResolvedValueOnce(
		results([2]),
	);
	vi.stubGlobal('fetch', fetch);
	intersect();
	await vi.waitFor(() => {
		expect($('.rgh-dashboard-infinite-scroll [role="status"]').textContent).toBe(
			'Loaded 0 more results. Scroll for more.',
		);
	});
	intersect();
	await vi.waitFor(() => {
		expect($$optional('.rgh-dashboard-row')).toHaveLength(1);
	});
	expect(fetch).toHaveBeenCalledTimes(2);
});

test('offers a manual retry after failure without a request loop', async () => {
	const fetch = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(results([2]));
	vi.stubGlobal('fetch', fetch);
	intersect();
	await vi.waitFor(() => {
		expect($('button', $('.rgh-dashboard-infinite-scroll')).hidden).toBe(false);
	});
	expect(fetch).toHaveBeenCalledTimes(1);
	$('button', $('.rgh-dashboard-infinite-scroll')).click();
	await vi.waitFor(() => {
		expect($$optional('.rgh-dashboard-row')).toHaveLength(1);
	});
	expect(fetch).toHaveBeenCalledTimes(2);
});

test('discards a response after React navigation and removes its controls', async () => {
	const pending = Promise.withResolvers<Response>();
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
	intersect();
	document.dispatchEvent(new Event('soft-nav:start'));
	pending.resolve(results([2]));
	await pending.promise;
	expect(elementExists('.rgh-dashboard-infinite-scroll')).toBe(false);
	expect(elementExists('.rgh-dashboard-row')).toBe(false);
});
