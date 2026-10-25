// The agency view (agency_api.py): only an account the team marked can open it; it lists what the saved reports
// say about safety, an evidence sheet per listing prints on white paper, and "New" clears per account.
// The agency account is made the only way there is: scripts/agency_accounts.py, on the scratch accounts database.
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PASSWORD, signUp } from './_signin.mjs';

const base = process.env.BASE || 'http://localhost:5173';
// The runners start every test file from the project folder.
const root = process.cwd();
const beside = path.resolve(root, '../Capstone-Version-Control-Version-1.1');
const original = process.env.DEFAKETIVE_ORIGINAL || (fs.existsSync(path.join(beside, 'webapp.py')) ? beside : path.join(root, 'backend'));
const python = path.join(original, '.venv', 'Scripts', 'python.exe');
// The scratch database the test servers use (run.mjs and the spare-port runner both point the server at it).
const accountsDb = process.env.DEFAKETIVE_ACCOUNTS_DB || path.join(root, 'tests', '.tmp', 'accounts-test.db');
fs.mkdirSync('tests/e2e/shots', { recursive: true });
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};
const axeCheck = async (page, what) => {
	await page.evaluate(axeSource);
	const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
	check(result.violations.length === 0, `accessibility: ${what}${result.violations.length ? ' -> ' + result.violations.map((v) => `${v.id} (${v.nodes[0]?.target.join(' ')})`).join(', ') : ''}`);
};
// Against the phone's own width: a phone page can widen itself to fit what spills over, and then innerWidth grows too.
const noSideways = (page, width = 390) => page.evaluate((w) => document.documentElement.scrollWidth <= w + 1 && [...document.querySelectorAll("main *, [data-slot=sidebar-inset] *")].every((el) => el.getBoundingClientRect().right <= w + 1 || el.closest("[data-slot=table-container]")), width);

function grant(email) {
	const result = spawnSync(python, [path.join(root, 'scripts', 'agency_accounts.py'), 'add', '--email', email], {
		cwd: root,
		env: { ...process.env, DEFAKETIVE_ACCOUNTS_DB: accountsDb },
		encoding: 'utf8'
	});
	if (result.status !== 0) throw new Error(`agency_accounts.py failed: ${result.stderr || result.stdout}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function open(options = {}) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	return { context, page, errors };
}
const agencyLink = (page) => page.locator('[data-sidebar="sidebar"]').getByRole('link', { name: /DTI view/ });
const sidebarReady = (page) => page.locator('[data-sidebar="menu-button"][href="/app/home"]').waitFor({ timeout: 20000 });

// ---- 1. A shopper never sees it ---------------------------------------------------------------------------------
const shopper = await open();
const shopperWho = await signUp(shopper.context, base, 'Plain Shopper');
{
	const { context, page } = shopper;
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await sidebarReady(page);
	await page.waitForTimeout(800);
	check((await agencyLink(page).count()) === 0, 'shopper: no agency item in the menu');
	check((await page.locator('[data-agency-guide]').count()) === 0, 'shopper: the agency guide never opens');
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog');
	await palette.getByRole('option', { name: 'Home', exact: true }).waitFor({ timeout: 5000 });
	check((await palette.getByRole('option', { name: /DTI view/ }).count()) === 0, 'shopper: Ctrl+K does not list the agency view');
	await page.keyboard.press('Escape');
	await page.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await page.getByText('This page is for partner agencies', { exact: true }).waitFor({ timeout: 15000 });
	check((await page.getByText('How to read this list', { exact: true }).count()) === 0 && (await page.locator('article').count()) === 0, 'shopper: /app/agency shows the "for partner agencies" screen and no listing');
	const answer = await context.request.get(base + '/api/agency/watch');
	check(answer.status() === 403, `shopper: the server refuses the watch list (${answer.status()})`);
	const sheet = await context.request.get(base + '/api/agency/evidence?link=x');
	check(sheet.status() === 403, `shopper: the server refuses an evidence sheet (${sheet.status()})`);
	await axeCheck(page, 'the "for partner agencies" screen');
}

// A guest is sent away like on any app page, and the server asks them to sign in.
{
	const { context, page } = await open();
	await page.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await page.waitForURL(base + '/', { timeout: 10000 });
	check(true, 'guest: /app/agency goes to the landing page');
	check((await context.request.get(base + '/api/agency/watch')).status() === 401, 'guest: the server asks to sign in');
	await context.close();
}

// ---- 2. An agency account -----------------------------------------------------------------------------------------
const { context, page, errors } = await open();
const who = await signUp(context, base, 'Agency Officer');
grant(who.email);
// This account's "Get started" guide would open over the first page; section 7 tests it with an account of its own.
await context.request.post(base + '/api/agency/guide', { data: {} });
const api = async (url, options) => (await (options ? context.request.post(base + url, options) : context.request.get(base + url))).json();
const reports = await api('/api/agency/watch?level=reports');
const mentions = await api('/api/agency/watch?level=mentions');
const patterns = await api('/api/agency/patterns');
check(reports.rows.length > 0 && reports.rows.every((row) => row.level === 'reports' && row.new), `the real saved reports give ${reports.rows.length} listings with safety reports, all new at first`);
check(!JSON.stringify([reports, mentions, patterns]).includes('"author"'), 'no answer holds a reviewer-name field');

await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
await sidebarReady(page);
await agencyLink(page).waitFor({ timeout: 10000 });
const badge = page.locator('[data-sidebar="menu-badge"]');
check((await badge.innerText()).trim() === String(reports.new.reports), `menu: "DTI view" shows ${reports.new.reports} new listings`);
await page.keyboard.press('Control+k');
check(await page.getByRole('dialog').getByRole('option', { name: /DTI view/ }).isVisible(), 'Ctrl+K lists the agency view');
await page.keyboard.press('Escape');

await agencyLink(page).click();
await page.waitForURL(/\/app\/agency$/);
await page.getByRole('heading', { level: 1, name: 'DTI view' }).waitFor({ timeout: 15000 });
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
check(await page.getByText(reports.note).isVisible(), 'the leads-not-proof note is at the top, in the server\'s words');
check(await page.getByText(/caught \d+ of \d+ real safety reports/).isVisible(), 'the measured accuracy of the safety check is shown');
const rows = page.locator('[role="tabpanel"][data-state="active"] article');
check((await rows.count()) === reports.rows.length, `watch list: ${reports.rows.length} listings with safety reports`);
const first = reports.rows[0];
const firstRow = rows.first();
check((await firstRow.getByRole('heading', { level: 3 }).innerText()).includes(first.name.slice(0, 20)) && (await firstRow.getByText('New', { exact: true }).isVisible()), 'the newest report is first, tagged New');
check(await firstRow.getByText('Safety reports', { exact: true }).isVisible(), 'a listing carries the red "Safety reports" chip');
check((await page.getByText(`${reports.new.reports} new`, { exact: true }).isVisible()), 'the toolbar counts the new listings');
await page.screenshot({ path: 'tests/e2e/shots/agency_watch.png', fullPage: true });
await axeCheck(page, 'watch list (light)');

// One "Label" menu holds every label, each with its count; no level buttons at the top any more.
const pickLabel = async (name) => {
	await page.locator('#label-filter').click();
	await page.getByRole('option', { name: new RegExp(`^${name} ·`) }).click();
	await page.waitForTimeout(400);
};
const flagged = [...reports.rows, ...mentions.rows];
const withAlso = (category) => flagged.filter((row) => row.also.some((item) => item.category === category)).length;
await page.locator('#label-filter').click();
const labelOptions = (await page.getByRole('option').allInnerTexts()).map((text) => text.trim());
const expectedLabels = [`All labels · ${flagged.length}`, `Safety reports · ${reports.rows.length}`, `Safety mentions · ${mentions.rows.length}`, `Possible fake · ${withAlso('counterfeit')}`, `Not as advertised · ${withAlso('not_as_described')}`];
check(JSON.stringify(labelOptions) === JSON.stringify(expectedLabels), `the Label menu lists every label with its count (${labelOptions.join(', ')})`);
await page.keyboard.press('Escape');
check((await page.getByRole('radio').count()) === 0, 'no level buttons above the list');
await pickLabel('Safety mentions');
check((await rows.count()) === mentions.rows.length, `label: ${mentions.rows.length} listings with safety mentions`);
check(mentions.rows.length === 0 || ((await rows.first().getByText('Safety mentions', { exact: true }).isVisible()) && (await rows.first().getByText('Caution', { exact: true }).count()) === 0), 'a mention carries the orange chip, named "Safety mentions" like its label');
await pickLabel('All labels');
check((await rows.count()) === flagged.length, `label: all ${flagged.length} flagged listings together`);
await pickLabel('Not as advertised');
check((await rows.count()) === withAlso('not_as_described'), `label: ${withAlso('not_as_described')} listings also "not as advertised", at either level`);
await pickLabel('Safety reports');

// Overview: four charts, each with its own words, and every kind in the table.
await page.getByRole('tab', { name: 'Overview' }).click();
const panel = page.locator('[role="tabpanel"][data-state="active"]');
const table = panel.locator('section[aria-labelledby="kinds-table-title"] table');
await table.waitFor({ timeout: 5000 });
check((await table.locator('tbody tr').count()) === patterns.kinds.length, `by kind: one row for each of the ${patterns.kinds.length} kinds`);
check((await table.locator('tbody tr').last().locator('td').first().innerText()).trim() === 'Other' || !patterns.kinds.some((k) => k.kind === 'Other'), '"Other" comes last');
check(await page.getByText(/Lazada listings DeFaketive has checked/).isVisible(), 'the line above the table says it covers only listings DeFaketive checked');
const titles = await panel.getByRole('heading', { level: 3 }).allInnerTexts();
check(['By product kind', 'By price', 'Kinds of hazard', 'When buyers reported', 'What else buyers report'].every((t) => titles.includes(t)), `the five charts are there (${titles.join(', ')})`);
const flaggedKinds = patterns.kinds.filter((k) => k.reports + k.mentions > 0).length;
check((await panel.locator('ul[aria-label="Listings with safety reviews, by kind of product"] > li').count()) === flaggedKinds, `kinds chart: one bar for each of the ${flaggedKinds} kinds with safety reviews`);
check((await panel.locator('ul[aria-label="Safety quotes by kind of hazard"] > li').count()) === patterns.charts.hazards.length, 'hazard chart: one bar per kind of hazard');
check((await panel.locator('ul[aria-label="Safety reviews by year"] > li').count()) === patterns.charts.years.length, 'year chart: one column per year');
const topHazard = patterns.charts.hazards[0];
check(await panel.getByText(`Most often: ${topHazard.hazard}, ${topHazard.quotes.toLocaleString()} of`).isVisible(), 'each chart says what it shows in words');
check(await panel.getByText('so this does not show that cheap means unsafe').isVisible(), 'the price chart says what it does not show');
const priceCard = panel.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: 'By price' }) });
await priceCard.getByRole('button', { name: 'Show the numbers' }).click();
check((await priceCard.locator('tbody tr').count()) === patterns.charts.prices.filter((b) => b.listings).length, '"Show the numbers" gives the price chart as a table');
await page.waitForTimeout(400);
await page.screenshot({ path: 'tests/e2e/shots/agency_overview.png', fullPage: true });
await axeCheck(page, 'overview (light)');

// Sellers with more than one flagged listing.
const sellers = await api('/api/agency/sellers');
await page.getByRole('tab', { name: 'Sellers' }).click();
await page.waitForTimeout(400);
const sellerCards = page.locator('[role="tabpanel"][data-state="active"] ul[aria-label="Sellers with more than one flagged listing"] > li');
check((await sellerCards.count()) === sellers.sellers.length, `sellers: ${sellers.sellers.length} sellers with two or more flagged listings`);
check(await page.getByText(sellers.note).isVisible(), 'sellers: the note says names are not checked identities');
check(!JSON.stringify(sellers).includes('"author"'), 'sellers: no reviewer names');
await page.screenshot({ path: 'tests/e2e/shots/agency_sellers.png', fullPage: true });
await axeCheck(page, 'sellers (light)');
await page.getByRole('tab', { name: 'Watch list' }).click();
await page.waitForTimeout(300);

// The watch list as a spreadsheet.
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download spreadsheet' }).click()]);
const csvPath = await download.path();
const csvText = fs.readFileSync(csvPath, 'utf8');
check(/^defaketive-dti-watch-list-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), `download: named ${download.suggestedFilename()}`);
check(csvText.replace(/^﻿/, '').startsWith('Level,Listing,Link,Seller'), 'download: a spreadsheet with the column names first');
check(csvText.trim().split(/\r?\n/).length === reports.rows.length + 1, `download: one line per listing at this level (${reports.rows.length})`);

// A status and a note, kept for this account.
const statusMenu = page.locator('#row-0-status');
await statusMenu.click();
await page.getByRole('option', { name: 'Under review' }).click();
await page.getByText('Status: Under review.').waitFor({ timeout: 10000 });
await firstRow.getByRole('button', { name: /^Add note for/ }).click();
const noteDialog = page.getByRole('dialog');
await noteDialog.getByRole('textbox').fill('Asked the regional office to look at this listing.');
await axeCheck(page, 'note pop-up');
await noteDialog.getByRole('button', { name: 'Save note' }).click();
await page.getByText('Note saved.').waitFor({ timeout: 10000 });
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
check((await page.locator('#row-0-status').innerText()).trim().endsWith('Under review') && (await rows.first().getByText('Asked the regional office to look at this listing.').isVisible()), 'status and note are still there after a reload');
await page.locator('#status-filter').click();
await page.getByRole('option', { name: 'Under review' }).click();
await page.waitForTimeout(300);
check((await rows.count()) === 1, 'case status filter: only the listing marked "Under review"');
await page.locator('#status-filter').click();
await page.getByRole('option', { name: 'Closed, no action' }).click();
await page.getByText('No listings match').waitFor({ timeout: 5000 });
check(true, 'status filter: a status nobody has gives an empty screen with a way back');
await page.getByRole('button', { name: 'Clear filters' }).last().click();
await page.waitForTimeout(300);
check((await rows.count()) === reports.rows.length, 'and "Clear filters" brings every listing back');

// Newest complaint first: each listing's latest safety review, never older than the one after it.
const ages = reports.rows.map((row) => row.latest_report_age).filter((age) => age !== null);
check(ages.every((age, index) => index === 0 || ages[index - 1] <= age), 'the server orders the list by newest safety review');
check(await rows.first().getByText(/^\d+ safety reviews? · latest /).isVisible(), 'each listing says how many safety reviews and when the latest was');
// A listing in the list is short: one quote, no long hazard sentence; the rest is on its evidence sheet.
check((await rows.first().locator('blockquote').count()) <= 1 && !(await rows.first().innerText()).includes('reviews read') && !(await rows.first().innerText()).includes('Report checked'), 'a listing shows one quote and leaves the details to the evidence sheet');

// Search, filters and sort, kept in the address.
const words = (text) => text.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (row, q) => words(q).every((word) => `${row.name} ${row.seller}`.toLowerCase().includes(word));
await pickLabel('Safety mentions');
await page.waitForTimeout(300);
const searchFor = mentions.rows.find((row) => row.seller && mentions.rows.filter((other) => other.seller === row.seller).length > 1)?.seller ?? mentions.rows[0].seller;
const found = mentions.rows.filter((row) => matches(row, searchFor)).length;
await page.locator('#watch-search').fill(searchFor);
await page.waitForTimeout(400);
check((await rows.count()) === found && (await page.getByText(`Showing ${found} of ${mentions.rows.length}.`).isVisible()), `search "${searchFor}": ${found} listings, and it says so`);
check(new URL(page.url()).searchParams.get('q') === searchFor && new URL(page.url()).searchParams.get('label') === 'mentions', 'the search and the label are in the address');
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
await page.waitForTimeout(300);
check((await page.locator('#watch-search').inputValue()) === searchFor && (await rows.count()) === found, 'a reload keeps the search and the label');
await page.getByRole('button', { name: 'Clear filters' }).first().click();
await page.waitForTimeout(300);
check((await rows.count()) === reports.rows.length && !new URL(page.url()).searchParams.get('q') && (await page.locator('#label-filter').innerText()).startsWith('Safety reports'), '"Clear filters" empties the search and puts the label back to Safety reports');
await pickLabel('Safety mentions');

const pick = async (id, name) => {
	await page.locator(id).click();
	await page.getByRole('option', { name, exact: true }).click();
	await page.waitForTimeout(300);
};
const chargers = mentions.rows.filter((row) => row.kind === 'Charger');
await pick('#kind-filter', 'Charger');
check((await rows.count()) === chargers.length, `kind filter: ${chargers.length} chargers with safety mentions`);
const cheap = chargers.filter((row) => row.price_band === 'Under ₱200');
await pick('#price-filter', 'Under ₱200');
check((await rows.count()) === cheap.length, `kind and price together: ${cheap.length} chargers under ₱200`);
check((await page.locator('#sort-filter').count()) === 0, 'no "Sort by" menu: the newest complaint always comes first');
await page.getByRole('button', { name: 'Clear filters' }).first().click();
await pickLabel('Safety reports');
await page.waitForTimeout(300);

// A bar on the Overview opens the watch list for that kind.
await page.getByRole('tab', { name: 'Overview' }).click();
await page.getByRole('button', { name: /^Charger: show on the watch list/ }).click();
await page.waitForTimeout(400);
// A kind opens "All labels": every flagged listing of that kind, red and orange.
const redChargers = flagged.filter((row) => row.kind === 'Charger');
check((await page.getByRole('tab', { name: 'Watch list' }).getAttribute('data-state')) === 'active' && (await rows.count()) === redChargers.length && (await page.locator('#kind-filter').innerText()).includes('Charger') && (await page.locator('#label-filter').innerText()).startsWith('All labels'), `clicking "Charger" on the Overview shows all ${redChargers.length} flagged chargers`);

// The combined report of what the list shows.
await page.getByRole('link', { name: 'Printable report', exact: true }).click();
await page.waitForURL(/\/app\/agency\/report\?/);
await page.getByRole('heading', { level: 1, name: 'Safety reports and safety mentions' }).waitFor({ timeout: 20000 });
const reportSheets = page.locator('article[aria-labelledby$="-title"]');
check((await reportSheets.count()) === redChargers.length, `printable report: one sheet per listing shown (${redChargers.length})`);
check((await page.locator('table tbody tr').count()) === redChargers.length, 'printable report: a summary table of the same listings');
check(await page.getByText('kind of product: Charger').isVisible(), 'printable report: the cover says what is in it');
check((await page.getByRole('button', { name: 'Not a safety problem' }).count()) === 0, 'printable report: no buttons inside the sheets');
await page.screenshot({ path: 'tests/e2e/shots/agency_report.png', fullPage: true });
await axeCheck(page, 'printable report (light)');
await page.emulateMedia({ media: 'print' });
const breaks = await page.evaluate(() => [...document.querySelectorAll('[data-print="page"]')].map((el) => getComputedStyle(el).breakBefore));
check(breaks.length === redChargers.length && breaks.every((value) => value === 'page'), 'print: each sheet starts on a new page');
await page.emulateMedia({ media: 'screen' });

// One seller's listings, from the Sellers tab.
await page.goto(base + '/app/agency?tab=sellers', { waitUntil: 'networkidle' });
const firstSeller = sellers.sellers[0];
await page.getByRole('link', { name: `Printable report for ${firstSeller.seller}` }).click();
await page.getByRole('heading', { level: 1, name: `Listings from ${firstSeller.seller}` }).waitFor({ timeout: 20000 });
check((await reportSheets.count()) === firstSeller.flagged.length, `seller report: all ${firstSeller.flagged.length} flagged listings of ${firstSeller.seller}`);

// Everything at once is more than one report holds.
if (reports.rows.length + mentions.rows.length > 60) {
	await page.goto(base + '/app/agency/report?level=all', { waitUntil: 'networkidle' });
	await page.getByText('Too many listings for one report').waitFor({ timeout: 20000 });
	check(true, 'more than 60 listings: the page asks to narrow the filters');
}
await page.goto(base + '/app/agency', { waitUntil: 'networkidle' });
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });

// "Latest safety review" as a date range: a calendar pop-up, first day then last.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const rangeFrom = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const rangeTo = iso(now);
const inRange = reports.rows.filter((row) => row.latest_report && row.latest_report >= rangeFrom && row.latest_report <= rangeTo).length;
check((await page.locator('#date-filter').innerText()).includes('Any time'), 'the date range starts as "Any time"');
await page.locator('#date-filter').click();
const calendar = page.locator('[data-slot="popover-content"]');
await calendar.waitFor({ timeout: 5000 });
await page.waitForTimeout(300);
await axeCheck(page, 'date range calendar (light)');
await calendar.locator(`[data-value="${rangeFrom}"]`).first().click();
await calendar.locator(`[data-value="${rangeTo}"]`).first().click();
await page.waitForTimeout(500);
check((await calendar.count()) === 0 || !(await calendar.isVisible()), 'picking the last day closes the calendar');
check((await rows.count()) === inRange, `date range ${rangeFrom} to ${rangeTo}: ${inRange} red-level listings whose latest safety review falls in it`);
check(new URL(page.url()).searchParams.get('from') === rangeFrom && new URL(page.url()).searchParams.get('to') === rangeTo && !(await page.locator('#date-filter').innerText()).includes('Any time'), 'the range is in the address and on the button');
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
await page.waitForTimeout(300);
check((await rows.count()) === inRange, 'a reload keeps the date range');
await page.locator('#date-filter').click();
await calendar.getByRole('button', { name: 'Clear' }).click();
await page.waitForTimeout(400);
check((await rows.count()) === reports.rows.length && (await page.locator('#date-filter').innerText()).includes('Any time'), '"Clear" in the calendar empties the range');
const withFake = (list) => list.filter((row) => row.also.some((item) => item.category === 'counterfeit'));
await pickLabel('Possible fake');
check((await rows.count()) === withFake(flagged).length, `label "Possible fake": ${withFake(flagged).length} flagged listings also called a possible fake`);
check(withFake(flagged).length === 0 || (await rows.first().getByText('Possible fake', { exact: true }).isVisible()), 'such a listing shows "Possible fake" as a small badge');
await page.getByRole('button', { name: 'Clear filters' }).first().click();
await page.waitForTimeout(300);

// The Overview's "What else buyers report" opens the watch list with that filter.
await page.getByRole('tab', { name: 'Overview' }).click();
const alsoList = page.locator('[role="tabpanel"][data-state="active"] ul[aria-label="Flagged listings that buyers also report other problems about"] > li');
await alsoList.first().waitFor({ timeout: 5000 });
check((await alsoList.count()) === patterns.charts.also.length, `"What else buyers report": one bar per other problem (${patterns.charts.also.map((item) => `${item.label} ${item.reports + item.mentions} of ${item.flagged}`).join(', ')})`);
await page.getByRole('button', { name: /^Possible fake: show on the watch list/ }).click();
await page.waitForTimeout(400);
check((await page.locator('#label-filter').innerText()).startsWith('Possible fake') && (await rows.count()) === withFake(flagged).length, `clicking "Possible fake" shows those ${withFake(flagged).length} listings`);
await pickLabel('Safety reports');

// A report opened from the watch list goes back to the watch list, not to the Check page, and is not added to the
// account's own History (work, not shopping).
const historyCount = async () => Object.keys((await api('/api/me/library')).activity ?? {}).length;
const historyBefore = await historyCount();
await firstRow.getByRole('link', { name: 'Open report' }).click();
await page.waitForURL(/\/app\/report\?link=.*&from=agency/);
const back = page.getByRole('button', { name: 'Back to DTI view' });
await back.waitFor({ timeout: 15000 });
await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
check((await historyCount()) === historyBefore, 'a report opened from the DTI view is not added to History');
await back.click();
await page.waitForURL(/\/app\/agency$/);
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
check(true, 'a report opened from the DTI view has "Back to DTI view", and it goes back there');
// Opened straight from an address, with nothing before it, it still offers to check another product.
await page.goto(base + `/app/report?link=${encodeURIComponent(first.link)}`, { waitUntil: 'networkidle' });
check(await page.getByRole('button', { name: 'Check another product' }).waitFor({ timeout: 15000 }).then(() => true, () => false), 'a report opened from its address still says "Check another product"');
await page.goto(base + '/app/agency', { waitUntil: 'networkidle' });
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });

// ---- 3. An evidence sheet ------------------------------------------------------------------------------------------
await firstRow.getByRole('link', { name: 'Evidence sheet' }).click();
await page.waitForURL(/\/app\/agency\/evidence\?link=/);
await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
const { sheet } = await api(`/api/agency/evidence?link=${encodeURIComponent(first.link)}`);
check((await page.getByRole('heading', { level: 1 }).innerText()).trim() === first.name.trim(), 'the sheet is for the listing opened');
check((await page.locator('article[aria-labelledby="sheet-title"] ol > li').count()) === sheet.reviews.length && sheet.reviews.length === first.safety_mentions, `it lists every one of the ${first.safety_mentions} reviews the report counts`);
check(await page.getByText('not an official finding of the DTI or of Lazada').isVisible(), 'it says it is not an official finding');
check(await page.getByRole('link', { name: first.link }).isVisible(), 'the full listing address is printed');
check(await page.getByText(/Reviewers' names are left out/).isVisible(), 'it says reviewers\' names are left out');
const topVariant = sheet.variants[0];
check(!topVariant || (await page.getByText(`${topVariant.variant} × ${topVariant.reviews}`, { exact: true }).isVisible()), `it names the variants in its safety reviews${topVariant ? ` ("${topVariant.variant} × ${topVariant.reviews}")` : ''}`);
await page.screenshot({ path: 'tests/e2e/shots/agency_sheet.png', fullPage: true });
await axeCheck(page, 'evidence sheet (light)');
check((await page.locator('#sheet-status').innerText()).trim().endsWith('Under review'), 'the sheet shows the same status as the watch list');

// "Not a safety problem" on the first quote: sent, shown, taken back; the report stays the same.
const firstQuote = sheet.reviews[0].quotes[0].text;
await page.getByRole('button', { name: 'Not a safety problem' }).first().click();
const whyDialog = page.getByRole('dialog');
await whyDialog.getByRole('textbox').fill('This reads as a song, not a burn.');
await axeCheck(page, '"not a safety problem" pop-up');
await whyDialog.getByRole('button', { name: 'Send to the team' }).click();
await page.getByText('You marked this as not a safety problem.').first().waitFor({ timeout: 10000 });
const markedSheet = (await api(`/api/agency/evidence?link=${encodeURIComponent(first.link)}`)).sheet;
check(markedSheet.reviews.some((r) => r.quotes.some((q) => q.text === firstQuote && q.marked_not_safety)), 'the server keeps the mark');
check(markedSheet.safety_mentions === sheet.safety_mentions && markedSheet.headline === sheet.headline, 'the report and its count do not change');
await page.getByRole('button', { name: 'Undo' }).first().click();
await page.getByText('Taken back.').waitFor({ timeout: 10000 });
check(!(await api(`/api/agency/evidence?link=${encodeURIComponent(first.link)}`)).sheet.reviews.some((r) => r.quotes.some((q) => q.marked_not_safety)), 'Undo takes the mark back');
const after = await api('/api/agency/watch');
check(after.new.reports === reports.new.reports - 1, 'opening the sheet marks that listing as seen');
await page.waitForTimeout(500);
check((await badge.innerText()).trim() === String(after.new.reports), 'the menu count goes down with it');

// Printing: only the sheet, never the menu, the top bar or the footer, and dark text on white.
await page.emulateMedia({ media: 'print' });
const hidden = await page.evaluate(() => ['[data-slot="sidebar-container"]', 'header[data-print="hide"]', '[data-print="hide"]'].map((s) => [...document.querySelectorAll(s)].every((el) => getComputedStyle(el).display === 'none')));
check(hidden.every(Boolean), 'print: the menu, the top bar, the buttons and the footer are left out');
await page.emulateMedia({ media: 'screen' });

// ---- 4. Mark all as seen ---------------------------------------------------------------------------------------------
await page.goto(base + '/app/agency', { waitUntil: 'networkidle' });
await page.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Mark all as seen' }).click();
await page.getByText('Nothing new').waitFor({ timeout: 10000 });
check((await rows.getByText('New', { exact: true }).count()) === 0, '"Mark all as seen" clears every New tag');
await page.waitForTimeout(300);
check((await badge.count()) === 0, 'and the menu count');
check((await api('/api/agency/watch')).new.reports === 0, 'the server keeps it');
const shopperSees = await (await shopper.context.request.get(base + '/api/agency/me')).json();
check(shopperSees.member === false, 'the shopper is still not an agency account');

// ---- 5. Dark theme and phone width -------------------------------------------------------------------------------------
{
	const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
	await dark.addCookies(await context.cookies());
	const darkPage = await dark.newPage();
	await darkPage.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await darkPage.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
	await darkPage.waitForTimeout(1500);
	await axeCheck(darkPage, 'watch list (dark)');
	await darkPage.locator('#date-filter').click();
	await darkPage.locator('[data-slot="popover-content"]').waitFor({ timeout: 5000 });
	await darkPage.waitForTimeout(300);
	await axeCheck(darkPage, 'date range calendar (dark)');
	await darkPage.keyboard.press('Escape');
	await darkPage.waitForTimeout(300);
	await darkPage.getByRole('tab', { name: 'Overview' }).click();
	await darkPage.waitForTimeout(400);
	await axeCheck(darkPage, 'overview (dark)');
	await darkPage.screenshot({ path: 'tests/e2e/shots/agency_overview_dark.png', fullPage: true });
	await darkPage.getByRole('tab', { name: 'Sellers' }).click();
	await darkPage.waitForTimeout(400);
	await axeCheck(darkPage, 'sellers (dark)');
	await darkPage.goto(base + `/app/agency/evidence?link=${encodeURIComponent(first.link)}`, { waitUntil: 'networkidle' });
	await darkPage.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
	await darkPage.waitForTimeout(1500);
	await axeCheck(darkPage, 'evidence sheet (dark)');
	await darkPage.goto(base + '/app/agency/report?kind=Charger', { waitUntil: 'networkidle' });
	await darkPage.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
	await darkPage.waitForTimeout(800);
	await axeCheck(darkPage, 'printable report (dark)');
	await darkPage.goto(base + `/app/agency/evidence?link=${encodeURIComponent(first.link)}`, { waitUntil: 'networkidle' });
	await darkPage.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
	const themes = await darkPage.evaluate(() => {
		const root = document.documentElement;
		const before = root.classList.contains('dark');
		dispatchEvent(new Event('beforeprint'));
		const printing = root.classList.contains('dark');
		dispatchEvent(new Event('afterprint'));
		return [before, printing, root.classList.contains('dark')];
	});
	check(themes[0] && !themes[1] && themes[2], 'print: a dark theme turns light while printing and comes back after');
	await dark.close();
}
{
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await phone.addCookies(await context.cookies());
	const phonePage = await phone.newPage();
	await phonePage.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await phonePage.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
	await phonePage.waitForTimeout(800);
	check(await noSideways(phonePage), 'phone: the watch list does not scroll sideways');
	await phonePage.getByRole('button', { name: /^Filters/ }).click();
	await phonePage.getByRole('dialog').getByText('Filter the watch list').waitFor({ timeout: 5000 });
	await phonePage.waitForTimeout(400);
	await axeCheck(phonePage, 'phone filters sheet');
	await phonePage.locator('#date-filter-sheet').click();
	const phoneCalendar = phonePage.locator('[data-slot="popover-content"]');
	await phoneCalendar.waitFor({ timeout: 5000 });
	await phonePage.waitForTimeout(300);
	check((await phoneCalendar.locator('table').count()) === 1 && (await noSideways(phonePage)), 'phone: the calendar shows one month and fits the screen');
	await phonePage.screenshot({ path: 'tests/e2e/shots/agency_phone_calendar.png' });
	await phonePage.keyboard.press('Escape');
	await phonePage.waitForTimeout(300);
	await phonePage.locator('#kind-filter-sheet').click();
	await phonePage.getByRole('option', { name: 'Charger', exact: true }).click();
	await phonePage.waitForTimeout(300);
	const sheetButton = phonePage.getByRole('button', { name: /^Show \d+ listing/ });
	check((await sheetButton.innerText()).includes(String(reports.rows.filter((row) => row.kind === 'Charger').length)), 'phone: the filters sheet counts what it will show');
	await sheetButton.click();
	await phonePage.waitForTimeout(400);
	check(await noSideways(phonePage), 'phone: the filtered watch list does not scroll sideways');
	await phonePage.screenshot({ path: 'tests/e2e/shots/agency_phone_filtered.png', fullPage: true });
	await phonePage.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await phonePage.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
	await phonePage.getByRole('tab', { name: 'Overview' }).click();
	await phonePage.waitForTimeout(400);
	check(await noSideways(phonePage), 'phone: the charts fit and the table scrolls inside its box, not the page');
	await phonePage.screenshot({ path: 'tests/e2e/shots/agency_phone_overview.png', fullPage: true });
	await phonePage.goto(base + `/app/agency/evidence?link=${encodeURIComponent(first.link)}`, { waitUntil: 'networkidle' });
	await phonePage.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
	await phonePage.waitForTimeout(800);
	check(await noSideways(phonePage), 'phone: the evidence sheet does not scroll sideways');
	await phonePage.screenshot({ path: 'tests/e2e/shots/agency_phone_sheet.png', fullPage: true });
	await phone.close();
}

// ---- 6. Sign out, then a shopper signs in on the same page: the agency item goes away -----------------------------------
await page.getByRole('button', { name: /Agency Officer/ }).click();
await page.getByRole('menuitem', { name: 'Sign out' }).click();
await page.waitForURL(base + '/');
await page.getByRole('button', { name: 'Sign in' }).first().click();
await page.getByRole('dialog').getByLabel('Email').fill(shopperWho.email);
await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(PASSWORD);
await page.getByRole('dialog').getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/app\/home/, { timeout: 15000 });
await sidebarReady(page);
await page.waitForTimeout(1000);
check((await agencyLink(page).count()) === 0, 'after the agency account signs out, the next account sees no agency item');

// ---- 7. "Get started": a new agency account sees its guide once, by itself, and can open it again ---------------------
const STEPS = ['Welcome to the DTI view', 'Set your own password', 'The watch list', 'Evidence sheets', 'Overview and Sellers'];
const guideOf = (p) => p.locator('[data-agency-guide]');
async function walkGuide(p, scheme) {
	const guide = guideOf(p);
	for (let index = 0; index < STEPS.length; index += 1) {
		await guide.getByText(`Step ${index + 1} of ${STEPS.length}`).waitFor({ timeout: 5000 });
		await p.waitForTimeout(350);
		const title = (await guide.getByRole('heading').first().innerText()).trim();
		check(title.startsWith(STEPS[index]), `guide (${scheme}): step ${index + 1} is "${title}"`);
		await axeCheck(p, `guide step ${index + 1} (${scheme})`);
		if (index < STEPS.length - 1) await guide.getByRole('button', { name: 'Next' }).click();
	}
}
{
	const fresh = await open();
	const officer = await signUp(fresh.context, base, 'Guide Officer');
	grant(officer.email);
	const p = fresh.page;
	await p.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await guideOf(p).waitFor({ timeout: 20000 });
	check((await guideOf(p).getByRole('heading').first().innerText()).trim() === 'Welcome to the DTI view, Guide', 'guide: opens by itself the first time, with the first name');
	await p.screenshot({ path: 'tests/e2e/shots/agency_guide_welcome.png' });
	await walkGuide(p, 'light');
	check(await guideOf(p).getByRole('button', { name: 'Open the watch list' }).isVisible(), 'guide: the last step opens the watch list');
	await guideOf(p).getByRole('button', { name: 'Back' }).click();
	check(await guideOf(p).getByText('Step 4 of 5').isVisible(), 'guide: Back goes to the step before');
	await p.keyboard.press('Escape');
	await guideOf(p).waitFor({ state: 'detached', timeout: 5000 });
	const me = await (await fresh.context.request.get(base + '/api/agency/me')).json();
	check(me.guide_seen === true, 'guide: closing it once is remembered on the server');
	await p.reload({ waitUntil: 'networkidle' });
	await sidebarReady(p);
	await p.waitForTimeout(2000);
	check((await guideOf(p).count()) === 0, 'guide: it does not open by itself again');

	// Opening it again: the DTI view, Ctrl+K and Settings.
	await p.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await p.getByText('How to read this list', { exact: true }).waitFor({ timeout: 15000 });
	await p.getByRole('button', { name: 'Get started' }).click();
	await guideOf(p).getByText('Step 1 of 5').waitFor({ timeout: 5000 });
	check(true, 'guide: "Get started" on the DTI view opens it at the first step');
	await guideOf(p).getByRole('button', { name: 'Next' }).click();
	await guideOf(p).getByRole('button', { name: 'Change my password' }).click();
	await p.waitForURL(/\/app\/settings\?edit=1/);
	await p.getByRole('dialog').getByText('Edit account').waitFor({ timeout: 10000 });
	check(await p.getByRole('dialog').getByLabel(/New password/).isVisible(), 'guide: "Change my password" opens Settings with the Edit account pop-up');
	await p.keyboard.press('Escape');
	await p.waitForTimeout(400);
	check(await p.getByRole('button', { name: 'Show the DTI guide' }).isVisible(), 'Settings: has "Show the DTI guide"');
	await p.keyboard.press('Control+k');
	check(await p.getByRole('dialog').getByRole('option', { name: /Show the DTI guide/ }).isVisible(), 'Ctrl+K: lists "Show the DTI guide"');
	await p.getByRole('dialog').getByRole('option', { name: /Show the DTI guide/ }).click();
	await guideOf(p).getByText('Step 1 of 5').waitFor({ timeout: 5000 });
	check(true, 'Ctrl+K: opens the guide');
	await p.keyboard.press('Escape');
	check(fresh.errors.length === 0, `guide: no page errors${fresh.errors.length ? ': ' + fresh.errors.join(' | ') : ''}`);

	// Dark theme and a phone, on the same account.
	const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
	await dark.addCookies(await fresh.context.cookies());
	const darkPage = await dark.newPage();
	await darkPage.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await darkPage.getByRole('button', { name: 'Get started' }).click();
	await walkGuide(darkPage, 'dark');
	await dark.close();
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await phone.addCookies(await fresh.context.cookies());
	const phonePage = await phone.newPage();
	await phonePage.goto(base + '/app/agency', { waitUntil: 'networkidle' });
	await phonePage.getByRole('button', { name: 'Get started' }).click();
	await guideOf(phonePage).getByText('Step 1 of 5').waitFor({ timeout: 5000 });
	for (let index = 0; index < STEPS.length; index += 1) {
		await phonePage.waitForTimeout(350);
		check(await noSideways(phonePage), `phone: guide step ${index + 1} does not scroll sideways`);
		if (index === 2) await phonePage.screenshot({ path: 'tests/e2e/shots/agency_guide_phone_watch.png' });
		if (index < STEPS.length - 1) await guideOf(phonePage).getByRole('button', { name: 'Next' }).click();
	}
	await phone.close();
	await fresh.context.close();
}

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll agency checks passed.');
process.exit(failures ? 1 : 0);
