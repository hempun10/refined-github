import {afterEach, beforeEach, expect, test, vi} from 'vitest';

import safeCreateTab from './safe-create-tab.js';
import onActionClick from './toolbar-action.js';

const {getAll} = vi.hoisted(() => ({getAll: vi.fn()}));

vi.mock('./feature-utils.js', () => ({doesBrowserActionOpenOptions: false}));
vi.mock('../options-storage.js', () => ({default: {getAll}}));
vi.mock('./safe-create-tab.js', () => ({default: vi.fn()}));

const openPanel = vi.fn();
const openOptionsPage = vi.fn();
const tab = {id: 5, windowId: 7};

beforeEach(() => {
	vi.stubGlobal('chrome', {sidePanel: {open: openPanel}, runtime: {openOptionsPage}});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

test('opens the native sidebar immediately without opening GitHub or reading settings', async () => {
	const opening = onActionClick(tab);
	expect(openPanel).toHaveBeenCalledWith({windowId: tab.windowId});
	await opening;
	expect(getAll).not.toHaveBeenCalled();
	expect(safeCreateTab).not.toHaveBeenCalled();
	expect(openOptionsPage).not.toHaveBeenCalled();
});

test('opens full settings if the browser cannot open the sidebar', async () => {
	openPanel.mockRejectedValueOnce(new Error('Side panel unavailable'));
	await onActionClick(tab);
	expect(openOptionsPage).toHaveBeenCalledOnce();
	expect(safeCreateTab).not.toHaveBeenCalled();
});

test('keeps the configured toolbar URL on browsers without side panels', async () => {
	vi.stubGlobal('chrome', {runtime: {openOptionsPage}});
	getAll.mockResolvedValueOnce({actionUrl: 'https://github.com/'});
	await onActionClick(tab);
	expect(safeCreateTab).toHaveBeenCalledWith({openerTabId: tab.id, url: 'https://github.com/'});
});

test('keeps the options-page fallback when the legacy toolbar URL is empty', async () => {
	vi.stubGlobal('chrome', {runtime: {openOptionsPage}});
	getAll.mockResolvedValueOnce({actionUrl: ''});
	await onActionClick(tab);
	expect(openOptionsPage).toHaveBeenCalledOnce();
	expect(safeCreateTab).not.toHaveBeenCalled();
});
