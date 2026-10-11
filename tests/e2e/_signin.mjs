// The app is for signed-in people only, so a test that walks the app first makes a real account
// (in the scratch accounts database the test server uses). The cookie lands in the browser context.
export const PASSWORD = 'correct horse battery';

export async function signUp(context, base, name = 'Test Shopper') {
	const email = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}@example.com`;
	const response = await context.request.post(base + '/api/auth/signup', {
		data: { full_name: name, email, password: PASSWORD, confirm: PASSWORD, agree: true }
	});
	if (!response.ok()) throw new Error(`sign-up failed: ${response.status()} ${await response.text()}`);
	return { email, password: PASSWORD, name };
}
