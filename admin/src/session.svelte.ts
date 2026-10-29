import { api, ApiError, json } from '#lib/api.js';
import type { AdminMe } from './types.js';

/**
 * Who is signed in to the admin app. Its sign-in is its own (admin_api.py keeps it apart from the shopping app's),
 * and only an admin account gets in. The server checks again on every request.
 */
class Session {
	me = $state<AdminMe['admin']>(null);
	/** The server answered once, so we know whether anyone is signed in. */
	ready = $state(false);
	unreachable = $state(false);
	/** Why the admin was signed out without asking (the role was removed, the account deleted). */
	notice = $state('');

	/** Ask who is signed in: at the start, and again when the admin switches tabs or comes back to the window. */
	async load() {
		try {
			const answer = await api<AdminMe>('/api/admin/me');
			this.me = answer.admin;
			if (answer.notice) this.notice = answer.notice;
			this.unreachable = false;
		} catch (error) {
			this.unreachable = !(error instanceof ApiError) || error.status >= 500;
		}
		this.ready = true;
	}

	async signIn(email: string, password: string) {
		this.me = (await api<AdminMe>('/api/admin/login', json('POST', { email, password }))).admin;
		this.notice = '';
	}

	async signOut() {
		await api('/api/admin/logout', json('POST'));
		this.me = null;
		this.notice = '';
	}
}

export const session = new Session();

/** An admin request. When the server says this admin is signed out (401), the app goes back to the sign-in screen. */
export async function adminApi<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
	try {
		return await api<T>(url, options);
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) {
			session.me = null;
			session.notice = error.message;
		}
		throw error;
	}
}
