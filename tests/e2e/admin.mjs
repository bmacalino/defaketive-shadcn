// The admin app (admin/, admin_api.py): a separate app on its own address with its own sign-in, for admin accounts
// only. It lists the accounts with names and emails, makes and removes admins, deletes accounts and changes the daily
// limits. Admin accounts are admin-only: the shopping app refuses them, and it has no way into the admin app.
// The first admin is made the only way there is: scripts/admin_accounts.py, on the scratch accounts database.
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PASSWORD, signUp } from './_signin.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const adminBase = process.env.ADMIN || 'http://localhost:5175';
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
const noSideways = (page, width = 390) => page.evaluate((w) => document.documentElement.scrollWidth <= w + 1 && [...document.querySelectorAll('main *')].every((el) => el.getBoundingClientRect().right <= w + 1), width);

function script(...args) {
	const result = spawnSync(python, [path.join(root, 'scripts', 'admin_accounts.py'), ...args], {
		cwd: root,
		env: { ...process.env, DEFAKETIVE_ACCOUNTS_DB: accountsDb },
		encoding: 'utf8'
	});
	if (result.status !== 0) throw new Error(`admin_accounts.py failed: ${result.stderr || result.stdout}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function open(options = {}) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	return { context, page, errors };
}
const rowOf = (page, email) => page.locator(`tr[data-account="${email}"]`);
async function signIn(page, email, password) {
	await page.goto(adminBase + '/', { waitUntil: 'networkidle' });
	await page.getByLabel('Email').waitFor({ timeout: 15000 });
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

// ---- 1. The shopping app has no way in -------------------------------------------------------------------------
const shopper = await open();
const shopperWho = await signUp(shopper.context, base, 'Plain Shopper');
{
	const { page } = shopper;
	await page.goto(base + '/app/home', { waitUntil: 'networkidle' });
	await page.locator('[data-sidebar="menu-button"][href="/app/home"]').waitFor({ timeout: 20000 });
	check((await page.locator('[data-sidebar="sidebar"]').getByText(/admin/i).count()) === 0, 'shopping app: no admin item in the menu');
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog');
	await palette.getByRole('option', { name: 'Home', exact: true }).waitFor({ timeout: 5000 });
	await page.keyboard.type('admin');
	await page.waitForTimeout(300);
	check((await palette.getByRole('option', { name: /admin/i }).count()) === 0, 'shopping app: Ctrl+K finds no admin page');
	await page.keyboard.press('Escape');
	const old = await shopper.context.request.get(base + '/api/agency/me');
	check(old.status() === 404, `the old /api/agency routes are gone (${old.status()})`);
}

// ---- 2. The admin app's sign-in -----------------------------------------------------------------------------------
const { context, page, errors } = await open();
const who = await signUp(context, base, 'Admin Person');
script('add', '--email', who.email);
await context.clearCookies();

await page.goto(adminBase + '/', { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'Admin sign-in' }).waitFor({ timeout: 15000 });
check((await page.locator('table').count()) === 0, 'admin app: opens on its own sign-in screen, no accounts shown');
await axeCheck(page, 'the admin sign-in screen');
await page.screenshot({ path: 'tests/e2e/shots/admin_signin.png' });

await signIn(page, shopperWho.email, PASSWORD);
await page.getByText('This account is not an admin.', { exact: false }).waitFor({ timeout: 10000 });
check(true, 'admin app: a shopper account is refused');
await signIn(page, who.email, 'not the password at all');
await page.getByText('Email or password is incorrect.', { exact: true }).waitFor({ timeout: 10000 });
check(true, 'admin app: a wrong password is refused');
await signIn(page, who.email, PASSWORD);
await page.getByRole('heading', { name: 'Admin', exact: true }).waitFor({ timeout: 15000 });
check(true, 'admin app: an admin gets in');
const shopSide = await (await context.request.get(base + '/api/auth/me')).json();
check(!shopSide.user, 'signing in to the admin app does not sign in to the shopping app');

// Admin accounts are admin-only.
{
	const tryShop = await open();
	const answer = await tryShop.context.request.post(base + '/api/auth/login', { data: { email: who.email, password: PASSWORD } });
	check(answer.status() === 403, `shopping app: refuses an admin account (${answer.status()})`);
	await tryShop.page.goto(base + '/', { waitUntil: 'networkidle' });
	await tryShop.page.getByRole('button', { name: 'Sign in' }).first().click();
	const dialog = tryShop.page.getByRole('dialog');
	await dialog.getByLabel('Email').fill(who.email);
	await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
	await dialog.getByRole('button', { name: 'Sign in' }).last().click();
	await tryShop.page.getByText('It can only be used in the DeFaketive admin app.', { exact: false }).first().waitFor({ timeout: 10000 });
	check(true, 'shopping app: the sign-in pop-up says an admin account is for the admin app');
	await tryShop.context.close();
}

// ---- 3. Accounts --------------------------------------------------------------------------------------------------
await rowOf(page, shopperWho.email).waitFor({ timeout: 10000 });
const shopperRow = rowOf(page, shopperWho.email);
check((await shopperRow.innerText()).includes('Plain Shopper'), 'accounts: the shopper is listed with their name and email');
check((await shopperRow.getByText('Shopper', { exact: true }).count()) === 1, 'accounts: the shopper is labelled Shopper');
const meRow = rowOf(page, who.email);
check((await meRow.getByText('Admin', { exact: true }).count()) === 1 && (await meRow.getByText('This is you').count()) === 1, 'accounts: my own row says Admin and "This is you"');
check((await meRow.getByRole('button').count()) === 0, 'accounts: I cannot remove my own role or delete myself');
await axeCheck(page, 'the Accounts tab (light)');
await page.screenshot({ path: 'tests/e2e/shots/admin_accounts.png' });

await page.getByLabel('Search accounts').fill(shopperWho.email);
await page.waitForFunction((email) => document.querySelectorAll('tr[data-account]').length === 1 && document.querySelector(`tr[data-account="${email}"]`), shopperWho.email, { timeout: 10000 });
check(true, 'search: an email finds just that account');
await page.getByLabel('Search accounts').fill('no-such-person-anywhere');
await page.getByText('No accounts match', { exact: true }).waitFor({ timeout: 10000 });
check(true, 'search: nothing found says so');
await page.getByRole('button', { name: 'Clear the search' }).click();
await rowOf(page, who.email).waitFor({ timeout: 10000 });

// Make the shopper an admin: their shopping-app session ends. Then a shopper again.
check(!!(await (await shopper.context.request.get(base + '/api/auth/me')).json()).user, 'the shopper is signed in to the shopping app');
await shopperRow.getByRole('button', { name: 'Make admin' }).click();
const dialog = page.getByRole('alertdialog');
await dialog.waitFor({ timeout: 5000 });
const warning = await dialog.innerText();
check(warning.includes(shopperWho.email) && warning.includes('no longer be able to use the shopping app'), 'make admin: the pop-up names the account and says it leaves the shopping app');
await dialog.getByRole('button', { name: 'Make admin' }).click();
await shopperRow.getByText('Admin', { exact: true }).waitFor({ timeout: 10000 });
check(true, 'make admin: the row now says Admin');
check(!(await (await shopper.context.request.get(base + '/api/auth/me')).json()).user, 'make admin: their shopping-app session ended');
check((await shopperRow.getByRole('button', { name: /Delete/ }).count()) === 0, 'an admin cannot be deleted until the role is removed');

// The new admin signs in to the admin app; when the role is removed, they are sent back to sign-in with a notice.
const second = await open();
await signIn(second.page, shopperWho.email, PASSWORD);
await second.page.getByRole('heading', { name: 'Admin', exact: true }).waitFor({ timeout: 15000 });
check(true, 'the new admin can sign in to the admin app');
await shopperRow.getByRole('button', { name: 'Remove admin' }).click();
await page.getByRole('alertdialog').getByRole('button', { name: 'Remove admin' }).click();
await shopperRow.getByText('Shopper', { exact: true }).waitFor({ timeout: 10000 });
await second.page.getByRole('tab', { name: 'Daily limits' }).click();
await second.page.getByText('no longer an admin', { exact: false }).waitFor({ timeout: 10000 });
check((await second.page.getByRole('heading', { name: 'Admin sign-in' }).count()) === 1, 'remove admin: their admin app goes back to sign-in and says why');
await second.context.close();

// Delete an account.
const doomed = await open();
const doomedWho = await signUp(doomed.context, base, 'Delete Me');
await page.reload({ waitUntil: 'networkidle' });
await rowOf(page, doomedWho.email).waitFor({ timeout: 10000 });
await rowOf(page, doomedWho.email).getByRole('button', { name: "Delete Delete Me's account" }).click();
await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
await rowOf(page, doomedWho.email).waitFor({ state: 'detached', timeout: 10000 });
check(true, 'delete: the account leaves the list');
check(!(await (await doomed.context.request.get(base + '/api/auth/me')).json()).user, 'delete: the deleted account is signed out everywhere');
await doomed.context.close();

await page.emulateMedia({ colorScheme: 'dark' });
await page.evaluate(() => document.documentElement.classList.add('dark'));
await axeCheck(page, 'the Accounts tab (dark)');
await page.evaluate(() => document.documentElement.classList.remove('dark'));
await page.emulateMedia({ colorScheme: 'light' });

// ---- 4. Daily limits ----------------------------------------------------------------------------------------------
const before = (await (await context.request.get(adminBase + '/api/admin/limits')).json()).limits;
await page.getByRole('tab', { name: 'Daily limits' }).click();
await page.getByLabel('Whole site').waitFor({ timeout: 10000 });
check(page.url().endsWith('/?tab=limits'), 'limits: the tab is in the address');
check((await page.getByLabel('Whole site').inputValue()) === String(before.site), `limits: shows the site limit (${before.site})`);
const save = page.getByRole('button', { name: 'Save limits' });
check(await save.isDisabled(), 'limits: Save waits for a change');
await page.getByLabel('Each account').fill('abc');
check((await page.getByText(/Use a whole number from 0 to/).count()) === 1 && (await save.isDisabled()), 'limits: a word is refused before saving');
await page.getByLabel('Each account').fill(String(before.account + 7));
await save.click();
await page.getByText('Daily limits saved.', { exact: false }).waitFor({ timeout: 10000 });
check(true, 'limits: saving says so');
await page.reload({ waitUntil: 'networkidle' });
await page.getByLabel('Each account').waitFor({ timeout: 10000 });
check((await page.getByLabel('Each account').inputValue()) === String(before.account + 7), 'limits: a reload opens the same tab and keeps the new number');
await axeCheck(page, 'the Daily limits tab');
await page.screenshot({ path: 'tests/e2e/shots/admin_limits.png' });
await context.request.put(adminBase + '/api/admin/limits', { data: before });

// ---- 5. Own password ----------------------------------------------------------------------------------------------
const NEW_PASSWORD = 'a brand new password';
await page.getByRole('button', { name: 'Change password' }).click();
const pw = page.getByRole('dialog');
await pw.getByLabel('Current password').fill(PASSWORD);
await pw.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
await pw.getByLabel('New password again').fill(NEW_PASSWORD);
await axeCheck(page, 'the change-password pop-up');
await pw.getByRole('button', { name: 'Change password' }).click();
await page.getByText('Your password was changed.', { exact: true }).waitFor({ timeout: 10000 });
await page.getByRole('button', { name: 'Sign out' }).click();
await page.getByRole('heading', { name: 'Admin sign-in' }).waitFor({ timeout: 10000 });
await signIn(page, who.email, NEW_PASSWORD);
await page.getByRole('heading', { name: 'Admin', exact: true }).waitFor({ timeout: 15000 });
check(true, 'password: changed, signed out, and back in with the new one');

// ---- 6. Phone width -----------------------------------------------------------------------------------------------
{
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() });
	const phonePage = await phone.newPage();
	await phonePage.goto(adminBase + '/', { waitUntil: 'networkidle' });
	await phonePage.locator(`li[data-account="${who.email}"]`).waitFor({ timeout: 15000 });
	check((await phonePage.locator('table').isVisible()) === false, 'phone: accounts are cards, not the table');
	check(await noSideways(phonePage), 'phone: the Accounts tab does not scroll sideways');
	await phonePage.screenshot({ path: 'tests/e2e/shots/admin_phone.png' });
	await phonePage.getByRole('tab', { name: 'Daily limits' }).click();
	await phonePage.getByLabel('Whole site').waitFor({ timeout: 10000 });
	check(await noSideways(phonePage), 'phone: the Daily limits tab does not scroll sideways');
	await phone.close();
}

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await shopper.context.close();
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll admin checks passed.');
process.exit(failures ? 1 : 0);
