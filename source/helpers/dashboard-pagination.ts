import {$$optional, $optional} from 'select-dom';

export function getNextDashboardPage(link: HTMLAnchorElement | undefined, current: string): string | undefined {
	if (!link || link.getAttribute('aria-disabled') === 'true') {
		return;
	}

	const href = link.getAttribute('href');
	if (!href || !URL.canParse(href, current)) {
		return;
	}

	const base = new URL(current);
	const next = new URL(href, base);
	// Global PR pagination can render #2 before React replaces it with a page query.
	if (/^#[1-9]\d*$/.test(href)) {
		next.searchParams.set('page', href.slice(1));
	}

	for (const key of new Set(base.searchParams.keys())) {
		if (key === 'page' || next.searchParams.has(key)) {
			continue;
		}

		for (const value of base.searchParams.getAll(key)) {
			next.searchParams.append(key, value);
		}
	}

	next.hash = '';
	base.hash = '';
	if (next.origin !== base.origin || next.pathname !== base.pathname || next.href === base.href) {
		return;
	}

	return next.href;
}

export function getDashboardRows(
	document: Document,
	pageUrl: string,
): Array<{url: string; title: string; description: string}> {
	const {origin} = new URL(pageUrl);
	return $$optional('li[class*="listItem"]', document).flatMap(row => {
		const link = $optional('h3 a[href]', row);
		if (!link || !URL.canParse(link.getAttribute('href')!, pageUrl)) {
			return [];
		}

		const url = new URL(link.getAttribute('href')!, pageUrl);
		const title = link.textContent.trim();
		if (!title || url.origin !== origin || !/^\/[^/]+\/[^/]+\/(?:pull|issues)\/[1-9]\d*$/.test(url.pathname)) {
			return [];
		}

		url.search = '';
		url.hash = '';
		const metadata = $optional('[class*="leftMetadata"]', row);
		return {url: url.href, title, description: metadata?.textContent.trim() ?? ''};
	});
}
