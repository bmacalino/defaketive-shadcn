// Error screens: a failed load says so and offers "Try again". It never looks like an empty list,
// and a server that can't be reached never sends a signed-in person to the sign-in pop-up.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { signUp } from './_signin.mjs';

const base = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync('tests/e2e/shots', { recursive: true });
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};
const pool = await (await fetch(`${base}/api/saved/products`)).json();
const SAVED = pool.products.find((p) => /Type C Fast Charging/i.test(p.name)) ?? pool.products[0];
const UNKNOWN = 'https://www.lazada.com.ph/products/pdp-i111222333-s444555666.html';

// A pretend visitor who already opened one product, so their history has something in it once it loads.
const { comments: _c, ...CARD } = (await (await fetch(`${base}/api/saved/detail?link=${encodeURIComponent(SAVED.link)}`)).json()).product;
const SEED = (item) => { try { if (!localStorage.getItem('defaketive-activity')) localStorage.setItem('defaketive-activity', JSON.stringify({ [item.link]: { product: item, openedAt: Date.now() } })); } catch {} };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function open({ signedIn = true, seed = false, width = 1280, height = 900, scheme = 'light' } = {}) {
	const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
	if (signedIn) await signUp(context, base);
	if (seed) await context.addInitScript(SEED, CARD);
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	return { context, page, errors };
}
const settle = (page, ms = 1200) => page.waitForTimeout(ms);
const block = async (page, patterns) => { for (const p of patterns) await page.route(p, (r) => r.abort()); };
const unblock = async (page, patterns) => { for (const p of patterns) await page.unroute(p); };
const inApp = (page) => page.locator('[data-slot="sidebar"]').count();
async function axe(page, label) {
	await page.waitForTimeout(1200);
	await page.evaluate(axeSource);
	const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
	check(result.violations.length === 0, `accessibility: ${label}${result.violations.length ? ' -> ' + result.violations.map((v) => v.id + ' ' + v.nodes[0].target.join(' ')).join('; ') : ''}`);
}

// ---- 1. The person's own library fails to load -------------------------------------------------------
{
	const LIBRARY = ['**/api/me/library', '**/api/me/import'];
	const { context, page, errors } = await open({ seed: true });
	await block(page, LIBRARY);
	await page.goto(base + '/app/history', { waitUntil: 'networkidle' });
	await settle(page);
	check(await page.getByText("Your history couldn't be loaded").isVisible(), 'History: a failed load says "Your history couldn\'t be loaded"');
	check(!(await page.getByText('No scans yet').isVisible()), 'History: it does not pretend the history is empty');
	check(await page.getByRole('button', { name: 'Try again' }).isVisible(), 'History: it offers "Try again"');
	await page.screenshot({ path: 'tests/e2e/shots/errors_history.png' });
	await axe(page, 'History error screen');

	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await settle(page);
	check((await page.getByText("Your history couldn't be loaded").isVisible()) && (await page.locator('dl[aria-label="Your activity in numbers"]').count()) === 0, 'Home: the same message, and no made-up zeros');
	check(await page.locator('[data-scan-input]').isVisible(), 'Home: the link box still works while the history is missing');

	await page.goto(base + '/app/wishlist', { waitUntil: 'networkidle' });
	await settle(page);
	check((await page.getByText("Your wishlist couldn't be loaded").isVisible()) && !(await page.getByText('Start building your shortlist').isVisible()), 'Wishlist: says it could not be loaded, not "start building your shortlist"');

	// Still failing: pressing "Try again" keeps the error. Then the server comes back.
	await page.goto(base + '/app/history', { waitUntil: 'networkidle' });
	await settle(page);
	await page.getByRole('button', { name: 'Try again' }).click();
	await settle(page, 1500);
	check(await page.getByText("Your history couldn't be loaded").isVisible(), 'History: "Try again" while it still fails keeps the message');
	await unblock(page, LIBRARY);
	await page.getByRole('button', { name: 'Try again' }).click();
	await page.getByRole('link', { name: SAVED.name }).first().waitFor({ timeout: 15000 });
	check(!(await page.getByText("Your history couldn't be loaded").isVisible()), 'History: once the server answers, "Try again" shows the history');
	check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors[0] : ''}`);
	await context.close();
}

// ---- 2. The product list fails to load ---------------------------------------------------------------
{
	const LISTS = ['**/api/products', '**/api/saved/products'];
	const { context, page } = await open();
	await block(page, LISTS);
	await page.goto(base + '/app/products', { waitUntil: 'networkidle' });
	await settle(page);
	check(await page.getByText("Products couldn't be loaded").isVisible(), 'Products: a failed load says "Products couldn\'t be loaded"');
	check(!(await page.getByText('No products checked yet').isVisible()), 'Products: it does not pretend nothing was checked');
	await page.screenshot({ path: 'tests/e2e/shots/errors_products.png' });
	await unblock(page, LISTS);
	await page.getByRole('button', { name: 'Try again' }).click();
	await page.getByText(new RegExp(`^${pool.count} products shown`)).waitFor({ timeout: 15000 });
	check(true, `Products: "Try again" lists all ${pool.count} products`);
	await context.close();
}

// ---- 3. A report fails to load, and a report that does not exist ----------------------------------------
{
	const DETAIL = ['**/api/saved/detail**', '**/api/products/detail**'];
	const { context, page } = await open();
	await block(page, DETAIL);
	await page.goto(`${base}/app/report?link=${encodeURIComponent(SAVED.link)}`, { waitUntil: 'networkidle' });
	await settle(page);
	check(await page.getByText("This report couldn't be loaded").isVisible(), 'Report: a failed load says "This report couldn\'t be loaded"');
	check(!(await page.getByText("We don't have a report for this product yet").isVisible()), 'Report: a failed load is not shown as "no such report"');
	await page.screenshot({ path: 'tests/e2e/shots/errors_report.png' });
	await unblock(page, DETAIL);
	await page.getByRole('button', { name: 'Try again' }).click();
	await page.getByRole('heading', { level: 1, name: SAVED.name }).waitFor({ timeout: 15000 });
	check(true, 'Report: "Try again" opens the report');

	await page.goto(`${base}/app/report?link=${encodeURIComponent(UNKNOWN)}`, { waitUntil: 'networkidle' });
	await settle(page);
	check(await page.getByText("We don't have a report for this product yet").isVisible(), 'Report that does not exist: says so');
	check(!(await page.getByRole('button', { name: 'Try again' }).isVisible()), 'Report that does not exist: no pointless "Try again"');
	await page.screenshot({ path: 'tests/e2e/shots/errors_missing.png' });
	await axe(page, 'missing-report screen');
	await page.getByRole('link', { name: 'Check this product' }).click();
	await page.waitForURL(/\/app\/analyze\?q=/, { timeout: 10000 });
	await settle(page, 700);
	check((await page.locator('#search-query').inputValue()) === UNKNOWN, '"Check this product" opens the check page with the link already filled in');

	await page.goto(`${base}/app/report?link=${encodeURIComponent('https://example.com/some-product')}`, { waitUntil: 'networkidle' });
	await settle(page);
	check((await page.getByText("This link can't be opened").isVisible()) && (await page.getByRole('link', { name: 'Check this product' }).count()) === 0, 'A link from an unsupported site: says it cannot be opened, and does not offer to check it');
	await context.close();
}
{
	const { context, page } = await open({ signedIn: false });
	await page.goto(`${base}/scan/report?link=${encodeURIComponent(UNKNOWN)}`, { waitUntil: 'networkidle' });
	await settle(page);
	check(await page.getByText("We don't have a report for this product yet").isVisible(), 'Guest: a report that does not exist says so');
	await page.getByRole('link', { name: 'Check this product' }).click();
	await page.waitForURL(/\/scan\?q=/, { timeout: 10000 });
	await settle(page, 700);
	check((await page.locator('#guest-query').inputValue()) === UNKNOWN && (await inApp(page)) === 0, 'Guest: "Check this product" opens the guest screen with the link filled in');
	await context.close();
}

// ---- 4. The server cannot be reached -------------------------------------------------------------------
for (const scheme of ['light', 'dark']) {
	const { context, page, errors } = await open({ scheme });
	await page.route('**/api/auth/me', (r) => r.fulfill({ status: 502, body: 'Bad Gateway' }));
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await settle(page, 1500);
	if (scheme === 'light') {
		check(await page.getByText("Can't reach the DeFaketive server.").isVisible(), 'Server down: a banner says the server cannot be reached');
		check(new URL(page.url()).pathname === '/app/home' && (await page.getByRole('dialog').count()) === 0, 'Server down: a signed-in person is NOT sent to the sign-in pop-up');
		check((await inApp(page)) === 0, 'Server down: the app is not drawn with made-up emptiness');
		await page.screenshot({ path: 'tests/e2e/shots/errors_offline.png' });
	}
	await axe(page, `server-down banner (${scheme})`);
	if (scheme === 'light') {
		await page.unroute('**/api/auth/me');
		await page.getByRole('button', { name: 'Try again' }).click();
		await page.locator('[data-slot="sidebar"]').first().waitFor({ state: 'attached', timeout: 15000 });
		await settle(page, 800);
		check(!(await page.getByText("Can't reach the DeFaketive server.").isVisible()) && new URL(page.url()).pathname === '/app/home', 'Server back: "Try again" opens the app where they were, and the banner goes');
		check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors[0] : ''}`);
	}
	await context.close();
}
{
	// A guest on the landing page, with everything failing.
	const { context, page } = await open({ signedIn: false });
	await page.route('**/api/**', (r) => r.fulfill({ status: 502, body: 'Bad Gateway' }));
	await page.goto(base + '/', { waitUntil: 'networkidle' });
	await settle(page, 1500);
	check(await page.getByText("Can't reach the DeFaketive server.").isVisible(), 'Landing, server down: the banner shows');
	check(await page.getByRole('heading', { level: 1 }).isVisible(), 'Landing, server down: the page itself still shows');
	check(await page.locator('[aria-label="DeFaketive in numbers"]').isHidden(), 'Landing, server down: the numbers strip is left out, not left loading');
	await page.unroute('**/api/**');
	await page.getByRole('button', { name: 'Try again' }).click();
	await page.locator('[aria-label="DeFaketive in numbers"] dd').first().waitFor({ timeout: 15000 });
	check(!(await page.getByText("Can't reach the DeFaketive server.").isVisible()), 'Landing, server back: the banner goes and the numbers appear');
	await context.close();
}
{
	const { context, page } = await open({ width: 390, height: 844 });
	await page.route('**/api/auth/me', (r) => r.fulfill({ status: 502, body: 'Bad Gateway' }));
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await settle(page);
	check((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'phone: the banner does not push the page sideways');
	await page.screenshot({ path: 'tests/e2e/shots/errors_offline_phone.png' });
	await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
