import {mergeSignals, signalFromEvent} from 'abort-utils';
import elementReady from 'element-ready';
import * as pageDetect from 'github-url-detection';
import {$$, $optional} from 'select-dom';

import features from '../feature-manager.js';
import {addHotkey, overrideHotkey, registerHotkey} from '../github-helpers/hotkey.js';
import {is} from '../helpers/css-selectors.js';

const tabnavSelectors = [
	'[aria-label="Pull request tabs"]',
	'[aria-label^="Pull request navigation"]',
] as const;

function selectAdjacentTab(offset: number): void {
	const tabs = $$(is(tabnavSelectors) + ' a');
	const selectedIndex = tabs.findIndex(tab => tab.matches(['.selected', '[aria-current]']));
	const adjacentIndex = (selectedIndex + offset + tabs.length) % tabs.length;
	tabs[adjacentIndex].click();
}

function selectPreviousTab(): void {
	selectAdjacentTab(-1);
}

function selectNextTab(): void {
	selectAdjacentTab(1);
}

function scrollToMergeArea(signal: AbortSignal): void {
	const mergeArea = $optional([
		'div[data-testid="mergebox-partial"]', // React PR conversation
		'div#partial-pull-merging', // Legacy PR conversation
	]);
	if (!mergeArea) {
		return;
	}

	if (!mergeArea.hasAttribute('tabindex')) {
		mergeArea.tabIndex = -1;
		const restoreTabIndex = (): void => {
			mergeArea.removeAttribute('tabindex');
			mergeArea.removeEventListener('blur', restoreTabIndex);
			signal.removeEventListener('abort', restoreTabIndex);
		};

		mergeArea.addEventListener('blur', restoreTabIndex, {once: true});
		signal.addEventListener('abort', restoreTabIndex, {once: true});
	}

	mergeArea.scrollIntoView({block: 'center'});
	mergeArea.focus({preventScroll: true});
}

async function init(signal: AbortSignal): Promise<void> {
	signal = mergeSignals(signal, signalFromEvent(document, 'soft-nav:start', {signal}));
	registerHotkey('g ArrowLeft', selectPreviousTab, {signal});
	registerHotkey('g ArrowRight', selectNextTab, {signal});
	if (pageDetect.isPRConversation()) {
		registerHotkey('g l', () => {
			scrollToMergeArea(signal);
		}, {signal});
	}

	const tabnav = await elementReady(tabnavSelectors, {signal});
	if (!tabnav || signal.aborted) {
		return;
	}

	const tabs = $$('a', tabnav);
	for (const [index, tab] of tabs.entries()) {
		// Reset previous hotkeys because the DOM persists across soft navigations
		overrideHotkey(tab, `g ${index + 1}`);
	}

	addHotkey(tabs.find(tab => /\/(?:files|changes)\/?$/.test(tab.pathname)), 'g f');
}

void features.add(import.meta.url, {
	shortcuts: {
		'g <number>': 'Go to PR tab <number>',
		'g →': 'Go to next PR tab',
		'g ←': 'Go to previous PR tab',
		'g f': 'Go to Files changed',
		'g l': 'Scroll to PR merge actions',
	},
	include: [
		pageDetect.isPR,
	],
	init,
});

/*

Test URLs:

https://github.com/refined-github/sandbox/pull/4

*/
