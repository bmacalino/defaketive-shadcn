// The public header and footer: every link stays on the public site, none drops a guest into the main app.
import { chromium } from 'playwright-core';
import { signUp } from './_signin.mjs';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync('tests/e2e/shots', { recursive: true });
let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failures += 1;
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const inApp = () => page.locator('[data-slot="sidebar"]').count();
const nav = () => page.getByRole('navigation', { name: 'Main navigation' });
const SECTIONS = [
	['How it works', 'how', 'How it works'],
	['FAQ', 'faq', 'Common questions'],
	['About', 'about', 'The minds behind a safer shopping experience']
];
// The section heading is on screen and not hidden under the sticky header (56px tall).
async function landed(heading) {
	await page.waitForTimeout(900);
	const box = await page.getByRole('heading', { name: heading }).boundingBox();
	return Boolean(box) && box.y >= 56 && box.y < 500;
}

// ---- Header, from the landing page ----
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const labels = (await nav().getByRole('link').allInnerTexts()).map((t) => t.trim());
check(labels.join(' | ') === 'How it works | FAQ | About', `header links are: ${labels.join(' | ')}`);
check((await nav().getByRole('link', { name: 'Products' }).count()) === 0, 'no Products link in the header');
for (const [label, id, heading] of SECTIONS) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await nav().getByRole('link', { name: label, exact: true }).click();
	const ok = (await landed(heading)) && new URL(page.url()).hash === `#${id}` && new URL(page.url()).pathname === '/';
	check(ok, `landing: "${label}" jumps to its section`);
}
await page.screenshot({ path: 'tests/e2e/shots/links_landing.png' });

// ---- Header, from the guest screen ----
for (const [label, id, heading] of SECTIONS) {
	await page.goto(base + '/scan', { waitUntil: 'networkidle' });
	await page.waitForTimeout(700);
	await nav().getByRole('link', { name: label, exact: true }).click();
	await page.waitForURL((url) => url.pathname === '/' && url.hash === `#${id}`, { timeout: 10000 });
	check((await landed(heading)) && (await inApp()) === 0, `guest screen: "${label}" opens that section of the landing page, not the app`);
}

// ---- Footer ----
const footerHrefs = async (names = ['Check a product', 'How verdicts work', 'About the team']) => {
	const footer = page.getByRole('navigation', { name: 'Footer' });
	const out = {};
	for (const name of names) out[name] = await footer.getByRole('link', { name }).getAttribute('href');
	return out;
};
for (const route of ['/', '/scan']) {
	await page.goto(base + route, { waitUntil: 'networkidle' });
	await page.waitForTimeout(700);
	const h = await footerHrefs();
	check(h['Check a product'] === '/scan' && h['How verdicts work'] === '/#faq' && h['About the team'] === '/#about', `footer on ${route}: links stay on the public site (${Object.values(h).join(', ')})`);
}
await page.goto(base + '/scan', { waitUntil: 'networkidle' });
await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'About the team' }).click();
await page.waitForURL((url) => url.pathname === '/' && url.hash === '#about', { timeout: 10000 });
check((await landed('The minds behind a safer shopping experience')) && (await inApp()) === 0, 'footer "About the team" opens the team section, not the app');

await signUp(context, base);
await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
// Inside the app the footer is one slim line ("Check a product" is in the menu): its links still open app pages.
const a = await footerHrefs(['How verdicts work', 'About the team']);
check(a['How verdicts work'] === '/app/faq' && a['About the team'] === '/app/about', `footer inside the app still opens app pages (${Object.values(a).join(', ')})`);
const slim = await page.locator('footer').evaluate((el) => ({ height: el.getBoundingClientRect().height, blurb: el.textContent.includes('capstone research project') }));
check(slim.height < 120 && !slim.blurb, `footer inside the app is the slim one (${Math.round(slim.height)}px, blurb ${slim.blurb ? 'shown' : 'left out'})`);

// ---- Phone: the page still fits ----
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'phone: landing does not scroll sideways');
check(!(await nav().isVisible()), 'phone: header links are hidden (as before)');

check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
