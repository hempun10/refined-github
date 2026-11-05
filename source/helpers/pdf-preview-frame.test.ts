import {$, $optional} from 'select-dom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import * as pdfPreview from './pdf-preview.js';

vi.mock('./pdf-preview.js', async importOriginal => ({
	...await importOriginal<typeof pdfPreview>(),
	fetchPdf: vi.fn(),
}));

const hasPermission = vi.fn(async () => true);
const requestPermission = vi.fn(async () => true);

let message: (event: MessageEvent<unknown>) => unknown;
let pagehide: EventListener;
let keydown: (event: KeyboardEvent) => unknown;

beforeEach(async () => {
	vi.resetModules();
	document.body.innerHTML =
		'<section id="access" hidden><button id="allow">Allow PDF file access</button></section><p role="status"></p>';
	hasPermission.mockResolvedValue(true);
	requestPermission.mockResolvedValue(true);
	vi.stubGlobal('chrome', {permissions: {contains: hasPermission, request: requestPermission}});
	vi.mocked(pdfPreview.fetchPdf).mockResolvedValue(new TextEncoder().encode('%PDF-1.7').buffer);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-preview');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(vi.fn());
	vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(vi.fn());
	vi.spyOn(globalThis, 'postMessage').mockImplementation(vi.fn());
	const events = vi.spyOn(globalThis, 'addEventListener').mockImplementation(vi.fn());
	await import('../pdf-preview.js');
	const listener = events.mock.calls.find(([type]) => type === 'message')?.[1];
	const cleanup = events.mock.calls.find(([type]) => type === 'pagehide')?.[1];
	if (typeof listener !== 'function' || typeof cleanup !== 'function') {
		throw new TypeError('Expected PDF viewer listeners');
	}

	message = listener;
	pagehide = cleanup;
	events.mockImplementation((type, callback) => {
		if (type === 'keydown' && typeof callback === 'function') {
			keydown = callback;
		}
	});
});

afterEach(() => {
	pagehide(new Event('pagehide'));
	document.body.textContent = '';
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function payload(
	url = 'https://github.com/owner/repo/blob/main/example.pdf',
	origin = 'https://github.com',
	source: MessageEventInit['source'] = globalThis.parent,
): MessageEvent<unknown> {
	return new MessageEvent('message', {data: {type: 'rgh-pdf-preview', url}, origin, source});
}

test('loads a validated file with existing access and revokes its blob on exit', async () => {
	await message(payload());
	expect(pdfPreview.fetchPdf).toHaveBeenCalledWith(
		new URL('https://github.com/owner/repo/blob/main/example.pdf'),
		expect.any(AbortSignal),
	);
	expect(URL.createObjectURL).toHaveBeenCalledOnce();
	expect($optional('iframe')?.title).toBe('PDF document');
	pagehide(new Event('pagehide'));
	expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf-preview');
	const signal = vi.mocked(pdfPreview.fetchPdf).mock.calls[0][1];
	expect(signal.aborted).toBe(true);
});

test.each([
	['https://evil.example/file.pdf', 'https://github.com', globalThis.parent],
	['https://github.com/owner/repo/blob/main/file.txt', 'https://github.com', globalThis.parent],
	['https://github.com/owner/repo/blob/main/file.pdf', 'https://github.com', null],
	['https://github.com/owner/repo/blob/main/file.pdf', 'null', globalThis.parent],
])('rejects invalid URLs or sender identity', async (url, origin, source) => {
	await message(payload(url, origin, source));
	expect(pdfPreview.fetchPdf).not.toHaveBeenCalled();
});

test('rejects a parent without host permission', async () => {
	hasPermission.mockResolvedValueOnce(false);
	await message(payload());
	expect(pdfPreview.fetchPdf).not.toHaveBeenCalled();
});

test('asks only from an explicit click and then loads the PDF', async () => {
	hasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
	await message(payload());
	expect($('#access').hidden).toBe(false);
	expect(chrome.permissions.request).not.toHaveBeenCalled();
	expect(pdfPreview.fetchPdf).not.toHaveBeenCalled();
	$('#allow').click();
	await vi.waitFor(() => {
		expect(URL.createObjectURL).toHaveBeenCalledOnce();
	});
	expect(chrome.permissions.request).toHaveBeenCalledWith({
		origins: ['https://objects.githubusercontent.com/*', 'https://raw.githubusercontent.com/*'],
	});
});

test('keeps a denied grant retryable without downloading the PDF', async () => {
	hasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
	requestPermission.mockResolvedValueOnce(false);
	await message(payload());
	$('#allow').click();
	await vi.waitFor(() => {
		expect($('[role="status"]').textContent).toContain('Access was not granted');
	});
	expect(pdfPreview.fetchPdf).not.toHaveBeenCalled();
	expect($<HTMLButtonElement>('#allow').disabled).toBe(false);
});

test('shows download failures and permits a retry', async () => {
	vi.mocked(pdfPreview.fetchPdf).mockRejectedValueOnce(new Error('Could not load the PDF.'));
	await message(payload());
	expect($('[role="status"]').textContent).toBe('Could not load the PDF.');
	expect($('#access').hidden).toBe(false);
	$('#allow').click();
	await vi.waitFor(() => {
		expect(URL.createObjectURL).toHaveBeenCalledOnce();
	});
});

test('forwards Escape from the permission UI to the trusted parent only', async () => {
	hasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
	await message(payload());
	keydown(new KeyboardEvent('keydown', {key: 'Escape'}));
	expect(window.postMessage).toHaveBeenCalledWith({type: 'rgh-pdf-close'}, 'https://github.com');
});

test('ignores replacement messages, including concurrent authorization checks', async () => {
	const gate = Promise.withResolvers<boolean>();
	hasPermission.mockReturnValue(gate.promise);
	const first = message(payload());
	const second = message(payload());
	gate.resolve(true);
	await Promise.all([first, second]);
	await message(payload());
	expect(pdfPreview.fetchPdf).toHaveBeenCalledOnce();
	expect(URL.createObjectURL).toHaveBeenCalledOnce();
});
