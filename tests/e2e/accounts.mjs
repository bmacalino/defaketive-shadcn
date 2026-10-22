// Two accounts and a guest on ONE browser: each must see only their own history and wishlist,
// while everyone still gets the same shared pool of analyzed products (for browsing and recommendations).
// The scan is pretended, so no marketplace is touched. Accounts go to the scratch accounts database.
import { chromium } from 'playwright-core';
import { closeTour } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync('tests/e2e/shots', { recursive: true });
let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};

const pool = await (await fetch(`${base}/api/saved/products`)).json();
const P1 = pool.products.find((p) => /Type C Fast Charging/i.test(p.name)) ?? pool.products[0];
const P2 = pool.products.find((p) => /MOFOX/i.test(p.name)) ?? pool.products[1];
const NEW_LINK = 'https://www.lazada.com.ph/products/pdp-i777777-s666666.html';
const stamp = Date.now();
const A = { name: 'Alice Tester', email: `alice${stamp}@example.com`, password: 'correct horse battery' };
const B = { name: 'Ben Tester', email: `ben${stamp}@example.com`, password: 'another long password' };
console.log(`(shared pool: ${pool.count} products; P1 "${P1.name.slice(0, 28)}…", P2 "${P2.name.slice(0, 28)}…")`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const savedDetailCalls = [];
page.on('request', (r) => r.url().includes('/api/saved/detail') && savedDetailCalls.push(r.url()));

// ---- a pretend scan of NEW_LINK ----------------------------------------------------------------
const detailP1 = await (await fetch(`${base}/api/saved/detail?link=${encodeURIComponent(P1.link)}`)).json();
const fresh = { ...detailP1.product, link: NEW_LINK, name: 'Alice scanned this (pretend)' };
const { comments: _c, ...freshCard } = fresh;
let polls = 0;
let finished = false;
await page.route('**/api/search', (route) => {
	const body = JSON.parse(route.request().postData() || '{}');
	if (!body.live) return route.continue();
	polls = 0;
	finished = false;
	return route.fulfill({ status: 202, json: { job: { id: 'jobA', state: 'running', stage: 1, stage_label: 'Collect reviews', progress: 18, message: 'Collecting…', platform: 'lazada', query: body.query, created_at: new Date().toISOString() } } });
});
await page.route('**/api/jobs/jobA', (route) => {
	polls += 1;
	const done = polls >= 2;
	if (done) finished = true;
	return route.fulfill({ json: { id: 'jobA', state: done ? 'complete' : 'running', stage: done ? 3 : 2, stage_label: 'x', progress: done ? 100 : 68, message: 'Working…', platform: 'lazada', query: NEW_LINK, created_at: new Date().toISOString() } });
});
// After the pretend scan, this browser's session catalog holds what the scan collected (as the real server does).
await page.route('**/api/products', (route) => (finished ? route.fulfill({ json: { products: [freshCard], count: 1 } }) : route.continue()));
for (const pattern of ['**/api/products/detail**', '**/api/saved/detail**']) {
	await page.route(pattern, (route) => {
		const link = new URL(route.request().url()).searchParams.get('link');
		return link === NEW_LINK ? route.fulfill({ json: { product: fresh, recommendations: [] } }) : route.continue();
	});
}

// ---- helpers --------------------------------------------------------------------------------------
const settle = (ms = 900) => page.waitForTimeout(ms);
const visit = async (path) => {
	await page.goto(base + path, { waitUntil: 'networkidle' });
	await settle();
};
const historyNames = async () => {
	await visit('/app/history');
	return (await page.locator('article a').allInnerTexts()).map((t) => t.trim());
};
const myLibrary = () => page.evaluate(() => fetch('/api/me/library').then((r) => r.json()));
async function signUp(who) {
	await page.getByRole('button', { name: /Sign in/ }).first().click();
	await page.getByRole('button', { name: /Sign up/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Full name').fill(who.name);
	await dialog.getByLabel('Email').fill(who.email);
	await dialog.getByLabel('Password', { exact: true }).fill(who.password);
	await dialog.getByLabel('Confirm password').fill(who.password);
	await dialog.getByRole('checkbox').click();
	await dialog.getByRole('button', { name: 'Create account' }).click();
	await closeTour(page);
	await settle();
}
async function signIn(who) {
	await page.getByRole('button', { name: /Sign in/ }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Email').fill(who.email);
	await dialog.getByLabel('Password', { exact: true }).fill(who.password);
	await dialog.getByRole('button', { name: 'Sign in' }).click();
	await page.getByText(new RegExp(`Signed in as ${who.name}`)).first().waitFor({ timeout: 15000 });
	await settle();
}
async function signOut(who) {
	await visit('/app/home');
	await page.getByRole('button', { name: new RegExp(who.name) }).click();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
	await page.waitForURL(base + '/');
	await settle();
}
const openReport = async (product) => {
	await visit(`/app/report?link=${encodeURIComponent(product.link)}`);
	await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
};

// What a guest on this browser still holds: nothing kept in the browser, and no last-scan card on the guest screen.
const guestKeeps = async () => {
	await visit('/scan');
	const kept = await page.evaluate(() => ['defaketive-activity', 'defaketive-wishlist'].map((k) => localStorage.getItem(k)).filter((v) => v && v !== '{}' && v !== '[]').length);
	const card = await page.getByText('Your report is ready').isVisible();
	return { kept, card };
};

// ---- 1. A brand-new guest cannot open the app at all -----------------------------------------------
await page.goto(base + '/app/history', { waitUntil: 'networkidle' });
await page.waitForURL(base + '/', { timeout: 10000 });
check((await page.locator('[data-slot="sidebar"]').count()) === 0, 'new guest: the app is closed, History sends them to the landing page');
await page.keyboard.press('Escape');
await settle(400);

// ---- 2. Account A: opens P1, saves it, scans a new product ------------------------------------------
await visit('/');
await signUp(A);
check((await historyNames()).length === 0, 'account A: starts with an empty history');
await openReport(P1);
await page.getByRole('button', { name: /^Save$/ }).click();
await settle(1200);
await visit('/app/analyze');
await page.locator('#search-query').fill(NEW_LINK);
await page.getByRole('button', { name: /Check this Lazada PH product/ }).click();
await page.waitForURL(/\/app\/report\?link=/, { timeout: 30000 });
await page.getByRole('heading', { level: 1, name: /Alice scanned this/ }).waitFor({ timeout: 15000 });
await settle(1200);
let names = await historyNames();
check(names.length === 2 && names.some((n) => n.includes('Alice scanned this')) && names.some((n) => n === P1.name.trim()), 'account A: history has exactly the product they opened and the one they scanned');
let lib = await myLibrary();
check(Object.keys(lib.activity).length === 2 && lib.wishlist.length === 1 && Boolean(lib.activity[NEW_LINK]), 'account A: both are stored in A\'s account on the server, with 1 saved product');
await page.screenshot({ path: 'tests/e2e/shots/accounts_A_history.png' });

// ---- 3. After A signs out, a guest on the same browser has nothing of A's ---------------------------
await signOut(A);
const after = await guestKeeps();
check(after.kept === 0, 'guest after A signs out: nothing of A is kept in the browser');
check(!after.card, 'guest after A signs out: A\'s finished-scan card is gone');
await page.goto(base + '/app/wishlist', { waitUntil: 'networkidle' });
await page.waitForURL(base + '/', { timeout: 10000 });
check((await page.locator('[data-slot="sidebar"]').count()) === 0, 'guest after A signs out: A\'s wishlist cannot be opened');
await page.keyboard.press('Escape');
await settle(400);

// ---- 4. Account B on the same browser -----------------------------------------------------------------
await visit('/');
await signUp(B);
names = await historyNames();
check(names.length === 0, 'account B (same browser): starts with an empty history, not A\'s');
await visit('/app/wishlist');
check(await page.getByText('0 products saved').isVisible(), 'account B: wishlist is empty, not A\'s');
await openReport(P2);
names = await historyNames();
check(names.length === 1 && names[0] === P2.name.trim(), 'account B: history has only the product B opened');
lib = await myLibrary();
check(Object.keys(lib.activity).length === 1 && Boolean(lib.activity[P2.link]) && lib.wishlist.length === 0, 'account B: only that product is stored in B\'s account');
await page.screenshot({ path: 'tests/e2e/shots/accounts_B_history.png' });
await visit('/app/products');
check(await page.getByText(new RegExp(`^${pool.count} products shown`)).isVisible(), `account B: Products lists the same shared pool (${pool.count})`);

// ---- 5. Back to A: still exactly A's ------------------------------------------------------------------
await signOut(B);
await signIn(A);
names = await historyNames();
check(names.length === 2 && !names.includes(P2.name.trim()), 'account A again: still exactly A\'s two products, none of B\'s');
await visit('/app/wishlist');
check(await page.getByText('1 product saved').isVisible(), 'account A again: A\'s saved product is still there');

// ---- 6. Recommendations come from the shared pool ------------------------------------------------------
check(savedDetailCalls.some((u) => u.includes(encodeURIComponent(P2.link)) || u.includes(encodeURIComponent(P1.link))), 'reports ask the whole database for the product and its similar products');
const rec = await (await fetch(`${base}/api/saved/detail?link=${encodeURIComponent(P1.link)}`)).json();
check(Array.isArray(rec.recommendations), `the recommendation route answers from the shared pool (${rec.recommendations.length} similar product(s) with no warning signs for P1)`);

check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
