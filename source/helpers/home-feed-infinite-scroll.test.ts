import * as pageDetect from 'github-url-detection';
import {$} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import observe from './selector-observer.js';
import '../features/dashboard-infinite-scroll.js'; // eslint-disable-line import-x/no-unassigned-import -- Register the feature under test

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('./selector-observer.js', () => ({default: vi.fn()}));

const [, ...loaders] = vi.mocked(features.add).mock.calls[0];
const loader = loaders.find(loader => loader.include?.includes(pageDetect.isHome));
let controller: AbortController;
let intersect = (_target: Element, _isIntersecting?: boolean): void => {
	throw new Error('Observer not initialized');
};

const observeButton = vi.fn();
const unobserveButton = vi.fn();
const disconnect = vi.fn();

beforeEach(async () => {
	controller = new AbortController();
	history.replaceState({}, '', '/dashboard');
	document.body.innerHTML =
		'<main><turbo-frame id="conduit-feed-frame"><article>Feed item</article><form class="ajax-pagination-form" method="get" action="/conduit/for_you_feed?page=2"><button class="ajax-pagination-btn" type="submit">More</button></form></turbo-frame></main>';
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			observe = observeButton;
			unobserve = unobserveButton;
			disconnect = disconnect;
			constructor(callback: (entries: Array<{target: Element; isIntersecting: boolean}>) => void) {
				intersect = (target, isIntersecting = true) => {
					callback([{target, isIntersecting}]);
				};
			}
		},
	);
	if (!loader || typeof loader.init !== 'function') {
		throw new TypeError('Missing home activity feed loader');
	}

	await loader.init(controller.signal);
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
	vi.unstubAllGlobals();
});

test('loads the native More control once when it enters the viewport', () => {
	const button = $('button.ajax-pagination-btn');
	const click = vi.fn((event: Event) => {
		event.preventDefault();
	});
	button.addEventListener('click', click);
	expect(observeButton).toHaveBeenCalledWith(button);
	intersect(button, false);
	expect(click).not.toHaveBeenCalled();
	intersect(button);
	intersect(button);
	expect(click).toHaveBeenCalledTimes(1);
	expect(unobserveButton).toHaveBeenCalledWith(button);
});

test('observes replacement More controls without touching feed cards', () => {
	const replacement = document.createElement('button');
	replacement.type = 'button';
	replacement.className = 'ajax-pagination-btn';
	$('form').replaceChildren(replacement);
	vi.mocked(observe).mock.calls[0][1](replacement, {signal: controller.signal});
	expect(observeButton).toHaveBeenCalledWith(replacement);
	expect($('article').textContent).toBe('Feed item');
});

test('leaves disabled controls alone and keeps manual retry possible', () => {
	const button = $('button.ajax-pagination-btn');
	const click = vi.fn((event: Event) => {
		event.preventDefault();
	});
	button.addEventListener('click', click);
	button.disabled = true;
	intersect(button);
	expect(click).not.toHaveBeenCalled();
	button.disabled = false;
	intersect(button);
	button.click();
	expect(click).toHaveBeenCalledTimes(2);
});

test('reobserves a retained More control on a new home-feed visit', async () => {
	const button = $('button.ajax-pagination-btn');
	document.dispatchEvent(new Event('soft-nav:start'));
	controller = new AbortController();
	if (!loader || typeof loader.init !== 'function') {
		throw new TypeError('Missing home activity feed loader');
	}

	await loader.init(controller.signal);
	expect($('button.ajax-pagination-btn')).toBe(button);
	expect(observeButton).toHaveBeenNthCalledWith(2, button);
});

test('disconnects and ignores queued observations when navigation starts', () => {
	const button = $('button.ajax-pagination-btn');
	const click = vi.fn((event: Event) => {
		event.preventDefault();
	});
	button.addEventListener('click', click);
	document.dispatchEvent(new Event('soft-nav:start'));
	intersect(button);
	expect(disconnect).toHaveBeenCalled();
	expect(click).not.toHaveBeenCalled();
});
