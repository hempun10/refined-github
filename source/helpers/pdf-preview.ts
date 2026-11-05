export const maximumPdfSize = 50_000_000;

export function getPdfUrl(href: string, base = location.href): URL | undefined {
	let url: URL;
	try {
		url = new URL(href, base);
	} catch {
		return;
	}

	if (url.protocol !== 'https:' || url.username || url.password || !/\.pdf$/i.test(url.pathname)) {
		return;
	}

	const sameOrigin = url.origin === new URL(base).origin;
	const githubFile = /^\/(?:user-attachments\/files\/|[^/]+\/[^/]+\/(?:files|blob|raw)\/)/.test(url.pathname);
	return (sameOrigin && githubFile) || url.origin === 'https://raw.githubusercontent.com' ? url : undefined;
}

export function isPdfBuffer(value: unknown): value is ArrayBuffer {
	try {
		// Native getters validate buffers across realms without trusting a spoofed object tag.
		const size: unknown = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get?.call(value);
		return typeof size === 'number' && size >= 5 && size <= maximumPdfSize
			// PDF readers accept a header anywhere in the first 1024 bytes
			&& new TextDecoder().decode(ArrayBuffer.prototype.slice.call(value, 0, 1024)).includes('%PDF-');
	} catch {
		return false;
	}
}

export async function fetchPdf(url: URL, signal: AbortSignal): Promise<ArrayBuffer> {
	const download = new URL(url);
	const parts = download.pathname.split('/');
	if (download.origin !== 'https://raw.githubusercontent.com' && parts[3] === 'blob') {
		parts[3] = 'raw';
		download.pathname = parts.join('/');
	}

	download.hash = '';
	const response = await fetch(download.href, {credentials: 'include', signal});
	if (!response.ok || !response.body) {
		throw new Error('Could not load the PDF. Use the original PDF link.');
	}

	const reader = response.body.getReader();
	const chunks: BlobPart[] = [];
	let size = 0;
	try {
		if (Number(response.headers.get('content-length')) > maximumPdfSize) {
			await reader.cancel();
			throw new Error('The PDF exceeds the 50 MB preview limit.');
		}

		for (;;) {
			// eslint-disable-next-line no-await-in-loop -- Stream reads must stay serialized and bounded.
			const {done, value} = await reader.read();
			if (done) {
				break;
			}

			size += value.byteLength;
			if (size > maximumPdfSize) {
				// eslint-disable-next-line no-await-in-loop -- Stop the stream before rejecting an oversized preview.
				await reader.cancel();
				throw new Error('The PDF exceeds the 50 MB preview limit.');
			}

			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = await new Blob(chunks).arrayBuffer();
	if (!isPdfBuffer(bytes)) {
		throw new Error('This link did not return a PDF. Use the original PDF link.');
	}

	return bytes;
}
