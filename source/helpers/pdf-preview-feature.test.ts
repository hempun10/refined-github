import {$, $$, $optional} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import observe from './selector-observer.js';
import '../features/pdf-preview.js'; // eslint-disable-line import-x/no-unassigned-import -- Register the feature under test

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('./selector-observer.js', () => ({default: vi.fn()}));
vi.mock('octicons-plain-react/Eye', () => ({
	default: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
}));

const loader = vi.mocked(features.add).mock.calls[0][1];
let controller: AbortController;

beforeEach(() => {
	controller = new AbortController();
	Object.defineProperty(navigator, 'pdfViewerEnabled', {configurable: true, value: true});
	// eslint-disable-next-line @typescript-eslint/naming-convention -- Match the browser API.
	vi.stubGlobal('chrome', {runtime: {getURL: vi.fn(() => 'https://extension.example/assets/pdf-preview.html')}});
	vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(vi.fn());
	vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(globalThis.window);
	vi.spyOn(globalThis, 'postMessage').mockImplementation(vi.fn());
	document.body.innerHTML =
		'<main><div class="markdown-body"><a href="/user-attachments/files/123/example.pdf">example.pdf</a></div></main>';
});

afterEach(() => {
	controller.abort();
	Reflect.deleteProperty(navigator, 'pdfViewerEnabled');
	document.body.textContent = '';
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function init(): Promise<void> {
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected PDF preview initializer');
	}

	await loader.init(controller.signal);
}

test('opens attachments in an extension modal and closes it on navigation', async () => {
	await init();
	const event = new MouseEvent('click', {bubbles: true, cancelable: true});
	$('a').dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	expect($('dialog[open]').getAttribute('aria-label')).toBe('PDF preview');
	$('iframe').dispatchEvent(new Event('load'));
	expect(window.postMessage).toHaveBeenCalledWith(
		{type: 'rgh-pdf-preview', url: 'https://github.com/user-attachments/files/123/example.pdf'},
		'https://extension.example',
	);
	document.dispatchEvent(new Event('soft-nav:start'));
	expect($optional('dialog')).toBeUndefined();
});

test('accepts Escape forwarding only from its own extension frame', async () => {
	await init();
	$('a').click();
	globalThis.dispatchEvent(
		new MessageEvent('message', {
			data: {type: 'rgh-pdf-close'},
			origin: 'https://evil.example',
			source: globalThis.window,
		}),
	);
	expect($('dialog[open]')).toBeDefined();
	globalThis.dispatchEvent(
		new MessageEvent('message', {
			data: {type: 'rgh-pdf-close'},
			origin: 'https://extension.example',
			source: globalThis.window,
		}),
	);
	expect($optional('dialog')).toBeUndefined();
});

test('adds an eye control to file rows and recreates it after retained-node navigation', async () => {
	document.body.innerHTML =
		'<main><div class="react-directory-filename-column"><div><a href="/owner/repo/blob/main/file.pdf">file.pdf</a></div></div></main>';
	await init();
	expect($('.rgh-pdf-preview-button').getAttribute('aria-label')).toBe('Preview PDF');
	expect($('.rgh-pdf-preview-button').title).toBe('Preview PDF');
	controller.abort();
	expect($optional('.rgh-pdf-preview-button')).toBeUndefined();
	controller = new AbortController();
	await init();
	expect($$('.rgh-pdf-preview-button')).toHaveLength(1);
});

test.each([{ctrlKey: true}, {metaKey: true}, {shiftKey: true}])(
	'preserves modified PDF clicks: %o',
	async modifiers => {
		await init();
		const event = new MouseEvent('click', {bubbles: true, cancelable: true, ...modifiers});
		$('a').dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect($optional('dialog')).toBeUndefined();
	},
);

test('does not open non-PDF links or a second modal', async () => {
	await init();
	$('a').href = '/owner/repo/blob/main/readme.md';
	$('a').click();
	expect($optional('dialog')).toBeUndefined();
	$('a').href = '/user-attachments/files/123/example.pdf';
	const existing = document.createElement('dialog');
	document.body.append(existing);
	existing.showModal();
	$('a').click();
	expect($$('dialog')).toHaveLength(1);
});

test('keeps native links when the built-in PDF viewer is disabled', async () => {
	Object.defineProperty(navigator, 'pdfViewerEnabled', {configurable: true, value: false});
	await init();
	const event = new MouseEvent('click', {bubbles: true, cancelable: true});
	$('a').dispatchEvent(event);
	expect(event.defaultPrevented).toBe(false);
	expect($optional('dialog')).toBeUndefined();
});

test('keeps the original-file fallback if the extension viewer cannot open', async () => {
	vi.mocked(chrome.runtime.getURL).mockImplementationOnce(() => {
		throw new Error('Could not open the preview.');
	});
	await init();
	$('a').click();
	expect($('[role="status"]').textContent).toBe('Could not open the preview.');
	expect($('dialog a').textContent).toBe('Open original PDF');
	$('dialog').close();
	expect($optional('dialog')).toBeUndefined();
});

test('adds a preview control to diff headers loaded after initialization', async () => {
	await init();
	const header = document.createElement('div');
	header.className = 'file-header';
	header.innerHTML = '<details hidden><a href="/owner/repo/blob/abc/file.pdf">View file</a></details>';
	$('main').append(header);
	const headerObserver = vi.mocked(observe).mock.calls.find(([selector]) => selector === '.file-header');
	headerObserver?.[1](header, {});
	expect($('.rgh-pdf-preview-button', header).getAttribute('href')).toBe(
		'https://github.com/owner/repo/blob/abc/file.pdf',
	);
});
