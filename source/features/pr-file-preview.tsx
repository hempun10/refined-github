import './pr-file-preview.css';

import {mergeSignals} from 'abort-utils';
import delegate, {type DelegateEvent} from 'delegate-it';
import React from 'dom-chef';
import {isAlteredClick} from 'filter-altered-clicks';
import * as pageDetect from 'github-url-detection';
import EyeIcon from 'octicons-plain-react/Eye';
import {$optional, closestElement, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import observe from '../helpers/selector-observer.js';

const maximumSize = 1_000_000;
// Ponytail: big files stay plain to keep the preview instant; highlight in a worker if that matters
const maximumHighlightSize = 200_000;
// Beyond this many changed lines the diff is too slow to compute in the page
const maximumEditLength = 5000;

type Row = {type: 'added' | 'removed' | 'same'; old?: number; new?: number; html: string};

export function getRawUrl(blobUrl: string, revision?: string, path?: string): string {
	const url = new URL(blobUrl);
	const parts = url.pathname.split('/');
	parts[3] = 'raw';
	if (revision && path) {
		parts.splice(4, Infinity, revision, ...path.split('/').map(part => encodeURIComponent(part)));
	}

	url.pathname = parts.join('/');
	url.hash = '';
	return url.href;
}

// Undefined when the file doesn't exist at that revision (added or deleted in the PR)
async function loadText(url: string, signal: AbortSignal): Promise<string | undefined> {
	const response = await fetch(url, {signal});
	if (response.status === 404) {
		return undefined;
	}

	if (!response.ok) {
		throw new Error('Could not load the file.');
	}

	// Null when the server omits Content-Type
	if (!response.headers.get('content-type')?.startsWith('text/')) {
		throw new Error('This file type can’t be previewed.');
	}

	const tooLarge = new Error('This file is too large to preview.');
	if (Number(response.headers.get('content-length')) > maximumSize) {
		throw tooLarge;
	}

	// Ponytail: compressed responses are read fully before this check; stream with a byte cap if huge files become common
	const text = await response.text();
	if (text.length > maximumSize) {
		throw tooLarge;
	}

	return text;
}

export function toLines(text: string): string[] {
	// Empty text (a missing side of an added or deleted file) has no lines
	return text === '' ? [] : text.replace(/\n$/, '').split('\n');
}

// Closes and reopens highlight spans at line breaks so each line is valid HTML on its own
export function splitHighlightedLines(html: string): string[] {
	const open: string[] = [];
	return html.split('\n').map(line => {
		const result = open.join('') + line;
		for (const [tag] of line.matchAll(/<span[^>]*>|<\/span>/g)) {
			if (tag === '</span>') {
				open.pop();
			} else {
				open.push(tag);
			}
		}

		return result + '</span>'.repeat(open.length);
	});
}

export async function highlightLines(text: string, path: string): Promise<string[]> {
	// Loaded on first preview only
	const {default: hljs} = await import('highlight.js/lib/common');
	const extension = path.split('/').pop()!.split('.').pop()!.toLowerCase();
	const language = text.length <= maximumHighlightSize && hljs.getLanguage(extension) ? extension : 'plaintext';
	// The highlighter escapes the source text
	const html = hljs.highlight(text, {language, ignoreIllegals: true}).value;
	return splitHighlightedLines(html).slice(0, toLines(text).length);
}

export async function getDiffRows(
	oldText: string,
	newText: string,
	oldHtml: string[],
	newHtml: string[],
): Promise<Row[] | undefined> {
	const {diffArrays} = await import('diff');
	const changes = diffArrays(toLines(oldText), toLines(newText), {maxEditLength: maximumEditLength});
	if (!changes) {
		return undefined;
	}

	let oldNumber = 0;
	let newNumber = 0;
	return changes.flatMap(change =>
		change.value.map((): Row => {
			if (change.removed) {
				oldNumber++;
				return {type: 'removed', old: oldNumber, html: oldHtml[oldNumber - 1]};
			}

			newNumber++;
			if (change.added) {
				return {type: 'added', new: newNumber, html: newHtml[newNumber - 1]};
			}

			oldNumber++;
			return {type: 'same', old: oldNumber, new: newNumber, html: newHtml[newNumber - 1]};
		})
	);
}

function renderRows(rows: Row[], label: string): HTMLElement {
	const lines = <div className="rgh-file-preview-lines" />;
	// Numbers are generated here and line HTML comes from the highlighter, which escapes the source
	lines.innerHTML = rows.map(row =>
		`<div class="rgh-file-preview-line" data-type="${row.type}" data-old="${row.old ?? ''}"><code data-new="${
			row.new ?? ''
		}">${row.html || ' '}</code></div>`
	).join('');
	// Single-version views only need one line number column
	lines.dataset.columns = rows.some(row => row.old) && rows.some(row => row.new) ? '2' : '1';
	return (
		<div className="rgh-file-preview-code" tabIndex={0} aria-label={label}>
			{lines}
		</div>
	);
}

function renderTabs(panels: Array<[name: string, content: HTMLElement]>): HTMLElement {
	const tabs = panels.map(([name], index) => (
		<button type="button" role="tab" className="btn btn-sm BtnGroup-item" aria-selected={index === 0 ? 'true' : 'false'}>
			{name}
		</button>
	));
	const views = panels.map(([, content], index) => (
		<div role="tabpanel" className="rgh-file-preview-panel" hidden={index > 0}>{content}</div>
	));
	for (const [index, tab] of tabs.entries()) {
		tab.addEventListener('click', () => {
			for (const [other, view] of views.entries()) {
				tabs[other].setAttribute('aria-selected', String(other === index));
				view.hidden = other !== index;
			}
		});
	}

	return (
		<div className="rgh-file-preview-tabs">
			<div className="BtnGroup mb-2" role="tablist">{tabs}</div>
			{views}
		</div>
	);
}

function message(text: string): HTMLElement {
	return <p className="color-fg-muted">{text}</p>;
}

async function getPanels(path: string, oldPath: string, blobUrl: string, signal: AbortSignal): Promise<HTMLElement> {
	// The comparison base of the Files changed tab, i.e. the PR's merge base
	const toc = $optional('[src*="show_toc?base_sha="]')?.getAttribute('src');
	const base = toc ? new URL(toc, location.origin).searchParams.get('base_sha') : undefined;
	const [newText, oldText] = await Promise.all([
		loadText(getRawUrl(blobUrl), signal),
		base ? loadText(getRawUrl(blobUrl, base, oldPath), signal) : undefined,
	]);
	const newHtml = newText === undefined ? [] : await highlightLines(newText, path);
	if (!base) {
		// Without the base revision only the file itself can be shown
		return newText === undefined
			? message('Could not load the file.')
			: renderRows(newHtml.map((html, index) => ({type: 'same', new: index + 1, html})), `Contents of ${path}`);
	}

	const oldHtml = oldText === undefined ? [] : await highlightLines(oldText, oldPath);
	const rows = await getDiffRows(oldText ?? '', newText ?? '', oldHtml, newHtml);
	return renderTabs([
		[
			'Full diff',
			rows ? renderRows(rows, `Full diff of ${path}`) : message('Too many changes to show the full diff here.'),
		],
		[
			'Original file',
			oldText === undefined
				? message('This file is new in this pull request.')
				: renderRows(oldHtml.map((html, index) => ({type: 'same', old: index + 1, html})), `Original ${oldPath}`),
		],
	]);
}

async function openPreview(path: string, oldPath: string, blobUrl: string, signal: AbortSignal): Promise<void> {
	const controller = new AbortController();
	signal = mergeSignals(signal, controller.signal);
	const status = <p role="status">Loading file…</p>;
	const body = <div className="rgh-file-preview-body">{status}</div>;
	const dialog = document.createElement('dialog');
	dialog.className = 'rgh-file-preview';
	dialog.setAttribute('aria-label', `Preview of ${path}`);
	dialog.append(
		<div className="d-flex flex-items-center gap-2 mb-2">
			<strong className="flex-auto min-width-0 text-mono f6 css-truncate css-truncate-overflow">{path}</strong>
			<a href={blobUrl} target="_blank" rel="noopener noreferrer">Open file</a>
			<form method="dialog">
				<button className="btn btn-sm" aria-label="Close file preview">Close</button>
			</form>
		</div>,
		body,
	);
	dialog.addEventListener('click', event => {
		const bounds = dialog.getBoundingClientRect();
		if (
			event.target === dialog
			&& (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top
				|| event.clientY > bounds.bottom)
		) {
			dialog.close();
		}
	});
	dialog.addEventListener('close', () => {
		controller.abort();
		dialog.remove();
	}, {once: true});
	signal.addEventListener('abort', () => {
		dialog.close();
	}, {once: true});
	document.body.append(dialog);
	dialog.showModal();

	try {
		const content = await getPanels(path, oldPath, blobUrl, signal);
		signal.throwIfAborted();
		body.replaceChildren(content);
	} catch (error) {
		if (!signal.aborted) {
			status.textContent = error instanceof Error ? error.message : 'Could not load the file.';
		}
	}
}

function init(signal: AbortSignal): void {
	observe('.file-header[data-path]', header => {
		const view = $optional('a[href*="/blob/"]', header);
		const menu = $optional('details.js-file-header-dropdown', header);
		if (!view || !menu || /\.pdf$/i.test(header.dataset.path!) || elementExists('.rgh-file-preview-button', header)) {
			return;
		}

		menu.before(
			<a
				href={view.href}
				className="Button Button--iconOnly Button--invisible Button--medium rgh-file-preview-button"
				aria-label="Preview file"
				title="Preview file"
			>
				<EyeIcon />
			</a>,
		);
	}, {signal});

	const onClick = (event: DelegateEvent<MouseEvent, HTMLAnchorElement>): void => {
		if (isAlteredClick(event) || elementExists('dialog[open]')) {
			return;
		}

		event.preventDefault();
		const header = closestElement('.file-header', event.delegateTarget);
		const path = header.dataset.path!;
		// Renamed files are titled "old → new"
		const title = $optional('.file-info a[title]', header)?.title ?? '';
		const oldPath = title.includes(' → ') ? title.split(' → ', 1)[0] : path;
		void openPreview(path, oldPath, event.delegateTarget.href, signal);
	};

	delegate('a.rgh-file-preview-button', 'click', onClick, {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isPRFiles,
	],
	init,
});

/*

Test URLs:
- https://github.com/refined-github/refined-github/pull/10103/files
- https://github.com/refined-github/refined-github/pull/10268/files (renamed file)
- https://github.com/refined-github/refined-github/pull/10335/files (base branch ahead of merge base)

*/
