import optionsStorage from '../options-storage.js';
import {doesBrowserActionOpenOptions} from './feature-utils.js';
import safeCreateTab from './safe-create-tab.js';

export default async function onActionClick(tab: Pick<chrome.tabs.Tab, 'id' | 'windowId'>): Promise<void> {
	if (chrome.sidePanel) {
		try {
			// Call before any await so the toolbar click's user activation reaches the API.
			await chrome.sidePanel.open({windowId: tab.windowId});
		} catch {
			await chrome.runtime.openOptionsPage();
		}

		return;
	}

	if (doesBrowserActionOpenOptions) {
		await chrome.runtime.openOptionsPage();
		return;
	}

	const {actionUrl} = await optionsStorage.getAll();
	if (!actionUrl) {
		await chrome.runtime.openOptionsPage();
		return;
	}

	await safeCreateTab({openerTabId: tab.id, url: actionUrl});
}
