import {$, $$, elementExists} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import '../features/pull-request-hotkeys.js'; // eslint-disable-line import-x/no-unassigned-import -- Register the feature under test

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));

const loader = vi.mocked(features.add).mock.calls[0][1];
let controller: AbortController;

async function init(): Promise<void> {
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected a feature initializer');
	}

	await loader.init(controller.signal);
}

beforeEach(() => {
	controller = new AbortController();
	history.replaceState({}, '', '/refined-github/refined-github/pull/10361');
	document.body.innerHTML = `
		<nav aria-label="Pull request tabs">
			<a href="/refined-github/refined-github/pull/10361" aria-current="page">Conversation</a>
			<a href="/refined-github/refined-github/pull/10361/commits">Commits</a>
			<a href="/refined-github/refined-github/pull/10361/checks">Checks</a>
			<a href="/refined-github/refined-github/pull/10361/files" data-hotkey="old">Files changed</a>
		</nav>
	`;
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
	vi.restoreAllMocks();
});

test.each([
	['Pull request tabs', 'files'],
	['Pull request navigation', 'changes'],
	['Pull request navigation', 'changes/?base=main#diff'],
])('adds the Files changed alias after numbering %s (%s)', async (label, path) => {
	$('nav').setAttribute('aria-label', label);
	const files = $('nav a:last-child');
	files.href = '/refined-github/refined-github/pull/10361/' + path;
	await init();
	expect($$('nav a').map(tab => tab.dataset.hotkey)).toEqual(['g 1', 'g 2', 'g 3', 'g 4,g f']);
	expect(elementExists('[data-hotkey="g f"]')).toBe(false);
	expect(files.textContent).toBe('Files changed');
});

test.each([
	['g ArrowLeft', 3],
	['g ArrowRight', 1],
])('preserves adjacent-tab navigation with %s', async (hotkey, index) => {
	await init();
	const click = vi.spyOn($$('nav a')[index], 'click').mockImplementation(vi.fn());
	$(`button[data-hotkey="${hotkey}"]`).click();
	expect(click).toHaveBeenCalledOnce();
});

test.each([
	'data-testid="mergebox-partial"',
	'id="partial-pull-merging"',
])('resolves the asynchronously inserted merge area at activation (%s)', async attribute => {
	await init();
	document.body.insertAdjacentHTML('beforeend', `<div ${attribute}><button type="button">Merge</button></div>`);
	const mergeArea = $('div');
	const scroll = vi.spyOn(mergeArea, 'scrollIntoView');
	const focus = vi.spyOn(mergeArea, 'focus');
	const merge = vi.fn();
	$('div button').addEventListener('click', merge);
	$('button[data-hotkey="g l"]').click();

	expect(scroll).toHaveBeenCalledWith({block: 'center'});
	expect(focus).toHaveBeenCalledWith({preventScroll: true});
	expect(document.activeElement).toBe(mergeArea);
	expect(mergeArea.getAttribute('tabindex')).toBe('-1');
	expect(merge).not.toHaveBeenCalled();
	mergeArea.blur();
	expect(mergeArea.hasAttribute('tabindex')).toBe(false);
});

test('does nothing when the merge area is missing', async () => {
	await init();
	const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
	const focus = vi.spyOn(HTMLElement.prototype, 'focus');
	$('button[data-hotkey="g l"]').click();
	expect(scroll).not.toHaveBeenCalled();
	expect(focus).not.toHaveBeenCalled();
});

test.each(['-1', '0'])('preserves an existing tabindex of %s', async tabIndex => {
	await init();
	document.body.insertAdjacentHTML('beforeend', `<div data-testid="mergebox-partial" tabindex="${tabIndex}"></div>`);
	const mergeArea = $('div');
	$('button[data-hotkey="g l"]').click();
	expect(document.activeElement).toBe(mergeArea);
	mergeArea.blur();
	controller.abort();
	expect(mergeArea.getAttribute('tabindex')).toBe(tabIndex);
});

test.each(['files', 'changes', 'commits', 'checks'])('does not register the merge shortcut on /%s', async path => {
	history.replaceState({}, '', location.pathname + '/' + path);
	await init();
	expect(elementExists('button[data-hotkey="g l"]')).toBe(false);
	expect($('nav a:last-child').dataset.hotkey).toBe('g 4,g f');
});

test.each(['abort', 'soft-nav:start'])('removes registered shortcuts and temporary tabindex on %s', async event => {
	await init();
	document.body.insertAdjacentHTML('beforeend', '<div data-testid="mergebox-partial"></div>');
	const mergeArea = $('div');
	$('button[data-hotkey="g l"]').click();
	if (event === 'abort') {
		controller.abort();
	} else {
		document.dispatchEvent(new Event(event));
	}

	expect(elementExists('button[data-hotkey]')).toBe(false);
	expect(mergeArea.hasAttribute('tabindex')).toBe(false);
});

test('keeps one Files changed alias and one merge shortcut on retained navigation', async () => {
	await init();
	document.dispatchEvent(new Event('soft-nav:start'));
	controller.abort();
	controller = new AbortController();
	await init();
	expect($('nav a:last-child').dataset.hotkey).toBe('g 4,g f');
	expect($$('button[data-hotkey="g l"]')).toHaveLength(1);
});

test('does not update tab shortcuts after navigation interrupts initialization', async () => {
	const initializing = init();
	document.dispatchEvent(new Event('soft-nav:start'));
	await initializing;
	expect($('nav a:last-child').dataset.hotkey).toBe('old');
	expect(elementExists('button[data-hotkey]')).toBe(false);
});

test('does not steal focus from an editor when shortcuts are registered', async () => {
	document.body.insertAdjacentHTML('beforeend', '<textarea>gf gl</textarea>');
	const editor = $('textarea');
	editor.focus();
	await init();

	expect(document.activeElement).toBe(editor);
	expect(editor.value).toBe('gf gl');
	expect($('button[data-hotkey="g l"]').hidden).toBe(true);
	expect($('button[data-hotkey="g l"]').type).toBe('button');
});
