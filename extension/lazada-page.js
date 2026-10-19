// Runs inside the Lazada product page itself (the page's own "world"), which is where DeFaketive's scanner also
// asks for the review list, so the requests are the page's own, with the shopper's own session.
// It waits for lazada.js (the button) to say "start", collects with collect.js, and reports each step back.
(() => {
	if (globalThis.__defaketivePageReady) return;
	globalThis.__defaketivePageReady = true;

	// A reply normally takes under half a second; Lazada can hold one back while it waits for a check.
	const TIMEOUT_MS = 15000;
	const fetchText = (url) => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		return fetch(url, { credentials: 'include', signal: controller.signal })
			.then((response) => response.text())
			.finally(() => clearTimeout(timer));
	};

	let running = false;
	window.addEventListener('message', async (event) => {
		if (event.source !== window || event.origin !== location.origin) return;
		const data = event.data;
		if (!data || data.source !== 'defaketive-extension' || data.type !== 'start' || typeof data.nonce !== 'string') return;
		const reply = (message) => window.postMessage({ source: 'defaketive-page', nonce: data.nonce, ...message }, location.origin);
		if (running) return;
		running = true;
		try {
			const result = await globalThis.DefaketiveCollect.collect({
				url: location.href,
				fetchText,
				onStep: (step) => reply({ type: 'step', step })
			});
			reply({ type: 'result', result });
		} catch {
			reply({ type: 'result', result: { status: 'unavailable' } });
		} finally {
			running = false;
		}
	});
})();
