import { api, json } from '#lib/api.js';
import type { AgencyLevel, AgencyMe, AgencyWatch } from '#lib/types.js';

/** Under "This page is for partner agencies", for anyone else who opens an agency page. */
export const AGENCY_REFUSED = 'If you work with one, ask the DeFaketive team for access.';

/**
 * Whether the signed-in account belongs to a partner agency (agency_api.py), and how many watch-list listings it
 * has not looked at yet. Only the team can give an account this, on the server; the screens just ask.
 * The server checks it again on every agency request, so a wrong answer here can only hide or show a menu item.
 */
class Agency {
	member = $state(false);
	office = $state<string | null>(null);
	officeName = $state<string | null>(null);
	newCount = $state<Record<AgencyLevel, number>>({ reports: 0, mentions: 0 });
	/**
	 * The "Get started" guide (agency-guide.svelte). It opens by itself until the account closes it once; the server
	 * remembers that, so it does not open again on another computer. Until the server answers, it counts as seen.
	 */
	guideSeen = $state(true);
	guideOpen = $state(false);
	/** The account this answer is for, so a quick sign-out and sign-in never shows one account's menu to another. */
	#loadedFor: string | null = null;

	/** The short name for headings and the menu: "DTI view". */
	get title() {
		return `${this.office || 'Agency'} view`;
	}

	/** Ask again whenever the signed-in account changes. */
	async follow(email: string | null | undefined) {
		const who = email ?? null;
		if (who === this.#loadedFor) return;
		this.#loadedFor = who;
		this.clear();
		if (!who) return;
		try {
			const me = await api<AgencyMe>('/api/agency/me');
			if (this.#loadedFor !== who) return;
			this.member = me.member;
			this.office = me.office;
			this.officeName = me.office_name;
			this.guideSeen = !me.member || me.guide_seen;
			if (me.member) await this.refreshCount();
		} catch {
			// No answer means no agency menu; the page itself says what went wrong if it is opened.
		}
	}

	/** How many listings are new, after the account opened or marked some. */
	async refreshCount() {
		try {
			this.newCount = (await api<AgencyWatch>('/api/agency/watch')).new;
		} catch {
			// The count is a hint; leave the last one.
		}
	}

	/** Close the guide. The first time, tell the server, so it does not open by itself again. */
	closeGuide() {
		this.guideOpen = false;
		if (this.guideSeen || !this.member) return;
		this.guideSeen = true;
		api('/api/agency/guide', json('POST')).catch(() => {
			// Not remembered this time: it opens once more on the next visit, which does no harm.
		});
	}

	clear() {
		this.member = false;
		this.office = null;
		this.officeName = null;
		this.newCount = { reports: 0, mentions: 0 };
		this.guideSeen = true;
		this.guideOpen = false;
	}

	/** On sign-out: forget everything, and ask again for the next account. */
	forget() {
		this.#loadedFor = null;
		this.clear();
	}
}

export const agency = new Agency();
