// On the DeFaketive site: passes collected reviews from the extension to the page that asks for them
// (/check-from-extension), and tells the site the extension is installed (data-defaketive-extension on <html>).
// The page and this script talk with window.postMessage on the site's own origin only.
(() => {
	window.addEventListener('message', async (event) => {
		if (event.source !== window || event.origin !== location.origin) return;
		const data = event.data;
		if (!data || data.source !== 'defaketive-site' || typeof data.id !== 'string') return;
		const reply = (message) => window.postMessage({ source: 'defaketive-extension', id: data.id, ...message }, location.origin);
		try {
			if (data.type === 'take-handoff') {
				const answer = await chrome.runtime.sendMessage({ type: 'take-handoff', id: data.id });
				reply({ type: 'handoff', product: answer?.product ?? null });
			} else if (data.type === 'handoff-used') {
				await chrome.runtime.sendMessage({ type: 'handoff-used', id: data.id });
			}
		} catch {
			// The extension was updated or switched off since this page opened.
			if (data.type === 'take-handoff') reply({ type: 'handoff', product: null, failed: true });
		}
	});

	// At document_start the page may not have its <html> element yet.
	const mark = () => (document.documentElement.dataset.defaketiveExtension = chrome.runtime.getManifest().version);
	if (document.documentElement) mark();
	else document.addEventListener('DOMContentLoaded', mark, { once: true });
})();
