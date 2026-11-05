// Optional PDF file hosts are not GitHub Enterprise pages.
if (!['objects.githubusercontent.com', 'raw.githubusercontent.com'].includes(location.hostname)) {
	// Workaround to add ESM support to content scripts
	void import(chrome.runtime.getURL('assets/refined-github.js'));
}
