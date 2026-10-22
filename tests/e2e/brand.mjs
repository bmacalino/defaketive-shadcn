// The brand colour: it is on the logo, the main buttons and the links, in light and in dark,
// and it is never on anything that counts reviews or shows a result. Read-only, as a guest.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync('tests/e2e/shots', { recursive: true });
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};

const pool = await (await fetch(`${base}/api/saved/products`)).json();
// A product with a result and something reported, so its report has bars and quotes to look at.
const counted = (p) => Object.values(p.badge_view?.counts ?? {}).reduce((sum, n) => sum + Number(n || 0), 0);
const product = [...pool.products].filter((p) => p.badge_view?.available).sort((a, b) => counted(b) - counted(a))[0];
console.log(`(testing with "${String(product.name).slice(0, 40)}…")`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
// What the page really paints, read through a probe so the colour format never matters.
const paint = (page) =>
	page.evaluate(() => {
		const resolve = (value, property = 'backgroundColor') => {
			const probe = document.createElement('span');
			probe.style[property] = value;
			document.body.append(probe);
			const painted = getComputedStyle(probe)[property];
			probe.remove();
			return painted;
		};
		const css = (el, property) => (el ? getComputedStyle(el)[property] : '');
		const button = [...document.querySelectorAll('[data-slot="button"]')].find((el) => /Create account|Create free account/.test(el.textContent));
		// Every bar on a report counts reviews: the kinds of problem, and the warning words on the Reviews tab.
		const bars = [...document.querySelectorAll('[data-slot="progress-indicator"]')];
		const links = [...document.querySelectorAll('#report-findings [data-slot="button"]')].filter((el) => /^Read all/.test(el.textContent.trim()));
		return {
			brand: resolve('var(--brand)'),
			onBrand: resolve('var(--brand-foreground)', 'color'),
			ink: resolve('var(--foreground)'),
			// The mark is an SVG drawn in the text colour of its own element (fill="currentColor").
			mark: css(document.querySelector('a[aria-label="DeFaketive home"] > svg'), 'color'),
			button: css(button, 'backgroundColor'),
			buttonText: css(button, 'color'),
			bars: bars.map((el) => getComputedStyle(el).backgroundColor),
			links: links.map((el) => getComputedStyle(el).color),
			verdictBorder: css(document.querySelector('[aria-label="Result"]'), 'borderTopColor')
		};
	});
async function axe(page, label) {
	await page.waitForTimeout(1200);
	await page.evaluate(axeSource);
	const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
	check(result.violations.length === 0, `accessibility: ${label}${result.violations.length ? ' -> ' + result.violations.map((v) => v.id + ' ' + v.nodes[0].target.join(' ')).join('; ') : ''}`);
}

const seen = {};
for (const scheme of ['light', 'dark']) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));

	// ---- The landing page ----
	await page.goto(base + '/', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1200);
	const home = await paint(page);
	seen[scheme] = home.brand;
	check(home.brand !== home.ink, `${scheme}: the brand colour is a colour of its own, not the text colour (${home.brand})`);
	check(home.mark === home.brand, `${scheme}: the logo mark is the brand colour`);
	check(home.button === home.brand && home.buttonText === home.onBrand, `${scheme}: the main button is the brand colour, with its own text colour on it`);
	await axe(page, `landing page, ${scheme}, with the brand colour`);
	await page.screenshot({ path: `tests/e2e/shots/brand_landing_${scheme}.png` });

	// ---- A report: the brand colour never counts reviews or shows a result ----
	await page.goto(`${base}/scan/report?link=${encodeURIComponent(product.link)}`, { waitUntil: 'networkidle' });
	await page.getByRole('group', { name: 'Result' }).waitFor({ timeout: 20000 });
	await page.waitForTimeout(1500);
	const report = await paint(page);
	check(report.bars.length > 0 && report.bars.every((colour) => colour !== report.brand), `${scheme}: the bars that count reviews are not the brand colour (${report.bars.length} bars)`);
	check(report.verdictBorder !== report.brand, `${scheme}: the result box is not the brand colour`);
	check(report.links.every((colour) => colour === report.brand), `${scheme}: "Read all" links are the brand colour (${report.links.length} on this report)`);
	await axe(page, `report, ${scheme}, with the brand colour`);
	await page.screenshot({ path: `tests/e2e/shots/brand_report_${scheme}.png` });

	// ---- The list of reviews: the warning-word bars are counts too ----
	await page.getByRole('tab', { name: /Reviews/ }).click();
	await page.waitForTimeout(900);
	const reviews = await paint(page);
	check(reviews.bars.every((colour) => colour !== reviews.brand), `${scheme}: the warning-word bars are not the brand colour (${reviews.bars.length} bars on the page)`);

	if (scheme === 'light') {
		const icon = await page.evaluate(() => fetch(document.querySelector('link[rel="icon"]').href).then((r) => r.text()));
		check(/#7224c0/i.test(icon), 'the browser-tab icon is the mark on the brand purple');
	}
	check(errors.length === 0, `${scheme}: no browser errors${errors.length ? ': ' + errors[0] : ''}`);
	await context.close();
}
check(seen.light !== seen.dark, `dark mode has its own, lighter purple (${seen.light} / ${seen.dark})`);

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
