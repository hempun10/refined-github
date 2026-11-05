import {$, elementExists} from 'select-dom';
import {afterEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
// eslint-disable-next-line import-x/no-unassigned-import -- Register the features under test
import '../features/copy-pr-url.js';
// eslint-disable-next-line import-x/no-unassigned-import -- Register the features under test
import '../features/pr-bulk-actions.js';
// eslint-disable-next-line import-x/no-unassigned-import -- Register the features under test
import '../features/dashboard-infinite-scroll.js';

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('dom-loaded', () => ({default: Promise.resolve()}));
vi.mock('./caller-id.js', () => ({default: () => 'retained-node'}));
vi.mock('./errors.js', () => ({parseFeatureNameFromStack: () => undefined}));
vi.mock('../options-storage.js', () => ({default: {getAll: vi.fn().mockResolvedValue({logging: false})}}));
vi.mock('./open-tabs.js', () => ({default: vi.fn()}));

const registrations = [...vi.mocked(features.add).mock.calls];
const controllers: AbortController[] = [];

afterEach(() => {
	for (const controller of controllers) {
		controller.abort();
	}

	controllers.length = 0;
	document.body.textContent = '';
	vi.unstubAllGlobals();
});

test.each([
	{
		id: 'copy-pr-url',
		fixture: '<main><div data-component="PH_Actions"></div></main>',
		observed: '[data-component="PH_Actions"]',
		control: '.rgh-copy-pr-url',
	},
	{
		id: 'pr-bulk-actions',
		fixture: '<main><ul><li class="listItem"><h3><a href="/o/r/pull/1">PR</a></h3></li></ul></main>',
		observed: 'h3 a',
		control: '.rgh-pr-select',
	},
	{
		id: 'dashboard-infinite-scroll',
		fixture:
			'<main><ul><li class="listItem"><h3><a href="/o/r/issues/1">Issue</a></h3></li></ul><nav><a rel="next" href="?page=2">Next</a></nav></main>',
		observed: 'a[rel="next"]',
		control: '.rgh-dashboard-infinite-scroll',
	},
])('restores $id on retained nodes with the real selector observer', async ({id, fixture, observed, control}) => {
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			observe = vi.fn();
			unobserve = vi.fn();
			disconnect = vi.fn();
		},
	);
	history.replaceState({}, '', '/issues/search?q=repo%3Ao%2Fr');
	document.body.innerHTML = fixture;
	const loader = registrations.find(([url]) => url.includes(id))![1];
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected a feature initializer');
	}

	const first = new AbortController();
	controllers.push(first);
	await loader.init(first.signal);
	const retained = $(observed);
	const animation = Object.assign(new Event('animationstart', {bubbles: true}), {
		animationName: 'rgh-selector-observer',
	});
	retained.dispatchEvent(animation);
	expect(retained.classList.contains('rgh-seen-retained-node')).toBe(true);
	expect(elementExists(control)).toBe(true);
	document.dispatchEvent(new Event('soft-nav:start'));
	expect(elementExists(control)).toBe(false);

	const second = new AbortController();
	controllers.push(second);
	await loader.init(second.signal);
	expect($(observed)).toBe(retained);
	expect(elementExists(control)).toBe(true);
});
