import {afterEach, expect, test, vi} from 'vitest';

afterEach(() => {
	vi.unstubAllGlobals();
});

test.each(['objects.githubusercontent.com', 'raw.githubusercontent.com'])(
	'does not initialize GitHub features on the PDF file host %s',
	async host => {
		vi.resetModules();
		vi.stubGlobal('location', new URL('https://' + host + '/file.pdf'));
		vi.stubGlobal('chrome', undefined);
		const entry = '../content-script.ts';
		await expect(import(entry)).resolves.toBeDefined();
	},
);
