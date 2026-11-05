import {elementExists} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import '../features/image-lightbox.js'; // eslint-disable-line import-x/no-unassigned-import -- Register the feature under test

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));

const loader = vi.mocked(features.add).mock.calls[0][1];
let controller: AbortController;

beforeEach(async () => {
	controller = new AbortController();
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected a feature initializer');
	}

	await loader.init(controller.signal);
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
});

function imageLink(href = 'https://example.com/image.png', width = 300): HTMLAnchorElement {
	const link = document.createElement('a');
	link.href = href;
	const image = document.createElement('img');
	image.src = 'https://example.com/image.png';
	image.width = width;
	image.height = 200;
	link.append(image);
	const body = document.createElement('div');
	body.className = 'markdown-body';
	body.append(link);
	document.body.append(body);
	return link;
}

test('opens a linked content image and removes the dialog on navigation', () => {
	const link = imageLink();
	const event = new MouseEvent('click', {bubbles: true, cancelable: true});
	link.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	expect(elementExists('dialog[open]')).toBe(true);
	controller.abort();
	expect(elementExists('dialog')).toBe(false);
});

test('closes the preview before React navigation', () => {
	imageLink().dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
	expect(elementExists('dialog[open]')).toBe(true);
	document.dispatchEvent(new Event('soft-nav:start'));
	expect(elementExists('dialog')).toBe(false);
});

test.each([
	['https://example.com/unrelated', 300, false],
	['https://example.com/image.png', 32, false],
	['https://example.com/image.png', 300, true],
])('preserves unrelated links, small images and modified clicks (%s, %i, %s)', (href, width, metaKey) => {
	const link = imageLink(href, width);
	const event = new MouseEvent('click', {bubbles: true, cancelable: true, metaKey});
	link.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(false);
	expect(elementExists('dialog')).toBe(false);
});
