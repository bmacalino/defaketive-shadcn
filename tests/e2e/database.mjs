// The whole database in the new app: every analyzed product can be listed, searched and opened,
// Temu listings stay apart, and the app still works when the extra routes are missing.
import { chromium } from 'playwright-core';
import { signUp } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
const out = 'tests/e2e/shots';
fs.mkdirSync(out, { recursive: true });

let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};

const all = await (await fetch(`${base}/api/saved/products`)).json();
const session = await (await fetch(`${base}/api/products`)).json();
const sessionLinks = new Set(session.products.map((p) => p.link));
const dbOnly = all.products.filter((p) => !sessionLinks.has(p.link));
const helmet = all.products.find((p) => /MOFOX/i.test(p.name)) ?? dbOnly[0];
const temu = all.products.filter((p) => /temu\.com/.test(p.link));
console.log(`(database: ${all.count} listings, ${session.count} in a fresh session, ${temu.length} from Temu; testing with "${helmet.name.slice(0, 40)}…")`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (opts = {}) => {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await signUp(context, base);
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	if (opts.noSaved) await page.route('**/api/saved/**', (r) => r.fulfill({ status: 404, body: 'Not Found' }));
	return { context, page, errors };
};

// 1-2. Products lists everything, and a product only in the database opens.
{
	const { context, page, errors } = await open();
	await page.goto(base + '/app/products', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	check(await page.getByText(new RegExp(`^${all.count} products shown`)).isVisible(), `Products lists all ${all.count} analyzed products`);
	await page.screenshot({ path: `${out}/db_products.png`, fullPage: false });
	await page.getByRole('link', { name: helmet.name }).first().click();
	await page.waitForURL(/\/app\/report\?link=/);
	// The address changes a moment before the new page is drawn (pages cross-fade), so wait for the report's own
	// heading rather than reading whichever heading is on screen right now.
	const opened = await page.getByRole('heading', { level: 1, name: helmet.name.trim() }).waitFor({ timeout: 15000 }).then(() => true, () => false);
	check(opened, 'a product that only the database has opens its report');
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${out}/db_report.png` });
	check(errors.length === 0, 'no browser errors on those pages');
	await context.close();
}

// 3. Wishlist suggestions come from the database, and now open.
{
	const { context, page } = await open();
	await page.goto(base + '/app/wishlist', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1200);
	const pick = page.locator('section[aria-labelledby="picks-title"] a').first();
	if (await pick.count()) {
		await pick.click();
		await page.waitForURL(/\/app\/report\?link=/);
		await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
		check(!(await page.getByText("We don't have a report for this product yet").isVisible()), 'a "no warning signs" suggestion opens its report');
	} else {
		check(true, '(no suggestions to open right now)');
	}
	await context.close();
}

// 4-6. Analyze finds database products by link and by name; Temu listings stay apart.
{
	const { context, page } = await open();
	await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	await page.locator('#search-query').fill(helmet.link);
	await page.waitForTimeout(400);
	const detected = await page.getByText(/product link detected/).isVisible();
	check(detected && (await page.getByText(/Saved report found/).isVisible()), 'a link already in the database is found without a scan');
	await page.getByRole('button', { name: /Open report/ }).click();
	await page.waitForURL(/\/app\/report\?link=/);
	check(true, '"Open report" opens it');

	await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1000);
	await page.locator('#search-query').fill('MOFOX helmet');
	await page.getByRole('button', { name: 'Search saved reports' }).click();
	await page.waitForURL(/\/app\/products/);
	await page.waitForTimeout(600);
	check(await page.getByText(/products? shown for your search/).isVisible(), 'a name search finds products from the database');

	if (temu.length >= 2) {
		await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1000);
		await page.locator('#search-query').fill(temu[1].link);
		await page.waitForTimeout(400);
		const text = await page.getByText(/Saved report found/).innerText();
		check(text.includes(temu[1].name.slice(0, 20)), 'a Temu link finds that exact Temu product');
		await page.locator('#search-query').fill('https://www.temu.com/goods.html?goods_id=123456789');
		await page.waitForTimeout(400);
		check(!(await page.getByText(/Saved report found/).isVisible()), 'an unknown Temu link is not mistaken for another Temu product');
		check(!(await page.getByRole('button', { name: /Check this Temu PH product/ }).isVisible()), 'an unknown Temu link offers no scan');
		check(await page.getByText(/checks Lazada PH products only/).first().isVisible(), 'it says DeFaketive checks Lazada PH products only');
	}
	await context.close();
}

// 7. The search pop-up knows every product.
{
	const { context, page } = await open();
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	await page.keyboard.press('Control+k');
	await page.getByRole('dialog').waitFor();
	await page.keyboard.type('MOFOX');
	await page.waitForTimeout(400);
	await page.keyboard.press('Enter');
	await page.waitForURL(/\/app\/report\?link=/);
	check(decodeURIComponent(page.url()).includes(helmet.link), 'Ctrl+K finds a database product and opens it');
	await context.close();
}

// 8. Without the extra routes (the plain original app), everything still works from the session catalog.
{
	const { context, page, errors } = await open({ noSaved: true });
	await page.goto(base + '/app/products', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	check(await page.getByText(new RegExp(`^${session.count} products? shown`)).isVisible(), `without server.py, Products falls back to the ${session.count} session product(s)`);
	await page.goto(`${base}/app/report?link=${encodeURIComponent(helmet.link)}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1000);
	check(await page.getByText("We don't have a report for this product yet").isVisible(), 'without server.py, a database-only product says there is no report for it yet');
	check(errors.length === 0, 'no browser errors when the extra routes are missing');
	await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
