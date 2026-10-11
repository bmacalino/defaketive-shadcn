import { api, ApiError, json } from '#lib/api.js';
import type { GuestStatus, Me } from '#lib/types.js';

/** Who is using the app: a signed-in user, or a guest with a few free scans a day. */
class Auth {
	user = $state<Me['user']>(null);
	guest = $state<GuestStatus | null>(null);
	/** True once the first answer from the server has arrived. */
	ready = $state(false);
	/**
	 * True when the server did not answer at all. That is not the same as being a guest: nobody is sent to
	 * sign in because of it, and the page says the server can't be reached instead.
	 */
	unreachable = $state(false);

	/** Free scans a guest has left today. */
	get left() {
		return Number(this.guest?.left ?? 3);
	}

	apply(me: Me | null | undefined) {
		this.user = me?.user ?? null;
		this.guest = me?.guest ?? null;
		this.ready = true;
	}

	async refresh() {
		try {
			this.apply(await api<Me>('/api/auth/me'));
			this.unreachable = false;
		} catch (error) {
			// No answer (or a server fault) tells us nothing about who is here, so what we knew is kept.
			this.unreachable = !(error instanceof ApiError) || error.status >= 500;
			this.ready = true;
		}
		return this.user;
	}

	async signIn(email: string, password: string) {
		const me = await api<Me>('/api/auth/login', json('POST', { email, password }));
		this.apply(me);
		return me;
	}

	async signUp(fields: {
		full_name: string;
		email: string;
		password: string;
		confirm: string;
		agree: boolean;
	}) {
		const me = await api<Me>('/api/auth/signup', json('POST', fields));
		this.apply(me);
		return me;
	}

	async signOut() {
		this.apply(await api<Me>('/api/auth/logout', json('POST')));
	}
}

export const auth = new Auth();
