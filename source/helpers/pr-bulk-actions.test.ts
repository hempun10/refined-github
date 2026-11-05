import {$, $$, elementExists} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import openTabs from './open-tabs.js';
import observe from './selector-observer.js';
import '../features/pr-bulk-actions.js'; // eslint-disable-line import-x/no-unassigned-import -- Register the feature under test

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('./selector-observer.js', () => ({default: vi.fn()}));
vi.mock('./open-tabs.js', () => ({default: vi.fn().mockResolvedValue(true)}));

const loader = vi.mocked(features.add).mock.calls[0][1];
let controller: AbortController;

beforeEach(async () => {
	controller = new AbortController();
	history.replaceState({}, '', '/owner/repo/pulls');
	document.body.innerHTML =
		'<main><ul><li class="listItem"><h3><a href="/owner/repo/pull/1">One</a></h3></li><li class="listItem"><input type="checkbox" aria-label="Native selection"><h3><a href="/owner/repo/pull/2">Two</a></h3></li></ul></main>';
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected a feature initializer');
	}

	await loader.init(controller.signal);
	const add = vi.mocked(observe).mock.calls[0][1];
	for (const link of $$('h3 a')) {
		add(link, {signal: controller.signal});
	}
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
	vi.unstubAllGlobals();
});

test('reuses native checkboxes and only shows the toolbar when selected', () => {
	expect($$('input[type="checkbox"]')).toHaveLength(2);
	expect($$('.rgh-pr-select')).toHaveLength(1);
	expect($('div.rgh-pr-bulk-actions').hidden).toBe(true);
	$('input.rgh-pr-select').click();
	expect($('div.rgh-pr-bulk-actions').hidden).toBe(false);
	expect($('.rgh-pr-bulk-actions [role="status"]').textContent).toBe('1 PR selected');
});

test('copies and opens only the selected URLs, then clears both kinds of checkbox', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal('navigator', {clipboard: {writeText}});
	for (const box of $$('input[type="checkbox"]')) {
		box.click();
	}

	$('.rgh-pr-copy').click();
	await vi.waitFor(() => {
		expect(writeText).toHaveBeenCalledWith('https://github.com/owner/repo/pull/1\nhttps://github.com/owner/repo/pull/2');
	});
	$('.rgh-pr-open').click();
	expect(openTabs).toHaveBeenCalledWith([
		'https://github.com/owner/repo/pull/1',
		'https://github.com/owner/repo/pull/2',
	]);
	$('.rgh-pr-clear').click();
	expect($('div.rgh-pr-bulk-actions').hidden).toBe(true);
	expect($$('input[type="checkbox"]').every(box => !box.checked)).toBe(true);
	controller.abort();
	expect($$('input[type="checkbox"]')).toHaveLength(1);
});

test('cleans up before React soft navigation', () => {
	document.dispatchEvent(new Event('soft-nav:start'));
	expect(elementExists('.rgh-pr-bulk-actions')).toBe(false);
	expect(elementExists('.rgh-pr-select')).toBe(false);
});

test('adds selection to dynamically inserted rows', () => {
	const row = document.createElement('li');
	row.className = 'listItem';
	row.innerHTML = '<h3><a href="/owner/repo/pull/3">Three</a></h3>';
	$('ul').append(row);
	vi.mocked(observe).mock.calls[0][1]($('a', row), {signal: controller.signal});
	expect($$('.rgh-pr-select')).toHaveLength(2);
});
