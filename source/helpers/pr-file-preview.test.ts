import {$, $$, $optional} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import features from '../feature-manager.js';
import {getDiffRows, getRawUrl, highlightLines, splitHighlightedLines} from '../features/pr-file-preview.js';
import observe from './selector-observer.js';

vi.mock('../feature-manager.js', () => ({default: {add: vi.fn()}}));
vi.mock('./selector-observer.js', () => ({default: vi.fn()}));
vi.mock('octicons-plain-react/Eye', () => ({
	default: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
}));

const loader = vi.mocked(features.add).mock.calls[0][1];
const blob = 'https://github.com/owner/repo/blob/head123/src/app.ts';
let controller: AbortController;

function header(path: string, title = path): HTMLElement {
	const element = document.createElement('div');
	element.className = 'file-header';
	element.dataset.path = path;
	element.innerHTML = `<div class="file-info"><a title="${title}">${title}</a></div>`
		+ `<div class="file-actions"><details class="js-file-header-dropdown"><a href="/owner/repo/blob/head123/${path}">View file</a></details></div>`;
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

function text(body: string, status = 200): Response {
	return new Response(status === 404 ? null : body, {status, headers: {'content-type': 'text/plain'}});
}

beforeEach(() => {
	controller = new AbortController();
	HTMLDialogElement.prototype.showModal ??= vi.fn();
	HTMLDialogElement.prototype.close ??= vi.fn();
	document.body.innerHTML =
		'<include-fragment src="/owner/repo/pull/1/show_toc?base_sha=base456&amp;sha2=head123"></include-fragment>';
});

afterEach(() => {
	controller.abort();
	document.body.textContent = '';
	vi.unstubAllGlobals();
});

test('builds raw links for the PR file and its original revision', () => {
	expect(getRawUrl(blob + '#L4')).toBe('https://github.com/owner/repo/raw/head123/src/app.ts');
	expect(getRawUrl(blob, 'base456', 'old dir/app.ts')).toBe(
		'https://github.com/owner/repo/raw/base456/old%20dir/app.ts',
	);
});

test('keeps highlight spans valid on every line', () => {
	expect(splitHighlightedLines('<span class="a">one\ntwo</span>\nthree')).toEqual([
		'<span class="a">one</span>',
		'<span class="a">two</span>',
		'three',
	]);
});

test('highlights known languages safely and leaves unknown files escaped', async () => {
	const [code] = await highlightLines("const tag = '<script>';", 'src/app.tsx');
	expect(code).toContain('<span class="hljs-keyword">const</span>');
	expect(code).not.toContain('<script>');
	expect(await highlightLines('<b>\nx\n', 'notes.unknownext')).toEqual(['&lt;b&gt;', 'x']);
});

test('lines up removed, added, and unchanged lines with both line numbers', async () => {
	const rows = await getDiffRows('a\nb\nc\n', 'a\nB\nc\nd\n', ['a', 'b', 'c'], ['a', 'B', 'c', 'd']);
	expect(rows).toEqual([
		{type: 'same', old: 1, new: 1, html: 'a'},
		{type: 'removed', old: 2, html: 'b'},
		{type: 'added', new: 2, html: 'B'},
		{type: 'same', old: 3, new: 3, html: 'c'},
		{type: 'added', new: 4, html: 'd'},
	]);
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
	expect($optional('.rgh-file-preview-button', pdf)).toBeUndefined();
});

test('shows the full diff first and the original file in a second tab', async () => {
	const fetchMock = vi.fn(async (url: string) =>
		text(url.includes('/raw/base456/src/old.ts') ? 'one\ntwo\n' : 'one\nTWO\n')
	);
	vi.stubGlobal('fetch', fetchMock);
	const add = await init();
	add(header('src/app.ts', 'src/old.ts → src/app.ts'));

	$('.rgh-file-preview-button').click();
	await vi.waitFor(() => {
		expect($$('[role="tab"]').map(tab => tab.textContent)).toEqual(['Full diff', 'Original file']);
	});
	expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/raw/base456/src/old.ts', expect.anything());
	const [diff, original] = $$('[role="tabpanel"]');
	expect($$('.rgh-file-preview-line', diff).map(line => line.dataset.type)).toEqual(['same', 'removed', 'added']);
	expect(original.hidden).toBe(true);

	$$('[role="tab"]')[1].click();
	expect(diff.hidden).toBe(true);
	expect(original.hidden).toBe(false);
	expect($$('[role="tab"]')[1].getAttribute('aria-selected')).toBe('true');
	expect($$('.rgh-file-preview-line', original).map(line => line.textContent)).toEqual(['one', 'two']);
});

test('treats a missing original as a new file', async () => {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('base456') ? text('', 404) : text('new\n')));
	const add = await init();
	add(header('src/app.ts'));
	$('.rgh-file-preview-button').click();
	await vi.waitFor(() => {
		expect($$('[role="tabpanel"]')).toHaveLength(2);
	});
	expect($$('.rgh-file-preview-line').map(line => line.dataset.type)).toEqual(['added']);
	expect($$('[role="tabpanel"]')[1].textContent).toBe('This file is new in this pull request.');
});

test('rejects files that are not text', async () => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response('x', {headers: {'content-type': 'image/png'}})));
	const add = await init();
	add(header('src/app.ts'));
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
