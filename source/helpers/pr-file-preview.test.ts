import {$, $$, $optional} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import {getRawUrl, highlight} from '../features/pr-file-preview.js';
import observe from './selector-observer.js';

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('./selector-observer.js', () => ({default: vi.fn()}));
vi.mock('octicons-plain-react/Eye', () => ({
	default: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
}));

const loader = vi.mocked(features.add).mock.calls[0][1];
const blob = 'https://github.com/owner/repo/blob/abc123/src/app.ts';
let controller: AbortController;

function header(path: string): HTMLElement {
	const element = document.createElement('div');
	element.className = 'file-header';
	element.dataset.path = path;
	element.innerHTML =
		`<div class="file-actions"><details class="js-file-header-dropdown"><a href="/owner/repo/blob/abc123/${path}">View file</a></details></div>`;
	document.body.append(element);
	return element;
}

async function init(): Promise<(element: HTMLElement) => void> {
	if (typeof loader.init !== 'function') {
		throw new TypeError('Expected initializer');
	}

	await loader.init(controller.signal);
	const callback = vi.mocked(observe).mock.calls.at(-1)![1];
	return element => {
		callback(element, {});
	};
}

beforeEach(() => {
	controller = new AbortController();
	HTMLDialogElement.prototype.showModal ??= vi.fn();
	HTMLDialogElement.prototype.close ??= vi.fn();
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
	vi.unstubAllGlobals();
});

test('converts blob links to raw links', () => {
	expect(getRawUrl(blob + '#L4')).toBe('https://github.com/owner/repo/raw/abc123/src/app.ts');
});

test('adds an eye button before the file menu, but not for PDFs', async () => {
	const add = await init();
	const file = header('src/app.ts');
	const pdf = header('docs/guide.pdf');
	add(file);
	add(file);
	add(pdf);
	expect($$('.rgh-file-preview-button', file)).toHaveLength(1);
	expect($('.rgh-file-preview-button', file).nextElementSibling?.matches('details')).toBe(true);
	expect($('.rgh-file-preview-button', file).getAttribute('aria-label')).toBe('Preview file');
	expect($optional('.rgh-file-preview-button', pdf)).toBeUndefined();
});

test('previews text with line numbers and rejects other types', async () => {
	const fetchMock = vi.fn()
		.mockResolvedValueOnce(new Response('one\ntwo\n', {headers: {'content-type': 'text/plain'}}))
		.mockResolvedValueOnce(new Response('x', {headers: {'content-type': 'image/png'}}));
	vi.stubGlobal('fetch', fetchMock);
	const add = await init();
	const file = header('src/app.ts');
	add(file);

	$('.rgh-file-preview-button').click();
	await vi.waitFor(() => {
		expect($('.rgh-file-preview-numbers').textContent).toBe('1\n2');
	});
	expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/raw/abc123/src/app.ts', expect.anything());
	expect($('dialog').getAttribute('aria-label')).toBe('Preview of src/app.ts');

	$('dialog').remove();
	$('.rgh-file-preview-button').click();
	await vi.waitFor(() => {
		expect($('[role="status"]').textContent).toBe('This file type can’t be previewed.');
	});
});

test('keeps modified clicks native', async () => {
	const add = await init();
	add(header('src/app.ts'));
	const event = new MouseEvent('click', {bubbles: true, cancelable: true, metaKey: true});
	$('.rgh-file-preview-button').dispatchEvent(event);
	expect(event.defaultPrevented).toBe(false);
	expect($optional('dialog')).toBeUndefined();
});

test('highlights known languages safely and leaves unknown files plain', async () => {
	const code = document.createElement('pre');
	await highlight(code, "const tag = '<script>alert(1)</script>';", 'src/app.tsx');
	expect($('.hljs-keyword', code).textContent).toBe('const');
	expect($optional('script', code)).toBeUndefined();
	expect(code.textContent).toBe("const tag = '<script>alert(1)</script>';");

	const plain = document.createElement('pre');
	plain.textContent = 'just text';
	await highlight(plain, 'just text', 'notes.unknownext');
	expect(plain.innerHTML).toBe('just text');
});
