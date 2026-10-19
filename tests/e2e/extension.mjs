// The page the DeFaketive browser extension opens (/check-from-extension), WITHOUT the extension and WITHOUT any
// marketplace: a stand-in for the extension's site script answers the page inside the test browser, and the
// check itself (/api/extension/check and its job) is pretended there too. Nothing is saved anywhere.
import { chromium } from 'playwright-core';
import { signUp } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
const out = 'tests/e2e/shots';
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
fs.mkdirSync(out, { recursive: true });
const SAVED = 'https://www.lazada.com.ph/products/pdp-i5246060610-s31099995054.html';
const NEW_LINK = 'https://www.lazada.com.ph/products/pdp-i999998-s888887.html';
const ID = '0b6f2f4e-8a51-4f5e-9a37-7c1b8d3e2a10';

let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};

const real = await (await fetch(`${base}/api/products/detail?link=${encodeURIComponent(SAVED)}`)).json();
const fresh = { ...real.product, link: NEW_LINK, name: 'Earbuds checked with the extension (pretend)' };
const { comments, ...freshCard } = fresh;
const collected = {
	link: NEW_LINK,
	name: fresh.name,
	ratings: { scores: [100, 20, 10, 5, 3], average: 4.5 },
	levels: { 1: { stop_reason: 'feed_ended' }, 2: { stop_reason: 'feed_ended' }, 3: { stop_reason: 'feed_ended' }, 4: { stop_reason: 'feed_ended' }, 5: { stop_reason: 'target_reached' } },
	reviews: Array.from({ length: 90 }, (_, n) => ({ comment_id: String(5000000 + n), rating: 5, source_rating_filter: 5, content: `Good (${n})` }))
};

// What the extension's site.js does, played inside the page: answers 'take-handoff', notes 'handoff-used'.
// mode: 'answers' (the reviews), 'empty' (already used or expired), 'silent' (no extension installed).
function fakeExtension(context, mode) {
	return context.addInitScript(
		({ mode, product }) => {
			window.__handoffUsed = false;
			if (mode === 'silent') return;
			window.addEventListener('message', (event) => {
				const data = event.data;
				if (!data || data.source !== 'defaketive-site') return;
				if (data.type === 'handoff-used') window.__handoffUsed = true;
				if (data.type === 'take-handoff') {
					window.postMessage({ source: 'defaketive-extension', type: 'handoff', id: data.id, product: mode === 'answers' ? product : null }, location.origin);
				}
			});
		},
		{ mode, product: collected }
	);
}

async function axe(page, label) {
	await page.evaluate(axeSource);
	const result = await page.evaluate(async () => await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }));
	const problems = result.violations.map((v) => `${v.id} (${v.nodes.length})`);
	check(problems.length === 0, `${label}: no accessibility problems${problems.length ? ` — ${problems.join(', ')}` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = `${base}/check-from-extension?handoff=${ID}`;

// (a) A guest is asked to sign in; the reviews wait.
{
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await fakeExtension(context, 'answers');
	const page = await context.newPage();
	let sent = 0;
	await page.route('**/api/extension/check', (route) => ((sent += 1), route.abort()));
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.getByText('Sign in to see your report').waitFor({ timeout: 10000 });
	check(true, 'guest: asked to sign in');
	check(await page.getByText('collected 90 reviews of this product').isVisible(), 'guest: says how many reviews the extension collected');
	check(await page.getByText(collected.name).isVisible(), "guest: shows the product's name");
	check(sent === 0, 'guest: nothing is sent before signing in');
	await axe(page, 'guest sign-in prompt');
	await page.screenshot({ path: `${out}/extension-sign-in.png` });
	await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click();
	await page.getByRole('dialog').waitFor({ timeout: 5000 });
	check(await page.getByRole('dialog').getByText('Sign in to see the report for the product you just checked.').isVisible(), 'guest: the sign-in pop-up says why');
	await context.close();
}

// (b) Signed in: the reviews go to the server, the check page follows the job, the report opens by itself.
{
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await signUp(context, base);
	await fakeExtension(context, 'answers');
	const page = await context.newPage();
	let body = null;
	let polls = 0;
	let finished = false;
	await page.route('**/api/extension/check', (route) => {
		body = JSON.parse(route.request().postData() || '{}');
		return route.fulfill({ status: 202, json: { job: { id: 'ext1', state: 'running', stage: 2, stage_label: 'Analyze reviews', progress: 68, message: 'Analyzing English, Filipino, and Taglish review sentiment…', platform: 'lazada', query: NEW_LINK, created_at: new Date().toISOString() } } });
	});
	await page.route('**/api/jobs/ext1', (route) => {
		polls += 1;
		const done = polls >= 3;
		if (done) finished = true;
		return route.fulfill({ json: { id: 'ext1', state: done ? 'complete' : 'running', stage: done ? 3 : 2, stage_label: 'x', progress: done ? 100 : 68, message: done ? 'Analysis complete — 1 product(s) found.' : 'Waiting for 1 other check to finish first…', needs_you: false, platform: 'lazada', query: NEW_LINK, created_at: new Date().toISOString() } });
	});
	await page.route('**/api/products', (route) => (finished ? route.fulfill({ json: { products: [freshCard], count: 1 } }) : route.continue()));
	await page.route('**/api/products/detail**', (route) => route.fulfill({ json: { product: fresh, recommendations: [] } }));
	await page.route('**/api/saved/detail**', (route) => route.fulfill({ json: { product: fresh, recommendations: [] } }));
	await page.goto(url);
	await page.waitForURL(/\/app\/analyze/, { timeout: 10000 });
	check(true, 'signed in: goes on to the check page');
	check(body?.product?.link === NEW_LINK && body.product.reviews.length === 90, 'signed in: the collected reviews were sent as they came');
	check(await page.evaluate(() => window.__handoffUsed), "signed in: the extension is told the reviews were used");
	await page.getByText('Waiting for 1 other check to finish first…').first().waitFor({ timeout: 10000 });
	check(true, 'signed in: the wait in line is shown');
	await page.waitForURL(/\/app\/report/, { timeout: 20000 });
	check(page.url().includes(encodeURIComponent(NEW_LINK)), 'signed in: the report opens by itself when ready');
	await context.close();
}

// (c) No extension answers.
{
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await fakeExtension(context, 'silent');
	const page = await context.newPage();
	await page.goto(url);
	await page.getByText("The DeFaketive extension didn't answer").waitFor({ timeout: 10000 });
	check(true, 'no extension: says so and what to do');
	check(await page.getByRole('link', { name: 'Go to DeFaketive' }).isVisible(), 'no extension: offers a way on');
	await axe(page, 'no extension (phone width)');
	await context.close();
}

// (d) The reviews were already used, or expired; (e) a bad address.
for (const [label, mode, address] of [['already used', 'empty', url], ['bad address', 'answers', `${base}/check-from-extension?handoff=nonsense`]]) {
	const context = await browser.newContext();
	await fakeExtension(context, mode);
	const page = await context.newPage();
	await page.goto(address);
	await page.getByText('These reviews are no longer here').waitFor({ timeout: 10000 });
	check(true, `${label}: says the reviews are no longer here`);
	await context.close();
}

// (f) The server refuses the reviews (they don't add up, or a daily limit).
{
	const context = await browser.newContext({ colorScheme: 'dark' });
	await signUp(context, base);
	await fakeExtension(context, 'answers');
	const page = await context.newPage();
	const refusal = "The reviews the extension sent didn't add up, so nothing was checked. Reload the Lazada page and press Check again.";
	await page.route('**/api/extension/check', (route) => route.fulfill({ status: 400, json: { error: refusal, invalid: true } }));
	await page.goto(url);
	await page.getByText("This check couldn't start").waitFor({ timeout: 10000 });
	check(await page.getByText(refusal).isVisible(), "refused: shows the server's reason");
	check(!(await page.evaluate(() => window.__handoffUsed)), 'refused: the reviews stay in the extension');
	await axe(page, 'refused (dark)');
	await context.close();
}

// (g) The product was checked recently, so the server keeps its report: the page opens that one and says why.
{
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await signUp(context, base);
	await fakeExtension(context, 'answers');
	const page = await context.newPage();
	let analysed = 0;
	await page.route('**/api/extension/check', (route) =>
		route.fulfill({ status: 200, json: { existing: { link: NEW_LINK, checked_at: new Date().toISOString(), days_ago: 3, keeps_for: 30 } } })
	);
	await page.route('**/api/jobs/**', (route) => ((analysed += 1), route.abort()));
	await page.route('**/api/products/detail**', (route) => route.fulfill({ json: { product: fresh, recommendations: [] } }));
	await page.route('**/api/saved/detail**', (route) => route.fulfill({ json: { product: fresh, recommendations: [] } }));
	await page.goto(url);
	await page.waitForURL(/\/app\/report/, { timeout: 15000 });
	check(page.url().includes(encodeURIComponent(NEW_LINK)), 'recent report: opens the saved report');
	await page.getByText('This product was checked 3 days ago, so we opened that report.').waitFor({ timeout: 5000 });
	check(true, 'recent report: says how long ago it was checked');
	check(await page.getByText('A new check can replace it after 30 days.').isVisible(), 'recent report: says when a new check can replace it');
	check(await page.evaluate(() => window.__handoffUsed), 'recent report: the extension is told the reviews were used');
	check(analysed === 0, 'recent report: no check is followed');
	await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll extension page checks passed');
process.exit(failures ? 1 : 0);
