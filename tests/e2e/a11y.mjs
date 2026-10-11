// Run the axe accessibility checker (WCAG 2.1 A/AA rules, including colour contrast) on the main pages,
// in light and dark, with the made-up catalog so every verdict colour is on screen.
import { chromium } from 'playwright-core';
import { signUp } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

const LABELS = [
	{ category: 'safety', label: 'Safety problem', helper: 'Overheating, smoke, sparks or shocks', informs_only: false },
	{ category: 'defect', label: 'Faulty or broken', helper: 'x', informs_only: false },
	{ category: 'quality', label: 'Poor quality', helper: 'x', informs_only: true },
	{ category: 'counterfeit', label: 'Possible fake', helper: 'x', informs_only: false },
	{ category: 'not_as_described', label: 'Not as advertised', helper: 'x', informs_only: true }
];
const mk = (i, state, tone, headline, counts) => ({
	name: `Test listing ${i} ${state.replace(/_/g, ' ')} power bank`,
	link: `https://shopee.ph/test-${i}`, price: '₱499.00', rating: 4.1, platform: ['shopee', 'lazada', 'temu'][i % 3], reviews_collected: 40,
	badge_view: { available: true, state, tone, headline, detail: `Detail for ${headline}.`, reviews_analyzed: 40, counts, badges: [], labels: LABELS }
});
const products = [
	mk(0, 'safety_warning', 'high', 'Reviewers report safety problems', { safety: 4, defect: 2, counterfeit: 1 }),
	mk(1, 'possible_counterfeit_or_defect', 'moderate', 'Reviewers report fakes or defects', { safety: 0, defect: 6, counterfeit: 3 }),
	mk(2, 'no_warning_signs', 'low', 'No warning signs found', { safety: 0, defect: 0, counterfeit: 0 }),
	mk(3, 'insufficient_evidence', 'unknown', 'Not enough reviews to judge', { safety: 0, defect: 0, counterfeit: 0 })
];
const detailFor = (p) => ({
	product: {
		...p, category: 'Power banks', analysis_date: '2026-10-08T10:00:00Z',
		sentiment_summary: { sentiment_counts: { positive: 20, uncertain: 8, negative: 12 }, duplicate_review_count: 3, coverage: { reviews_listed: 400 } },
		badge_view: { ...p.badge_view, badges: [
			{ category: 'safety', label: 'Safety problem', helper: 'x', informs_only: false, mentions: 4, reviews_analyzed: 40, phrase: 'x', summary: '4 reviews mention fire', more_evidence: 0, evidence: [{ text: 'Overheated and smoked.', rating: 1, hazard: 'overheating or burns', highlights: [[0, 10]] }] },
			{ category: 'quality', label: 'Poor quality', helper: 'x', informs_only: true, mentions: 0, reviews_analyzed: 40, phrase: '', summary: 'No reviews call it weak', evidence: [], more_evidence: 0 }
		] },
		comments: [{ author: 'a', rating: 1, time: '2026-09-30', content: 'Overheated and smoked.', sentiment_analysis: { label: 'negative', review_tags: ['safety'], sentences: [{ text_raw: 'Overheated and smoked.', tags: ['safety'], terms: [{ span: [0, 10], ngram: 'overheated', category: 'safety' }] }] } }]
	},
	recommendations: [products[2]]
});

// A pretend visitor who already opened the pretend products, so they show as their own history.
const SEED = (items) => { try { if (!localStorage.getItem('defaketive-activity')) localStorage.setItem('defaketive-activity', JSON.stringify(Object.fromEntries(items.map((p, i) => [p.link, { product: p, openedAt: Date.now() - i * 129600000 }])))); } catch {} };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let WARNCOUNT = 0; const WARNS = new Map();
const __warn = (m) => { if (m.type() === 'warning' && /svelte/i.test(m.text())) { WARNCOUNT++; const t = m.text().split(String.fromCharCode(10))[0].slice(0, 80); WARNS.set(t, (WARNS.get(t) || 0) + 1); } };
let total = 0;
for (const scheme of ['light', 'dark']) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
	await signUp(context, base);
context.on('console', __warn);
	await context.addInitScript(SEED, products);
	const page = await context.newPage();
	await page.route('**/api/products', (r) => r.fulfill({ json: { products, count: products.length } }));
	await page.route('**/api/saved/products', (r) => r.fulfill({ json: { products, count: products.length } }));
	await page.route('**/api/picks', (r) => r.fulfill({ json: { products: [products[2]] } }));
	await page.route('**/api/wishlist/popular', (r) => r.fulfill({ json: { products: [{ product: products[2], saves: 3 }] } }));
	await page.route('**/api/products/detail**', (r) => r.fulfill({ json: detailFor(products[0]) }));
	for (const route of ['/', '/app/home', '/app/analyze', '/app/products', '/app/history', '/app/wishlist', '/app/settings', '/app/about', '/app/faq', `/app/report?link=${encodeURIComponent(products[0].link)}`]) {
		await page.goto(base + route, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1800);
		await page.evaluate(axeSource);
		const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
		const bad = result.violations;
		total += bad.length;
		console.log(`${scheme.padEnd(5)} ${route.slice(0, 28).padEnd(28)} ${bad.length ? bad.length + ' problem(s)' : 'ok'}`);
		for (const v of bad) {
			console.log(`    - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} place${v.nodes.length === 1 ? '' : 's'})`);
			for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}  ${(n.failureSummary || '').split('\n').slice(1, 2).join(' ').trim()}`);
		}
	}
	await context.close();
}
await browser.close();
console.log(total ? `\n${total} kind(s) of problem found` : '\nNo accessibility problems found by axe.');
console.log('svelte warnings:', WARNCOUNT, [...WARNS.entries()]);
