// The REAL browser extension (extension/), loaded into a throwaway headless Chrome, end to end — WITHOUT Lazada:
// the test plays Lazada's product page and review list itself (tests/extension/pretend-feed.mjs), and pretends
// the check on the DeFaketive side, so no marketplace is contacted and nothing is saved.
//
// Chrome no longer loads an unpacked extension from a command-line switch, so this starts Chrome with
// --enable-unsafe-extension-debugging and loads it through the DevTools protocol (Extensions.loadUnpacked), in a
// profile of its own in tests/.tmp that is deleted afterwards.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signUp } from './_signin.mjs';
import { pretendFeed } from '../extension/pretend-feed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const base = process.env.BASE || 'http://localhost:5173';
const out = path.join(here, 'shots');
const axeSource = fs.readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const CHROME = [
	process.env.CHROME,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'/usr/bin/google-chrome'
].find((candidate) => candidate && fs.existsSync(candidate));
const PRODUCT = 'https://www.lazada.com.ph/products/pdp-i5249925664-s31137449814.html';
const SAVED = 'https://www.lazada.com.ph/products/pdp-i5246060610-s31099995054.html';

let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};
if (!CHROME) {
	console.log('Google Chrome was not found: set CHROME to its chrome.exe.');
	process.exit(1);
}

const freePort = () =>
	new Promise((resolve) => {
		const server = net.createServer().listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});

// Lazada's product page, as far as the extension reads it.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pretend Wireless Earbuds | Lazada PH</title>
<meta property="og:image" content="https://img.lazcdn.com/g/p/pretend.jpg_720x720q80.jpg"></head>
<body><h1 class="pdp-mod-product-badge-title">Pretend Wireless Earbuds</h1><span class="pdp-price_type_normal">₱499.00</span>
<a class="seller-name__detail">Pretend Store</a><p>A pretend product page, served by the test.</p></body></html>`;

const real = await (await fetch(`${base}/api/products/detail?link=${encodeURIComponent(SAVED)}`)).json();
const fresh = { ...real.product, link: PRODUCT, name: 'Pretend Wireless Earbuds' };
const { comments, ...freshCard } = fresh;

// A copy of the extension that reports to the site under test (extension/ itself is for localhost:5173).
const extension = path.join(root, 'tests', '.tmp', 'extension-under-test');
const made = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-extension.mjs'), '--site', new URL(base).origin, '--out', extension], { encoding: 'utf8' });
if (made.status !== 0) {
	console.log(`The extension could not be prepared: ${made.stderr || made.stdout}`);
	process.exit(1);
}
const profile = path.join(root, 'tests', '.tmp', 'extension-profile');
fs.rmSync(profile, { recursive: true, force: true });
const port = await freePort();
const chrome = spawn(
	CHROME,
	['--headless=new', `--remote-debugging-port=${port}`, '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`,
		'--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 'about:blank'],
	{ stdio: 'ignore' }
);

async function routeLazada(context, feed) {
	await context.route('https://www.lazada.com.ph/**', (route) =>
		route.request().resourceType() === 'document'
			? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE })
			: route.fulfill({ status: 404, body: '' })
	);
	await context.route('https://my.lazada.com.ph/pdp/review/getReviewList**', async (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			headers: { 'access-control-allow-origin': 'https://www.lazada.com.ph', 'access-control-allow-credentials': 'true' },
			body: await feed.fetchText(route.request().url())
		})
	);
	await context.route('https://img.lazcdn.com/**', (route) => route.fulfill({ status: 404, body: '' }));
}

async function axe(page, label, selector) {
	await page.evaluate(axeSource);
	const result = await page.evaluate(
		async (include) => await window.axe.run(include ? { include: [[include]] } : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }),
		selector ?? null
	);
	const problems = result.violations.map((v) => `${v.id} (${v.nodes.length})`);
	check(problems.length === 0, `${label}: no accessibility problems${problems.length ? ` — ${problems.join(', ')}` : ''}`);
}

let browser;
try {
	for (let attempt = 0; attempt < 60 && !browser; attempt += 1) {
		await new Promise((done) => setTimeout(done, 250));
		browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
	}
	if (!browser) throw new Error('Chrome did not start');
	const session = await browser.newBrowserCDPSession();
	const { id } = await session.send('Extensions.loadUnpacked', { path: extension.replaceAll('\\', '/') });
	check(Boolean(id), 'the extension loads');
	const context = browser.contexts()[0];

	// The toolbar pop-up.
	{
		const popup = await context.newPage();
		await popup.goto(`chrome-extension://${id}/popup.html`);
		check((await popup.getByRole('link', { name: 'Open DeFaketive' }).getAttribute('href')) === `${new URL(base).origin}/`, 'pop-up: links to the site it reports to');
		await axe(popup, 'pop-up');
		await popup.close();
	}

	// (a) A whole check: collected on "Lazada", handed to the site, sent, followed, report opened.
	{
		await signUp(context, base);
		const feed = pretendFeed({ scores: [400, 20, 10, 5, 3], written: { 5: 150, 4: 15, 3: 8, 2: 4, 1: 3 } });
		await routeLazada(context, feed);
		let body = null;
		let polls = 0;
		let finished = false;
		await context.route('**/api/extension/check', (route) => {
			body = JSON.parse(route.request().postData() || '{}');
			return route.fulfill({ status: 202, json: { job: { id: 'extB', state: 'running', stage: 2, stage_label: 'Analyze reviews', progress: 68, message: 'Analyzing English, Filipino, and Taglish review sentiment…', platform: 'lazada', query: PRODUCT, created_at: new Date().toISOString() } } });
		});
		await context.route('**/api/jobs/extB', (route) => {
			polls += 1;
			const done = polls >= 2;
			if (done) finished = true;
			return route.fulfill({ json: { id: 'extB', state: done ? 'complete' : 'running', stage: done ? 3 : 2, stage_label: 'x', progress: done ? 100 : 68, message: done ? 'Analysis complete — 1 product(s) found.' : 'Analyzing…', platform: 'lazada', query: PRODUCT, created_at: new Date().toISOString() } });
		});
		await context.route('**/api/products', (route) => (finished ? route.fulfill({ json: { products: [freshCard], count: 1 } }) : route.continue()));
		await context.route('**/api/products/detail**', (route) => route.fulfill({ json: { product: fresh, recommendations: [] } }));
		await context.route('**/api/saved/detail**', (route) => route.fulfill({ json: { product: fresh, recommendations: [] } }));

		const lazada = await context.newPage();
		await lazada.goto(`${PRODUCT}?spm=a2o4l.searchlist`);
		const button = lazada.getByRole('button', { name: 'Check with DeFaketive' });
		await button.waitFor({ timeout: 10000 });
		check(true, 'Lazada page: the button appears');
		await axe(lazada, 'Lazada page: button', '#defaketive-extension');
		const opened = context.waitForEvent('page', { timeout: 30000 });
		await button.click();
		const report = await opened;
		check(report.url().startsWith(`${base}/check-from-extension?handoff=`), 'the site opens in a new tab with the hand-off id');
		await report.waitForURL(/\/app\/analyze/, { timeout: 15000 });
		check(feed.requests[0]?.star === 0 && feed.requests.length === 7, `Lazada page: the review list was read as the scanner reads it (${feed.requests.length} requests)`);
		const product = body?.product ?? {};
		check(product.link === PRODUCT, 'sent: the listing address, without the tracking part');
		check(product.name === 'Pretend Wireless Earbuds' && product.price === '₱499.00' && product.seller === 'Pretend Store', "sent: the product's name, price and seller from the page");
		check(product.img === 'https://img.lazcdn.com/g/p/pretend.jpg_720x720q80.jpg', "sent: the product's photo");
		check(product.reviews?.length === 90, `sent: all ${product.reviews?.length} collected reviews`);
		check(!JSON.stringify(body).includes('Real Person') && !JSON.stringify(body).includes('Thank you po'), 'sent: no reviewer names or seller replies');
		await report.waitForURL(/\/app\/report/, { timeout: 20000 });
		check(true, 'the report opens by itself when ready');
		await lazada.getByText('Report opened in a new tab').waitFor({ timeout: 5000 });
		check(true, 'Lazada page: the panel says the report opened');
		await axe(lazada, 'Lazada page: finished panel', '#defaketive-extension');
		await lazada.screenshot({ path: path.join(out, 'extension-lazada-panel.png') });

		// A second check, with that DeFaketive tab still open: it is reused, no tab is added.
		const firstHandoff = new URL(report.url()).searchParams.get('handoff');
		const tabsBefore = context.pages().length;
		let added = 0;
		const count = () => (added += 1);
		context.on('page', count);
		body = null;
		const handedOver = report.waitForURL(/\/check-from-extension\?handoff=/, { timeout: 30000 });
		await lazada.getByRole('button', { name: 'Check again' }).click();
		await handedOver;
		check(new URL(report.url()).searchParams.get('handoff') !== firstHandoff, 'second check: the open DeFaketive tab shows the new hand-off');
		await report.waitForURL(/\/app\/report/, { timeout: 20000 });
		check(body?.product?.reviews?.length === 90, 'second check: its reviews were sent');
		await lazada.getByText('Report opened in your DeFaketive tab').waitFor({ timeout: 5000 });
		check(true, 'second check: the panel says the DeFaketive tab was used');
		context.off('page', count);
		check(added === 0 && context.pages().length === tabsBefore, `second check: no new tab was opened (${added} added)`);
		await Promise.all([lazada.close(), report.close()]);
		await context.unrouteAll({ behavior: 'ignoreErrors' });
	}

	// (b) Lazada asks for a check: the shopper is told, nothing is sent, no tab opens.
	{
		const feed = pretendFeed({ scores: [100, 0, 10, 0, 0], written: { 5: 100, 3: 10 }, check: 2 });
		await routeLazada(context, feed);
		let sent = 0;
		await context.route('**/api/extension/check', (route) => ((sent += 1), route.abort()));
		const lazada = await context.newPage();
		await lazada.goto(PRODUCT);
		let opened = false;
		context.once('page', () => (opened = true));
		await lazada.getByRole('button', { name: 'Check with DeFaketive' }).click();
		await lazada.getByText('Lazada asked for a check').waitFor({ timeout: 10000 });
		check(await lazada.getByText("complete Lazada's check if one appears").isVisible(), 'check: tells the shopper what to do');
		check(await lazada.getByRole('button', { name: 'Check again' }).isVisible(), 'check: the button offers to check again');
		await new Promise((done) => setTimeout(done, 1500));
		check(!opened && sent === 0, 'check: nothing is sent and no tab opens');
		check(feed.requests.length === 2, 'check: collection stops at the check');
		await axe(lazada, 'Lazada page: check message', '#defaketive-extension');
		await lazada.close();
		await context.unrouteAll({ behavior: 'ignoreErrors' });
	}

	// (c) Not a product page: no button.
	{
		await context.route('https://www.lazada.com.ph/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Search</title><h1>Search results</h1>' }));
		const search = await context.newPage();
		await search.goto('https://www.lazada.com.ph/catalog/?q=earbuds');
		await new Promise((done) => setTimeout(done, 1000));
		check((await search.locator('#defaketive-extension').count()) === 0, 'a search page gets no button');
		await search.close();
	}
} catch (error) {
	check(false, `the run stopped: ${error.message}`);
} finally {
	await browser?.close().catch(() => {});
	chrome.kill();
	await new Promise((done) => setTimeout(done, 1000));
	fs.rmSync(profile, { recursive: true, force: true });
	fs.rmSync(extension, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll extension checks passed');
process.exit(failures ? 1 : 0);
