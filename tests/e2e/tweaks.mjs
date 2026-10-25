// The 21 Oct 2026 changes: Check shows one step, History filters by date and its chart starts when the account did,
// Home's two cards are one height, warning words fit their pills, and the word pills beside the review types are gone.
// Uses the real saved products (read only) and a test account.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { signUp } from './_signin.mjs';

const base = process.env.BASE || 'http://localhost:5173';
let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};
const pool = await (await fetch(`${base}/api/saved/products`)).json();
const byName = (pattern) => pool.products.find((p) => pattern.test(p.name));
const CAUTION = byName(/DoubleShock/i);
const CLEAN = byName(/Type C Fast Charging/i);
const MANY_WORDS = byName(/XB200/i);
const report = (p) => `${base}/app/report?link=${encodeURIComponent(p.link)}`;
const settle = (page, ms = 1300) => page.waitForTimeout(ms);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await signUp(context, base);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function openReport(product, tab = '') {
	await page.goto(report(product), { waitUntil: 'networkidle' });
	await page.getByRole('group', { name: 'Result' }).waitFor({ timeout: 15000 });
	await settle(page, 1200);
	if (tab) {
		await page.getByRole('tab', { name: new RegExp(tab) }).click();
		await settle(page, 800);
	}
}

// ---- The server: the sign-in answer carries the signup date, and a warning is explained in one line ----
const me = await (await context.request.get(base + '/api/auth/me')).json();
check(Boolean(me.user?.created_at) && !Number.isNaN(Date.parse(me.user.created_at)), `server: /api/auth/me sends the account's creation date (${me.user?.created_at})`);
const warned = pool.products.find((p) => ['safety_warning', 'possible_safety_issue', 'possible_counterfeit_or_defect'].includes(p.badge_view?.state));
check(Boolean(warned) && /^\d+ of \d+ reviews? (mentions?|says?|say) /.test(warned.badge_view.detail) && !/judge for yourself/.test(warned.badge_view.detail), `server: a warning's detail is one line ("${warned?.badge_view?.detail}")`);

// ---- Check a product: only the step you are on, and no side cards ----
await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
await settle(page, 800);
const analyze = await page.evaluate(() => document.body.innerText);
check(!analyze.includes('Step 1 of 3') && !analyze.includes('We read the reviews') && !analyze.includes('Read your report'), 'Check: no step line above the card');
check(!analyze.includes('What happens next?') && !analyze.includes('Check right on Lazada'), 'Check: the two side cards are gone');
// The page's own heading, inside the content area (.page-view). The first header in <main> is the app's top bar,
// which spans the whole width and is never as narrow as the content.
const widths = await page.evaluate(() => ({
	header: document.querySelector('main .page-view header')?.getBoundingClientRect().width ?? 0,
	card: document.querySelector('main .page-view [data-slot="card"]')?.getBoundingClientRect().width ?? 0
}));
check(widths.card > 0 && Math.abs(widths.card - widths.header) < 2, `Check: the card is as wide as the page (${Math.round(widths.card)} and ${Math.round(widths.header)})`);

// ---- Make some history: two reports opened today ----
await openReport(CAUTION);
await openReport(CLEAN);

// ---- Home: "Needs a look" and the overview are the same height ----
await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
await settle(page, 1800);
const heights = await page.evaluate(() => {
	const h = (selector) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0;
	return { look: h('[aria-labelledby="attention-title"]'), overview: h('[aria-label="Overview of your checked products"]') };
});
check(heights.look > 0 && Math.abs(heights.look - heights.overview) < 2, `Home: the two cards are one height (${Math.round(heights.look)} and ${Math.round(heights.overview)})`);

// ---- History: the date filter ----
await page.goto(base + '/app/history', { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'History', level: 1 }).waitFor();
await settle(page, 1200);
const count = async () => (await page.getByText(/^\d+ results?$/).first().innerText()).trim();
const pickDate = async (name) => {
	await page.getByRole('button', { name: /^Date:/ }).click();
	await page.getByRole('option', { name }).click();
	await settle(page, 500);
};
check((await count()) === '2 results', `History: two products, any time (${await count()})`);
check((await page.getByRole('button', { name: 'Date: Any time' }).innerText()).trim() === 'Any time', 'History: the date box says "Any time" and its name contains those words');
for (const name of ['Today', 'Last 7 days', 'Last 30 days']) {
	await pickDate(name);
	check((await count()) === '2 results', `History: "${name}" keeps both products opened today`);
}
await pickDate('Choose dates…');
const { today, yesterday } = await page.evaluate(() => {
	const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA');
	return { today: day(0), yesterday: day(-1) };
});
await page.locator('#history-from').fill(yesterday);
await page.locator('#history-to').fill(yesterday);
await settle(page, 400);
check((await count()) === '0 results' && (await page.getByText('Nothing in your history falls in these dates.').isVisible()), 'History: only yesterday gives no results, and says so');
await page.locator('#history-to').fill(today);
await settle(page, 400);
check((await count()) === '2 results', 'History: yesterday to today lists both');
await page.locator('#history-from').fill(today);
await page.locator('#history-to').fill(yesterday);
await settle(page, 400);
check((await count()) === '2 results', 'History: dates typed the wrong way round still work');
await page.locator('#history-from').fill(yesterday);
await page.locator('#history-to').fill(yesterday);
await settle(page, 400);
await page.getByRole('button', { name: 'Show all scans' }).click();
await settle(page, 500);
check((await count()) === '2 results' && (await page.getByRole('button', { name: 'Date: Any time' }).isVisible()) && (await page.locator('#history-from').count()) === 0, '"Show all scans" clears the dates too');

// ---- History: the chart starts on the day the account was made (at least 14 slots, at most 30 days back) ----
async function chartLabel(createdAt) {
	await page.unroute('**/api/auth/me').catch(() => {});
	await page.route('**/api/auth/me', async (route) => {
		const response = await route.fetch();
		const body = await response.json();
		await route.fulfill({ response, json: { ...body, user: body.user ? { ...body.user, created_at: createdAt } : null } });
	});
	await page.goto(base + '/app/history', { waitUntil: 'networkidle' });
	await page.getByRole('heading', { name: 'History', level: 1 }).waitFor();
	await settle(page, 1500);
	return page.locator('[role="img"][aria-label^="Products checked per day"]').getAttribute('aria-label');
}
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
// "Oct 22", for the day `offset` days from today, written the way the chart writes it.
const dayName = (offset) =>
	page.evaluate((n) => {
		const day = new Date();
		day.setHours(0, 0, 0, 0);
		day.setDate(day.getDate() + n);
		return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(day);
	}, offset);
const chart = async (first, last) => `Products checked per day from ${await dayName(first)} to ${await dayName(last)}: 2 in total`;
check((await chartLabel(ago(4))) === (await chart(-4, 9)), 'chart: an account made 4 days ago starts that day and has 14 slots');
check((await chartLabel(ago(0))) === (await chart(0, 13)), 'chart: an account made today starts today and has 14 slots (thin bars, not one slab)');
check((await chartLabel(ago(20))) === (await chart(-20, 0)), 'chart: after 14 days it shows the real days, from the first one');
check((await chartLabel(ago(90))) === (await chart(-29, 0)), 'chart: an old account shows at most the last 30 days');
check((await chartLabel('not a date')) === (await chart(-13, 0)), 'chart: no usable date falls back to the last 14 days');
await page.unroute('**/api/auth/me').catch(() => {});

// ---- A report: labels card, warning words and the review list ----
await openReport(CLEAN);
const guide = await page.locator('#report-guide').innerText();
check(/real safety reports/.test(guide) && !/View full detail/.test(guide), 'report: the labels card has the one accuracy line and no full-detail button');
check(guide.split('\n').filter((line) => /^(No warnings|Caution|Safety reports|No result yet)/.test(line.trim())).length === 4, 'report: the labels card lists the four labels');

if (MANY_WORDS) {
	await openReport(MANY_WORDS, 'Reviews');
	const words = await page.evaluate(() => {
		const card = [...document.querySelectorAll('[data-slot="card"]')].find((c) => c.textContent.includes('Warning words found'));
		return [...(card?.querySelectorAll('button') ?? [])].map((b) => ({ text: b.textContent.trim(), clipped: b.scrollWidth > b.clientWidth + 1, width: Math.round(b.getBoundingClientRect().width) }));
	});
	check(words.length >= 2 && words.every((w) => !w.clipped), `warning words: no word is cut off (${words.map((w) => w.text).join(', ')})`);
	check(new Set(words.map((w) => w.width)).size > 1 || new Set(words.map((w) => w.text.length)).size === 1, `warning words: each pill is as wide as its word (${words.map((w) => w.width + 'px').join(', ')})`);
	check((await page.getByRole('group', { name: 'Filter by warning word' }).count()) === 0 && (await page.getByRole('searchbox', { name: 'Filter reviews by word' }).isVisible()), 'reviews: the word pills beside the types are gone; the search box stays');
	await page.getByRole('button', { name: words[0].text, exact: true }).click();
	await settle(page, 900);
	check(await page.getByText(new RegExp(`for “${words[0].text}”`)).first().isVisible(), 'warning words: picking one still narrows the reviews');
	check((await page.getByRole('radio', { name: /^All/ }).getAttribute('data-state')) === 'on', 'warning words: the list shows All reviews with that word');
	await page.getByRole('radio', { name: /^Flagged/ }).click();
	await page.getByRole('radio', { name: /^All/ }).click();
	await settle(page, 400);
	check(!(await page.getByText(new RegExp(`for “${words[0].text}”`)).count()), 'reviews: "All" clears the picked word');
} else {
	console.log('SKIP  warning-word checks: no XB200 product in the saved reports');
}

check(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
