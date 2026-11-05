import {$} from 'select-dom';
import {expect, test} from 'vitest';

import {getDashboardRows, getNextDashboardPage} from './dashboard-pagination.js';

const current = 'https://github.com/pulls/search?q=repo%3Ao%2Fr+sort%3Aupdated-desc';

function nextLink(href: string): HTMLAnchorElement {
	const link = document.createElement('a');
	link.href = href;
	return link;
}

test('follows real links and the observed PR hash pagination without losing filters', () => {
	expect(getNextDashboardPage(nextLink('?q=repo%3Ao%2Fr+sort%3Aupdated-desc&page=2'), current)).toBe(
		current + '&page=2',
	);
	expect(getNextDashboardPage(nextLink('#2'), current)).toBe(current + '&page=2');
	expect(getNextDashboardPage(undefined, current)).toBeUndefined();
});

// eslint-disable-next-line no-script-url -- Malicious pagination fixture
test.each(['https://evil.example/pulls/search?page=2', '/login', '#anything', 'javascript:alert(1)'])(
	'rejects unsafe or non-pagination URLs (%s)',
	href => {
		expect(getNextDashboardPage(nextLink(href), current)).toBeUndefined();
	},
);

test('retains the active query when the next link contains only a page number', () => {
	const next = new URL(getNextDashboardPage(nextLink('?page=2'), current)!);
	expect(next.searchParams.get('q')).toBe('repo:o/r sort:updated-desc');
	expect(next.searchParams.get('page')).toBe('2');
});

test('rejects disabled and cyclic pagination links', () => {
	const link = nextLink('?page=2');
	link.setAttribute('aria-disabled', 'true');
	expect(getNextDashboardPage(link, current)).toBeUndefined();
	expect(getNextDashboardPage(nextLink(current), current)).toBeUndefined();
});

test('extracts plain text and same-origin canonical links, not fetched controls or scripts', () => {
	const page = new DOMParser().parseFromString(
		`<ul>
		<li class="listItem"><h3><a href="/o/r/pull/42?x=1#comment"><b>A title</b></a></h3><div class="leftMetadata">#42 by author</div><script>throw 1</script><button onclick="evil()">Delete</button></li>
		<li class="listItem"><h3><a href="https://evil.example/o/r/pull/43">External</a></h3></li>
		<li class="listItem"><h3><a href="javascript:alert(1)">Unsafe</a></h3></li>
		<li class="listItem"><h3><a href="/o/r/issues/44">Issue title</a></h3></li>
	</ul>`,
		'text/html',
	);
	expect(getDashboardRows(page, current)).toEqual([
		{url: 'https://github.com/o/r/pull/42', title: 'A title', description: '#42 by author'},
		{url: 'https://github.com/o/r/issues/44', title: 'Issue title', description: ''},
	]);
	expect($('button', page).textContent).toBe('Delete');
});
