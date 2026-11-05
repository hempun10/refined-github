import {$, $$, elementExists} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import observe from './selector-observer.js';
import '../features/copy-pr-url.js'; // eslint-disable-line import-x/no-unassigned-import -- Register the feature under test

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('./selector-observer.js', () => ({default: vi.fn()}));

const loader = vi.mocked(features.add).mock.calls[0][1];
let controller: AbortController;

beforeEach(async () => {
	controller = new AbortController();
	history.replaceState({}, '', '/owner/repo/pull/123/files?diff=split#diff-example');
	document.body.innerHTML = '<div data-component="PH_Actions"></div>';
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected a feature initializer');
	}

	await loader.init(controller.signal);
	const add = vi.mocked(observe).mock.calls[0][1];
	add($('[data-component="PH_Actions"]'), {signal: controller.signal});
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
	vi.unstubAllGlobals();
});

test('copies the canonical PR URL and announces success', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal('navigator', {clipboard: {writeText}, userAgent: ''});
	$('.rgh-copy-pr-url').click();
	await vi.waitFor(() => {
		expect(writeText).toHaveBeenCalledWith('https://github.com/owner/repo/pull/123');
		expect($('.rgh-copy-pr-url-status').textContent).toBe('Copied!');
	});
});

test('does not duplicate the button and removes it on navigation', () => {
	const add = vi.mocked(observe).mock.calls[0][1];
	add($('[data-component="PH_Actions"]'), {signal: controller.signal});
	expect($$('.rgh-copy-pr-url', document)).toHaveLength(1);
	controller.abort();
	expect(elementExists('.rgh-copy-pr-url')).toBe(false);
});

test('leaves a visible native copy action alone', () => {
	const header = $('[data-component="PH_Actions"]');
	header.textContent = '';
	const native = document.createElement('button');
	native.setAttribute('aria-label', 'Copy link');
	header.append(native);
	vi.spyOn(native, 'getClientRects').mockReturnValue(Object.assign([new DOMRect()], {item: () => new DOMRect()}));
	const add = vi.mocked(observe).mock.calls[0][1];
	add(header, {signal: controller.signal});
	expect(elementExists('.rgh-copy-pr-url')).toBe(false);
});

test('announces clipboard failures without claiming a copy', async () => {
	vi.stubGlobal('navigator', {clipboard: {writeText: vi.fn().mockRejectedValue(new Error('Denied'))}, userAgent: ''});
	$('.rgh-copy-pr-url').click();
	await vi.waitFor(() => {
		expect($('.rgh-copy-pr-url-status').textContent).toBe('Copy failed. Retry');
	});
});
