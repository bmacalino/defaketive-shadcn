// The app is for signed-in people only, so a test that walks the app first makes a real account
// (in the scratch accounts database the test server uses). The cookie lands in the browser context.
export const PASSWORD = 'correct horse battery';

/** A new account's welcome tour opens over the page: tests that sign up through the pop-up close it first. */
export async function closeTour(page) {
	const tour = page.locator('[data-tour]');
	if (!(await tour.waitFor({ timeout: 15000 }).then(() => true).catch(() => false))) return false;
	await tour.getByRole('button', { name: 'Skip' }).click();
	await tour.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
	return true;
}

export async function signUp(context, base, name = 'Test Shopper') {
	const email = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}@example.com`;
	const response = await context.request.post(base + '/api/auth/signup', {
		data: { full_name: name, email, password: PASSWORD, confirm: PASSWORD, agree: true }
	});
	if (!response.ok()) throw new Error(`sign-up failed: ${response.status()} ${await response.text()}`);
	return { email, password: PASSWORD, name };
}
