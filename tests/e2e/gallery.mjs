// Show every verdict state in the new app using a made-up catalog that exists only in the browser
// (the real server is never changed). Also checks every page for sideways scrolling on a phone.
import { chromium } from 'playwright-core';
import { signUp } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
const out = 'tests/e2e/shots';
fs.mkdirSync(out, { recursive: true });

const LABELS = [
	{ category: 'safety', label: 'Safety problem', helper: 'Overheating, smoke, sparks or shocks', informs_only: false },
	{ category: 'defect', label: 'Faulty or broken', helper: "Doesn't work, stops working, drains fast or charges slowly", informs_only: false },
	{ category: 'quality', label: 'Poor quality', helper: 'Works, but weak, flimsy or scratched', informs_only: true },
	{ category: 'counterfeit', label: 'Possible fake', helper: 'Reviewers say it is a copy, not the original brand', informs_only: false },
	{ category: 'not_as_described', label: 'Not as advertised', helper: 'Size, capacity, features or looks differ from the listing', informs_only: true }
];
const ACCURACY = { sentences_checked: 569, reports_confirmed: 16, reports_caught: 10, flags_raised: 24, flags_confirmed: 10 };

const states = [
	['safety_warning', 'high', 'Reviewers report safety problems', { safety: 4, defect: 2, counterfeit: 1 }, 'Of 40 reviews, 4 mention fire, explosion or a swollen battery; 2 say it is faulty or stopped working. Read them below and judge for yourself.'],
	['possible_safety_issue', 'moderate', 'Some reviewers mention safety concerns', { safety: 1, defect: 0, counterfeit: 0 }, 'Of 40 reviews, 1 mentions overheating or burns. Read it below and judge for yourself.'],
	['possible_counterfeit_or_defect', 'moderate', 'Reviewers report fakes or defects', { safety: 0, defect: 6, counterfeit: 3 }, 'Of 40 reviews, 6 say it is faulty; 3 say it may not be genuine. Read them below and judge for yourself.'],
	['reviews_may_be_unreliable', 'unknown', 'These reviews may not be trustworthy', { safety: 0, defect: 0, counterfeit: 0 }, 'Many reviews look duplicated or generic.'],
	['no_warning_signs', 'low', 'No warning signs found', { safety: 0, defect: 0, counterfeit: 0 }, 'Enough reviews, none flagged.'],
	['insufficient_evidence', 'unknown', 'Not enough reviews to judge', { safety: 1, defect: 0, counterfeit: 0 }, 'Too few reviews for an overall verdict. Even so, 1 review mentions smoke. Read it below.']
];

const products = states.map(([state, tone, headline, counts, detail], i) => ({
	name: `Test listing ${i + 1} (${state.replace(/_/g, ' ')}) Power Bank 20000mAh Fast Charging`,
	link: `https://shopee.ph/test-listing-${i + 1}`,
	price: `PHP ${(299 + i * 150).toFixed(2)}`,
	rating: 4.7 - i * 0.4,
	platform: ['shopee', 'lazada', 'temu'][i % 3],
	img: '', analysis_date: new Date(Date.now() - i * 129600000).toISOString(),
	reviews_collected: 40,
	badge_view: { available: true, state, tone, headline, detail, reviews_analyzed: 40, counts, badges: [], labels: LABELS, safety_check_accuracy: ACCURACY }
}));
products.push({
	name: 'Test listing 7 (not analyzed) old catalog entry',
	link: 'https://shopee.ph/test-listing-7',
	price: '₱99.00',
	platform: 'Shopee PH',
	reviews_collected: 0
});

const fakeDetail = (p) => ({
	product: {
		...p,
		category: 'Power banks',
		analysis_date: '2026-10-08T10:00:00Z',
		sentiment_summary: { sentiment_counts: { positive: 20, uncertain: 8, negative: 12 }, duplicate_review_count: 3, coverage: { reviews_listed: 400 } },
		badge_view: {
			...p.badge_view,
			badges: [
				{ category: 'safety', label: 'Safety problem', helper: LABELS[0].helper, informs_only: false, mentions: 4, reviews_analyzed: 40, phrase: 'mention fire, explosion or a swollen battery', summary: '4 reviews mention fire, explosion or a swollen battery', more_evidence: 1,
					evidence: [{ text: 'Nag-overheat at umusok after 2 weeks, the battery got swollen.', rating: 1, hazard: 'fire, explosion or a swollen battery', highlights: [[4, 13], [17, 23], [57, 64]] }] },
				{ category: 'defect', label: 'Faulty or broken', helper: LABELS[1].helper, informs_only: false, mentions: 2, reviews_analyzed: 40, phrase: 'say it is faulty or stopped working', summary: '2 reviews say it is faulty or stopped working', more_evidence: 0,
					evidence: [{ text: 'Sira agad, hindi na nag-charge.', rating: 2, hazard: null, highlights: [[0, 4]] }] },
				{ category: 'quality', label: 'Poor quality', helper: LABELS[2].helper, informs_only: true, mentions: 0, reviews_analyzed: 40, phrase: '', summary: 'No reviews call it weak, flimsy or scratched', evidence: [], more_evidence: 0 },
				{ category: 'counterfeit', label: 'Possible fake', helper: LABELS[3].helper, informs_only: false, mentions: 1, reviews_analyzed: 40, phrase: 'says it may not be genuine', summary: '1 review says it may not be genuine', more_evidence: 0,
					evidence: [{ text: 'Peke ito, hindi original.', rating: 1, hazard: null, highlights: [[0, 4]] }] },
				{ category: 'not_as_described', label: 'Not as advertised', helper: LABELS[4].helper, informs_only: true, mentions: 0, reviews_analyzed: 40, phrase: '', summary: 'No reviews say it differs from the listing', evidence: [], more_evidence: 0 }
			]
		},
		comments: [
			{ author: 'a***b', rating: 1, time: '2026-09-30', content: 'Nag-overheat at umusok after 2 weeks, the battery got swollen.',
				sentiment_analysis: { label: 'negative', review_tags: ['safety'], sentences: [{ text_raw: 'Nag-overheat at umusok after 2 weeks, the battery got swollen.', tags: ['safety'], terms: [{ span: [0, 13], ngram: 'nag-overheat', category: 'safety' }, { span: [17, 23], ngram: 'umusok', category: 'safety' }] }] } },
			{ author: 'c***d', rating: 2, time: '2026-09-28', content: 'Sira agad, hindi na nag-charge.',
				sentiment_analysis: { label: 'negative', review_tags: ['defect'], sentences: [{ text_raw: 'Sira agad, hindi na nag-charge.', tags: ['defect'], terms: [{ span: [0, 4], ngram: 'sira', category: 'defect' }] }] } },
			{ author: 'e***f', rating: 5, time: '2026-09-20', content: 'Maganda, mabilis mag-charge. Recommended!', sentiment_analysis: { label: 'positive', review_tags: [], sentences: [] } },
			{ author: 'g***h', rating: 3, time: '2026-09-18', content: 'Okay lang.', sentiment_analysis: { label: 'neutral', review_tags: [], sentences: [] } }
		]
	},
	recommendations: [products[4]]
});

// A pretend visitor who already opened the pretend products, so they show as their own history.
const SEED = (items) => { try { if (!localStorage.getItem('defaketive-activity')) localStorage.setItem('defaketive-activity', JSON.stringify(Object.fromEntries(items.map((p, i) => [p.link, { product: p, openedAt: Date.now() - i * 129600000 }])))); } catch {} };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let WARNCOUNT = 0; const WARNS = new Map();
const __warn = (m) => { if (m.type() === 'warning' && /svelte/i.test(m.text())) { WARNCOUNT++; const t = m.text().split(String.fromCharCode(10))[0].slice(0, 80); WARNS.set(t, (WARNS.get(t) || 0) + 1); } };
const run = async (name, width, height, scheme, fn) => {
	const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
	await signUp(context, base);
context.on('console', __warn);
	await context.addInitScript(SEED, products);
	const page = await context.newPage();
	const problems = [];
	page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
	page.on('console', (m) => m.type() === 'error' && problems.push(`[console.error] ${m.text()}`));
	page.on('response', (r) => r.status() >= 400 && !r.url().includes('/api/auth') && problems.push(`[${r.status()}] ${r.url()}`));
	await page.route('**/api/products', (route) => route.fulfill({ json: { products, count: products.length } }));
	await page.route('**/api/saved/products', (route) => route.fulfill({ json: { products, count: products.length } }));
	await page.route('**/api/picks', (route) => route.fulfill({ json: { products: [products[4]] } }));
	await page.route('**/api/wishlist/popular', (route) => route.fulfill({ json: { products: [{ product: products[4], saves: 3 }, { product: products[0], saves: 1 }] } }));
	await page.route('**/api/products/detail**', (route) => {
		const link = new URL(route.request().url()).searchParams.get('link');
		const p = products.find((x) => x.link === link);
		return p ? route.fulfill({ json: fakeDetail(p) }) : route.fulfill({ status: 404, json: { error: 'Product not found in the current catalog.' } });
	});
	await fn(page);
	console.log(`${name}: ${problems.length ? '\n  ' + [...new Set(problems)].join('\n  ') : 'no browser errors'}`);
	await context.close();
};

const overflow = async (page, label) => {
	const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	if (wide > 1) console.log(`  !! ${label}: page scrolls sideways by ${wide}px`);
};

await run('desktop gallery', 1280, 900, 'light', async (page) => {
	for (const route of ['/app/home', '/app/products', '/app/history', '/app/wishlist']) {
		await page.goto(base + route, { waitUntil: 'networkidle' });
		await page.waitForTimeout(800);
		await page.screenshot({ path: `${out}/gallery${route.replace(/\//g, '_')}.png`, fullPage: true });
	}
	await page.goto(`${base}/app/report?link=${encodeURIComponent(products[0].link)}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(800);
	await page.screenshot({ path: `${out}/gallery_report_safety.png`, fullPage: true });
	// Open the "read all" evidence for safety.
	await page.getByRole('button', { name: /Read all 4/ }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: `${out}/gallery_report_evidence.png` });
});

for (const [i, p] of products.entries()) {
	if (![1, 2, 3, 5, 6].includes(i)) continue;
	await run(`report ${p.badge_view?.state ?? 'not_analyzed'}`, 1280, 900, 'light', async (page) => {
		await page.goto(`${base}/app/report?link=${encodeURIComponent(p.link)}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(600);
		await page.screenshot({ path: `${out}/report_${i + 1}.png`, clip: { x: 0, y: 0, width: 1280, height: 900 } });
	});
}

await run('phone sideways-scroll check', 390, 844, 'light', async (page) => {
	for (const route of ['/', '/app/home', '/app/analyze', '/app/products', '/app/history', '/app/wishlist', '/app/settings', '/app/about', '/app/faq', `/app/report?link=${encodeURIComponent(products[0].link)}`]) {
		await page.goto(base + route, { waitUntil: 'networkidle' });
		await page.waitForTimeout(600);
		await overflow(page, route.slice(0, 40));
	}
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await page.screenshot({ path: `${out}/phone_home_gallery.png`, fullPage: true });
});

await run('dark mode', 1280, 900, 'dark', async (page) => {
	await page.goto(`${base}/app/report?link=${encodeURIComponent(products[0].link)}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${out}/dark_report_safety.png`, clip: { x: 0, y: 0, width: 1280, height: 1100 } });
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${out}/dark_home_gallery.png`, fullPage: true });
});

await browser.close();
console.log('svelte warnings:', WARNCOUNT, [...WARNS.entries()]);
