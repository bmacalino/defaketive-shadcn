// The lock: everything under /app is for signed-in people. A guest never sees the app.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { closeTour, PASSWORD } from './_signin.mjs';

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

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function open(options = {}) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
	// Remember if the app's side menu was ever drawn, even for a moment.
	await context.addInitScript(() => {
		window.__sawApp = false;
		new MutationObserver(() => {
			if (document.querySelector('[data-slot="sidebar"]')) window.__sawApp = true;
		}).observe(document, { childList: true, subtree: true });
	});
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	return { context, page, errors };
}
const sawApp = (page) => page.evaluate(() => window.__sawApp);
const signInPopup = (page) => page.getByRole('dialog').getByText('Sign in or create a free account to open that page.');

// ---- 1. A guest who types an app address ------------------------------------------------------------
{
	const { context, page, errors } = await open();
	for (const route of ['/app/home', '/app/products', '/app/history', '/app/wishlist', '/app/settings']) {
		await page.goto(base + route, { waitUntil: 'networkidle' });
		await page.waitForURL(base + '/', { timeout: 10000 });
		await signInPopup(page).waitFor({ timeout: 5000 });
		check(!(await sawApp(page)), `guest: ${route} goes to the landing page and asks to sign in; the app is never drawn`);
	}
	await page.screenshot({ path: 'tests/e2e/shots/lock_signin.png' });
	// An address that is no page at all shows the plain "not found" page, not the app.
	await page.goto(base + '/app/nothing-here', { waitUntil: 'networkidle' });
	await page.waitForTimeout(800);
	check(!(await sawApp(page)), 'guest: a made-up app address never draws the app');
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await signInPopup(page).waitFor({ timeout: 5000 });
	await page.evaluate(axeSource);
	const axe = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
	check(axe.violations.length === 0, `accessibility: the sign-in pop-up after a redirect${axe.violations.length ? ' -> ' + axe.violations.map((v) => v.id).join(', ') : ''}`);

	await page.goto(`${base}/app/report?link=${encodeURIComponent(SAVED.link)}`, { waitUntil: 'networkidle' });
	await page.waitForURL(/\/scan\/report\?link=/, { timeout: 10000 });
	await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
	check(!(await sawApp(page)) && (await page.getByText("You're viewing this as a guest").isVisible()), 'guest: an app report link opens the same report on the guest screen');

	await page.goto(`${base}/app/analyze?q=${encodeURIComponent(SAVED.link)}`, { waitUntil: 'networkidle' });
	await page.waitForURL(/\/scan\?q=/, { timeout: 10000 });
	await page.waitForTimeout(600);
	check(!(await sawApp(page)) && (await page.locator('#guest-query').inputValue()) === SAVED.link, 'guest: the Analyze address opens the guest screen with the link filled in');

	for (const [route, hash, heading] of [['/app/about', '#about', 'The minds behind a safer shopping experience'], ['/app/faq', '#faq', 'Common questions']]) {
		await page.goto(base + route, { waitUntil: 'networkidle' });
		await page.waitForURL((url) => url.pathname === '/' && url.hash === hash, { timeout: 10000 });
		await page.waitForTimeout(900);
		const box = await page.getByRole('heading', { name: heading }).boundingBox();
		check(!(await sawApp(page)) && Boolean(box) && box.y >= 56 && box.y < 500 && (await page.getByRole('dialog').count()) === 0, `guest: ${route} opens that section of the landing page, no pop-up`);
	}

	// Ctrl+K and "/" keep a guest on the public site.
	await page.goto(base + '/', { waitUntil: 'networkidle' });
	await page.waitForTimeout(800);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog');
	await palette.getByText('Check a product').waitFor({ timeout: 5000 });
	const options = (await palette.getByRole('option').allInnerTexts()).map((t) => t.trim());
	check(!options.some((t) => /^(Home|Products|History|Wishlist|Settings)$/.test(t)) && (await palette.getByText('Analyzed products').count()) === 0, `guest: Ctrl+K lists only public pages (${options.join(', ')})`);
	await palette.getByRole('option', { name: 'Check a product' }).click();
	await page.waitForURL(base + '/scan', { timeout: 10000 });
	check(!(await sawApp(page)), 'guest: "Check a product" in Ctrl+K opens the guest screen');
	await page.goto(`${base}/scan/report?link=${encodeURIComponent(SAVED.link)}`, { waitUntil: 'networkidle' });
	await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
	await page.waitForTimeout(1000);
	await page.keyboard.press('/');
	await page.waitForURL(base + '/scan', { timeout: 10000 });
	await page.waitForTimeout(500);
	check((await page.evaluate(() => document.activeElement?.id)) === 'guest-query' && !(await sawApp(page)), 'guest: "/" on the guest report jumps to the guest scan box');
	check(errors.length === 0, `no browser errors as a guest${errors.length ? ': ' + errors[0] : ''}`);
	await context.close();
}

// ---- 2. Signing up from the redirect takes you where you were going ------------------------------------
{
	const { context, page, errors } = await open();
	const email = `lock${Date.now()}@example.com`;
	await page.goto(base + '/app/history?filter=safety', { waitUntil: 'networkidle' });
	await signInPopup(page).waitFor({ timeout: 10000 });
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /Sign up/ }).click();
	await dialog.getByLabel('Full name').fill('Lena Lock');
	await dialog.getByLabel('Email').fill(email);
	await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
	await dialog.getByLabel('Confirm password').fill(PASSWORD);
	await dialog.getByRole('checkbox').click();
	await dialog.getByRole('button', { name: 'Create account' }).click();
	await page.waitForURL(/\/app\/history\?filter=safety/, { timeout: 20000 });
	// The address changes a moment before the new page is drawn (pages cross-fade), so wait for the app itself.
	await page.locator('[data-slot="sidebar"]').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
	await page.getByRole('heading', { level: 1, name: /history/i }).waitFor({ timeout: 10000 }).catch(() => {});
	check(await sawApp(page), 'after creating an account from the redirect, the page first asked for opens');
	await closeTour(page);

	// Signed in: every page opens, also straight from its address (a reload or a bookmark).
	for (const route of ['/app/home', '/app/analyze', '/app/products', '/app/history', '/app/wishlist', '/app/settings', '/app/about', '/app/faq', `/app/report?link=${encodeURIComponent(SAVED.link)}`]) {
		await page.goto(base + route, { waitUntil: 'networkidle' });
		await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15000 });
		const stayed = new URL(page.url()).pathname === route.split('?')[0];
		check(stayed && (await page.locator('[data-slot="sidebar"]').count()) > 0 && (await page.getByRole('dialog').count()) === 0, `signed in: ${route.split('?')[0]} opens from its address`);
	}
	await page.goto(base + '/scan', { waitUntil: 'networkidle' });
	await page.waitForURL(/\/app\/analyze/, { timeout: 10000 });
	check(true, 'signed in: the guest screen sends you to the app');

	// Signing out leaves quietly: landing page, no pop-up asking to sign back in.
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /Lena Lock/ }).click();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
	await page.waitForURL(base + '/', { timeout: 10000 });
	await page.waitForTimeout(1200);
	check((await page.getByRole('dialog').count()) === 0 && (await page.getByRole('button', { name: 'Sign in' }).first().isVisible()), 'signing out lands on the landing page with no sign-in pop-up');

	// The app is closed again, and signing in goes back to the page asked for.
	await page.goto(base + '/app/wishlist', { waitUntil: 'networkidle' });
	await signInPopup(page).waitFor({ timeout: 10000 });
	check(new URL(page.url()).pathname === '/', 'after signing out, the app is closed again');
	await page.getByRole('dialog').getByLabel('Email').fill(email);
	await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(PASSWORD);
	await page.getByRole('dialog').getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL(/\/app\/wishlist/, { timeout: 20000 });
	check(true, 'signing in from the redirect opens the page first asked for');

	// Closing the pop-up without signing in just leaves you on the landing page.
	await page.goto(base + '/app/settings', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Delete account' }).click();
	await page.getByRole('dialog').getByLabel('Current password').fill(PASSWORD);
	await page.getByRole('dialog').getByRole('button', { name: 'Delete my account' }).click();
	await page.waitForURL(base + '/', { timeout: 15000 });
	await page.waitForTimeout(1200);
	check((await page.getByRole('dialog').count()) === 0, 'deleting the account lands on the landing page with no sign-in pop-up');
	check(errors.length === 0, `no browser errors signed in${errors.length ? ': ' + errors[0] : ''}`);
	await context.close();
}

// ---- 3. Phone ---------------------------------------------------------------------------------------
{
	const { context, page } = await open({ viewport: { width: 390, height: 844 } });
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await signInPopup(page).waitFor({ timeout: 10000 });
	check(!(await sawApp(page)) && (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'phone: a guest is sent to sign in, and the page fits');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(500);
	check(new URL(page.url()).pathname === '/' && (await page.getByRole('dialog').count()) === 0, 'closing the pop-up leaves the guest on the landing page');
	await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
