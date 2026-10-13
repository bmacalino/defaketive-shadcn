// Check the live-scan screens WITHOUT touching any marketplace: the browser is given a pretend
// scan (start, progress, finish) while every other call goes to the real server.
import { chromium } from 'playwright-core';
import { signUp } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
const out = 'tests/e2e/shots';
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
fs.mkdirSync(out, { recursive: true });
const SAVED = 'https://www.lazada.com.ph/products/pdp-i5246060610-s31099995054.html';
const NEW_LINK = 'https://www.lazada.com.ph/products/pdp-i999999-s888888.html';

let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};

const real = await (await fetch(`${base}/api/products/detail?link=${encodeURIComponent(SAVED)}`)).json();
const fresh = { ...real.product, link: NEW_LINK, name: 'Fresh scanned cable (pretend)' };
const { comments, ...freshCard } = fresh;

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// The server's own words when the scraper has opened a Chrome window for a check (webapp.LAZADA_CHECK_MESSAGE).
const NEEDS_YOU =
	'Lazada is asking for a login or a check. Complete it in the Chrome window that just opened. The scan continues by itself afterwards.';

async function pretendScan(page, { limit = false, needsYou = false } = {}) {
	let polls = 0;
	let finished = false;
	await page.route('**/api/search', (route) => {
		const body = JSON.parse(route.request().postData() || '{}');
		if (limit) {
			return route.fulfill({ status: 429, json: { error: "You've used your 3 free scans today. Sign in or create a free account for unlimited scans.", limit_reached: true, guest: { limit: 3, left: 0 } } });
		}
		return route.fulfill({
			status: 202,
			json: { job: { id: 'job1', state: 'running', stage: 1, stage_label: 'Collect reviews', progress: 18, message: 'Opening Lazada and collecting public reviews…', platform: 'lazada', query: body.query, created_at: new Date().toISOString() }, guest: { limit: 3, left: 2 } }
		});
	});
	await page.route('**/api/jobs/job1', (route) => {
		polls += 1;
		const stage = polls < 2 ? 1 : polls < 3 ? 2 : 3;
		const done = polls >= 4;
		if (done) finished = true;
		// With needsYou, the first answer is the scraper waiting for the person; the next one has moved on.
		// With needsYou 'stays', it keeps waiting, so the screen can be looked at for as long as needed.
		const waiting = needsYou === 'stays' || (needsYou && polls === 1);
		if (needsYou === 'stays') polls = 1;
		return route.fulfill({ json: { id: 'job1', state: done ? 'complete' : 'running', stage, stage_label: 'x', progress: done ? 100 : [18, 68, 92][stage - 1], message: waiting ? NEEDS_YOU : done ? 'Analysis complete — 1 product(s) found.' : ['Collecting…', 'Analyzing English, Filipino, and Taglish review sentiment…', 'Preparing the report…'][stage - 1], needs_you: waiting, platform: 'lazada', query: NEW_LINK, created_at: new Date().toISOString() } });
	});
	// Until the pretend scan finishes the real catalog is used; afterwards the new product is in it.
	await page.route('**/api/products', (route) =>
		finished ? route.fulfill({ json: { products: [freshCard], count: 1 } }) : route.continue()
	);
	await page.route('**/api/products/detail**', (route) => route.fulfill({ json: { product: fresh, recommendations: [] } }));
}

// (a) stay on the Analyze page: the finished scan opens its report by itself.
{
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await signUp(context, base);
	const page = await context.newPage();
	await pretendScan(page);
	await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
	await page.locator('#search-query').fill(NEW_LINK);
	const go = page.getByRole('button', { name: /Check this Lazada PH product/ });
	check(await go.isVisible(), 'new link: main button says "Check this Lazada PH product"');
	check(!(await page.getByRole('button', { name: /Check again for new reviews/ }).isVisible()), 'new link: no "check again" button');
	await go.click();
	await page.getByText('Lazada PH live scan').waitFor({ timeout: 10000 });
	check(true, 'a running scan shows its panel');
	check(await page.getByText('A scan of one product usually takes 1 to 2 minutes.').isVisible(), 'the running scan says how long a Lazada scan usually takes');
	await page.screenshot({ path: `${out}/scan_running_analyze.png` });
	check(await page.locator('#search-query').isDisabled(), 'the form is locked while a scan runs');
	await page.waitForURL(/\/app\/report\?link=/, { timeout: 30000 });
	await page.getByRole('heading', { level: 1, name: /Fresh scanned cable/ }).waitFor({ timeout: 10000 });
	check(true, 'finished scan opens its report automatically');
	await context.close();
}

// (b) leave for Home, reload mid-scan: the status card keeps going and ends at "Open report".
{
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await signUp(context, base);
	const page = await context.newPage();
	await pretendScan(page);
	await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
	await page.locator('#search-query').fill(NEW_LINK);
	await page.getByRole('button', { name: /Check this Lazada PH product/ }).click();
	await page.getByText('Lazada PH live scan').waitFor({ timeout: 10000 });
	await page.getByRole('link', { name: 'Home' }).first().click();
	await page.waitForURL(/\/app\/home/);
	await page.getByRole('heading', { name: /Collecting product reviews|Reading the reviews|Preparing your report/ }).waitFor({ timeout: 10000 });
	check(true, 'Home shows the running scan card');
	await page.screenshot({ path: `${out}/scan_running_home.png` });
	await page.reload({ waitUntil: 'networkidle' });
	await page.getByRole('heading', { name: /Collecting product reviews|Reading the reviews|Preparing your report|Your report is ready/ }).waitFor({ timeout: 10000 });
	check(true, 'after a reload the scan is picked up again');
	await page.getByRole('heading', { name: 'Your report is ready' }).waitFor({ timeout: 30000 });
	check(true, 'the card ends at "Your report is ready"');
	await page.screenshot({ path: `${out}/scan_done_home.png` });
	await page.getByRole('button', { name: /Open report/ }).click();
	await page.waitForURL(/\/app\/report\?link=/);
	check(true, '"Open report" opens the finished report');
	await context.close();
}

// (c) The scraper opened a Chrome window for a login or a check: the panel says so in the server's words,
//     a notice appears wherever the person is, and the panel goes back to normal when the scan moves on.
{
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await signUp(context, base);
	const page = await context.newPage();
	await pretendScan(page, { needsYou: true });
	await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
	await page.locator('#search-query').fill(NEW_LINK);
	await page.getByRole('button', { name: /Check this Lazada PH product/ }).click();
	const panel = page.locator('[role="status"]').filter({ hasText: 'Lazada PH live scan' });
	await panel.getByText('This scan needs you').waitFor({ timeout: 10000 });
	check(true, 'a scan waiting for the person says "This scan needs you"');
	check(await panel.getByText(NEEDS_YOU).isVisible(), 'and what to do, in the server\'s words');
	check(await page.locator('[data-sonner-toast]').filter({ hasText: 'Your scan needs you' }).first().isVisible(), 'a notice appears as well');
	await page.screenshot({ path: `${out}/scan_needs_you.png` });
	await panel.getByText('Analyzing English, Filipino, and Taglish review sentiment…').waitFor({ timeout: 10000 });
	check(!(await panel.getByText('This scan needs you').isVisible()), 'the panel goes back to normal when the scan moves on');
	await page.waitForURL(/\/app\/report\?link=/, { timeout: 30000 });
	check(true, 'and the scan still ends at its report');
	await context.close();
}

// (d) That notice is readable by everyone: axe finds nothing on it, in light and in dark, and Home says it too.
for (const scheme of ['light', 'dark']) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
	await signUp(context, base);
	const page = await context.newPage();
	await pretendScan(page, { needsYou: 'stays' });
	await page.goto(base + '/app/analyze', { waitUntil: 'networkidle' });
	await page.locator('#search-query').fill(NEW_LINK);
	await page.getByRole('button', { name: /Check this Lazada PH product/ }).click();
	await page.getByText('This scan needs you').first().waitFor({ timeout: 10000 });
	await page.waitForTimeout(1600);
	await page.evaluate(axeSource);
	const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
	check(result.violations.length === 0, `accessibility: the "needs you" notice, ${scheme}${result.violations.length ? ' -> ' + result.violations.map((v) => v.id + ' ' + v.nodes[0].target.join(' ')).join('; ') : ''}`);
	await page.screenshot({ path: `${out}/scan_needs_you_${scheme}.png` });
	if (scheme === 'light') {
		await page.getByRole('link', { name: 'Home' }).first().click();
		await page.waitForURL(/\/app\/home/);
		await page.getByRole('heading', { name: 'This scan needs you' }).waitFor({ timeout: 10000 });
		check(await page.getByText(NEEDS_YOU).first().isVisible(), 'Home shows that the scan needs the person, with what to do');
	}
	await context.close();
}

// (e) A guest who is out of free scans is checked on the guest screen, in guest.mjs.

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
