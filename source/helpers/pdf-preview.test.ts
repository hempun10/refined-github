import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import {fetchPdf, getPdfUrl, isPdfBuffer, maximumPdfSize} from './pdf-preview.js';

const base = 'https://github.com/owner/repo/issues/1';
const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

test.each([
	'https://github.com/user-attachments/files/123/document.PDF',
	'https://github.com/owner/repo/files/123/document.pdf',
	'https://github.com/owner/repo/blob/main/document.pdf?raw=true',
	'https://raw.githubusercontent.com/owner/repo/main/document.pdf',
])('recognizes GitHub PDF sources: %s', href => {
	expect(getPdfUrl(href, base)?.href).toBe(href);
});

test.each([
	// eslint-disable-next-line no-script-url -- Verify script URLs are rejected.
	'javascript:alert(1)',
	// eslint-disable-next-line unicorn/prefer-https -- Verify insecure attachment links are rejected.
	'http://github.com/user-attachments/files/1/document.pdf',
	'https://github.com.evil.test/owner/repo/blob/main/document.pdf',
	'https://raw.githubusercontent.com.evil.test/owner/repo/main/document.pdf',
	'https://raw.githubusercontent.com:8443/owner/repo/main/document.pdf',
	'https://example.com/document.pdf',
	'https://github.com/owner/repo/edit/main/document.pdf',
	'https://github.com/user-attachments/files/1/document.html',
	'https://user:password@github.com/user-attachments/files/1/document.pdf',
])('leaves unsafe or unrelated links alone: %s', href => {
	expect(getPdfUrl(href, base)).toBeUndefined();
});

test('accepts only bounded PDF byte buffers', () => {
	expect(isPdfBuffer(new TextEncoder().encode('%PDF-1.7').buffer)).toBe(true);
	expect(isPdfBuffer(new TextEncoder().encode('<br>Warning\n%PDF-1.4').buffer)).toBe(true);
	expect(isPdfBuffer(new TextEncoder().encode('x'.repeat(1024) + '%PDF-1.4').buffer)).toBe(false);
	expect(isPdfBuffer(new TextEncoder().encode('<html>login</html>').buffer)).toBe(false);
	expect(isPdfBuffer(new ArrayBuffer(maximumPdfSize + 1))).toBe(false);
	expect(isPdfBuffer({byteLength: 10})).toBe(false);
	expect(isPdfBuffer({[Symbol.toStringTag]: 'ArrayBuffer', byteLength: 10})).toBe(false);
});

test('fetches the raw file using the current session and cancellation signal', async () => {
	fetchMock.mockResolvedValueOnce(new Response('%PDF-1.7'));
	const {signal} = new AbortController();
	const bytes = await fetchPdf(new URL('https://github.com/owner/repo/blob/main/file.pdf#page=2'), signal);
	expect(new TextDecoder().decode(bytes)).toBe('%PDF-1.7');
	expect(fetchMock).toHaveBeenCalledWith('https://github.com/owner/repo/raw/main/file.pdf', {
		credentials: 'include',
		signal,
	});
});

test('preserves a raw file whose branch is named blob', async () => {
	fetchMock.mockResolvedValueOnce(new Response('%PDF-1.7'));
	const url = 'https://raw.githubusercontent.com/owner/repo/blob/file.pdf';
	const {signal} = new AbortController();
	await fetchPdf(new URL(url), signal);
	expect(fetchMock).toHaveBeenCalledWith(url, {credentials: 'include', signal});
});

test('rejects login pages and failed responses', async () => {
	fetchMock.mockResolvedValueOnce(new Response('<html>login</html>'));
	await expect(fetchPdf(new URL('https://github.com/owner/repo/raw/main/file.pdf'), new AbortController().signal))
		.rejects.toThrow('did not return a PDF');
	fetchMock.mockResolvedValueOnce(new Response('', {status: 403}));
	await expect(fetchPdf(new URL('https://github.com/owner/repo/raw/main/file.pdf'), new AbortController().signal))
		.rejects.toThrow('Could not load');
});

test('rejects an oversized declared response before reading it', async () => {
	fetchMock.mockResolvedValueOnce(new Response('%PDF-', {headers: {'content-length': String(maximumPdfSize + 1)}}));
	await expect(fetchPdf(new URL('https://github.com/owner/repo/raw/main/file.pdf'), new AbortController().signal))
		.rejects.toThrow('50 MB');
});

test('caps streamed responses even without a content-length header', async () => {
	const cancel = vi.fn();
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(maximumPdfSize + 1));
		},
		cancel,
	});
	fetchMock.mockResolvedValueOnce(new Response(body));
	await expect(fetchPdf(new URL('https://github.com/owner/repo/raw/main/file.pdf'), new AbortController().signal))
		.rejects.toThrow('50 MB');
	expect(cancel).toHaveBeenCalledOnce();
});
