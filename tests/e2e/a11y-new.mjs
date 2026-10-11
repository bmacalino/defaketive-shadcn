// axe on the newer pieces: search pop-up, product preview card, phone sheets, carousel row, photo viewer, landing sample.
import { chromium } from 'playwright-core';
import { signUp } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const LINK = 'https://www.lazada.com.ph/products/pdp-i5246060610-s31099995054.html';
const LABELS = [{ category: 'safety', label: 'Safety problem', helper: 'x', informs_only: false }];
const mk = (i, state, tone, headline, counts) => ({
	name: `Test listing ${i} power bank`, link: `https://shopee.ph/test-${i}`, price: '₱499.00', rating: 4.2, platform: 'shopee', reviews_collected: 40,
	analysis_date: new Date(Date.now() - i * 86400000).toISOString(),
	badge_view: { available: true, state, tone, headline, detail: 'Detail.', reviews_analyzed: 40, counts, labels: LABELS,
		badges: counts.safety ? [{ category: 'safety', label: 'Safety problem', helper: 'x', informs_only: false, mentions: 2, reviews_analyzed: 40, phrase: 'x', summary: 'x', more_evidence: 0, evidence: [{ text: 'It overheated and smoked.', rating: 1, hazard: 'overheating', highlights: [[3, 13]] }] }] : [] }
});
const fake = [mk(0, 'safety_warning', 'high', 'Reviewers report safety problems', { safety: 2 }), mk(1, 'no_warning_signs', 'low', 'No warning signs found', {}), mk(2, 'no_warning_signs', 'low', 'No warning signs found', {}), mk(3, 'insufficient_evidence', 'unknown', 'Not enough reviews to judge', {}), mk(4, 'no_warning_signs', 'low', 'No warning signs found', {}), mk(5, 'no_warning_signs', 'low', 'No warning signs found', {})];

// A pretend visitor who already opened the pretend products, so they show as their own history.
const SEED = (items) => { try { if (!localStorage.getItem('defaketive-activity')) localStorage.setItem('defaketive-activity', JSON.stringify(Object.fromEntries(items.map((p, i) => [p.link, { product: p, openedAt: Date.now() - i * 129600000 }])))); } catch {} };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let WARNCOUNT = 0; const WARNS = new Map();
const __warn = (m) => { if (m.type() === 'warning' && /svelte/i.test(m.text())) { WARNCOUNT++; const t = m.text().split(String.fromCharCode(10))[0].slice(0, 80); WARNS.set(t, (WARNS.get(t) || 0) + 1); } };
let total = 0;
async function scan(page, label) {
	await page.waitForTimeout(1600);
	await page.evaluate(axeSource);
	const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
	total += result.violations.length;
	console.log(`${label.padEnd(46)} ${result.violations.length ? result.violations.length + ' problem(s)' : 'ok'}`);
	for (const v of result.violations) {
		console.log(`    - [${v.impact}] ${v.id}: ${v.help}`);
		for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}  ${(n.failureSummary || '').split('\n').slice(1, 2).join(' ').trim()}`);
	}
}
for (const scheme of ['light', 'dark']) {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
	await signUp(ctx, base);
ctx.on('console', __warn);
	await ctx.addInitScript(SEED, fake);
	const page = await ctx.newPage();
	await page.route('**/api/products', (r) => r.fulfill({ json: { products: fake, count: fake.length } }));
	await page.route('**/api/saved/products', (r) => r.fulfill({ json: { products: fake, count: fake.length } }));
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	await scan(page, `${scheme}: Home with a carousel row`);
	await page.getByRole('link', { name: /Test listing 0/ }).first().hover();
	await page.waitForTimeout(1000);
	await scan(page, `${scheme}: product preview card open`);
	await page.mouse.move(5, 5);
	await page.keyboard.press('Control+k');
	await page.getByRole('dialog').waitFor();
	await scan(page, `${scheme}: search pop-up`);
	await page.keyboard.type('test');
	await scan(page, `${scheme}: search pop-up with results`);
	await page.keyboard.press('Escape');
	await page.goto(base + '/', { waitUntil: 'networkidle' });
	await scan(page, `${scheme}: landing`);
	await page.goto(`${base}/app/report?link=${encodeURIComponent(LINK)}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /View a larger photo/ }).click();
	await scan(page, `${scheme}: photo viewer`);
	await ctx.close();

	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
	await signUp(phone, base);
phone.on('console', __warn);
	await phone.addInitScript(SEED, fake);
	const pp = await phone.newPage();
	await pp.route('**/api/products', (r) => r.fulfill({ json: { products: fake, count: fake.length } }));
	await pp.route('**/api/saved/products', (r) => r.fulfill({ json: { products: fake, count: fake.length } }));
	await pp.goto(base + '/app/products', { waitUntil: 'networkidle' });
	await pp.getByRole('button', { name: /^Filters/ }).click();
	await scan(pp, `${scheme}: phone filter sheet`);
	await phone.close();
}
await browser.close();
console.log(total ? `\n${total} kind(s) of problem found` : '\nNo accessibility problems found by axe.');
console.log('svelte warnings:', WARNCOUNT, [...WARNS.entries()]);
