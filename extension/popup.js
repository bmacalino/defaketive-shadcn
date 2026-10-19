// The toolbar pop-up: how to use the extension, and a link to the site it reports to.
document.getElementById('site').href = new URL('/', self.DEFAKETIVE_SITE).href;

// Use the DeFaketive tab that is already open instead of adding another one; open a new tab only if that fails.
document.getElementById('site').addEventListener('click', async (event) => {
	event.preventDefault();
	const url = event.currentTarget.href;
	let answered = false;
	try {
		answered = (await chrome.runtime.sendMessage({ type: 'open-site' }))?.ok === true;
	} catch {
		// Fall through to a new tab.
	}
	if (!answered) await chrome.tabs.create({ url });
	window.close();
});
