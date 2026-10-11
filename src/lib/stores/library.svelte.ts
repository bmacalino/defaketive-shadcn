import { toast } from 'svelte-sonner';
import { api, ApiError, json } from '#lib/api.js';
import { safeLink, scanTime } from '#lib/product.js';
import type { ActivityEntry, Library as LibraryData, Product } from '#lib/types.js';
import { auth } from './auth.svelte.js';
import { catalog } from './catalog.svelte.js';

// One person's own library: the products they scanned, opened or saved. Nobody else's.
//
// Guests keep it in this browser. Signed-in users keep it in their account (the user_activity and
// user_wishlist tables), so it follows them to any browser and stays apart from every other account.
//
// This is deliberately separate from the shared pool of everything anyone has analyzed (catalog.all, from the
// products table). That pool is for browsing, searching and picking similar products. It is never shown as
// "yours": a product only enters this library when this person scans it, opens its report or saves it.
const KEYS = {
	activity: 'defaketive-activity',
	wishlist: 'defaketive-wishlist',
	cleared: 'defaketive-history-cleared'
};
const KEEP = 100;

function read<T>(key: string, fallback: T): T {
	try {
		return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
	} catch {
		return fallback;
	}
}

class Library {
	activity = $state<Record<string, ActivityEntry>>({});
	wishlist = $state<string[]>([]);
	/** "Clear scan history" hides everything checked before this moment. */
	clearedAt = $state(0);
	/** True once we know who is using the app and their library has arrived. */
	ready = $state(false);
	/** True when the account's library could not be loaded. Pages say so, instead of looking empty. */
	error = $state(false);
	#started = false;
	#warned = false;

	/**
	 * Everything in this person's library, newest first. Each product shows its latest analysis when the
	 * shared database has one, and otherwise the copy that was kept with the history.
	 */
	mine = $derived.by(() => {
		const products: Product[] = [];
		for (const [link, entry] of Object.entries(this.activity)) {
			if (!entry?.product || !safeLink(link)) continue;
			const fresh = catalog.lookup(link);
			// Keep this library's own link, so times and saves still match when the database copy has extra tracking.
			products.push(fresh ? (fresh.link === link ? fresh : { ...fresh, link }) : entry.product);
		}
		return products.sort((a, b) => this.timeOf(b) - this.timeOf(a));
	});

	/** What this person scanned or opened, minus anything cleared from the history. */
	history = $derived.by(() => {
		const cleared = Number(this.clearedAt) || 0;
		return this.mine.filter((product) => {
			const opened = this.activity[product.link]?.openedAt ?? 0;
			return opened > 0 && opened > cleared;
		});
	});

	/** What this person saved, in the order they saved it. */
	saved = $derived.by(() => {
		const products: Product[] = [];
		for (const link of this.wishlist) {
			const product = this.mine.find((item) => item.link === link) ?? catalog.lookup(link);
			if (product) products.push(product.link === link ? product : { ...product, link });
		}
		return products;
	});

	/** When this person last scanned or opened a product, or else when it was analyzed. */
	timeOf(product: Product) {
		return scanTime(product, this.activity[product.link]);
	}

	isSaved(link: string) {
		return this.wishlist.includes(link);
	}

	/** Read the guest library kept in this browser. Safe to call more than once. */
	start() {
		if (this.#started) return;
		this.#started = true;
		const activity = read<Record<string, ActivityEntry>>(KEYS.activity, {});
		this.activity =
			activity && typeof activity === 'object' && !Array.isArray(activity)
				? Object.fromEntries(
						Object.entries(activity).filter(
							([link, entry]) =>
								safeLink(link) && entry?.product?.link === link && Number.isFinite(entry.openedAt)
						)
					)
				: {};
		const wishlist = read<string[]>(KEYS.wishlist, []);
		this.wishlist = Array.isArray(wishlist) ? [...new Set(wishlist.filter((link) => safeLink(link)))] : [];
		this.clearedAt = Number(read(KEYS.cleared, 0)) || 0;
	}

	#persist() {
		if (auth.user) return;
		try {
			localStorage.setItem(KEYS.activity, JSON.stringify(this.activity));
			localStorage.setItem(KEYS.wishlist, JSON.stringify(this.wishlist));
		} catch {
			if (!this.#warned) {
				this.#warned = true;
				toast.warning('Browser storage is unavailable. Your changes will last for this visit only.');
			}
		}
	}

	#saveToAccount(url: string, method: string, body: unknown) {
		return api(url, json(method, body)).catch(() =>
			toast.error("That couldn't be saved to your account. Check your connection and try again.")
		);
	}

	/**
	 * Keep a compact summary of each product in this person's library. The full review evidence stays on the
	 * server. `opened` stamps it with now, which is what puts it in the history.
	 */
	cache(products: Product[], opened = false) {
		for (const product of products) {
			if (!safeLink(product?.link)) continue;
			const { comments: _comments, ...summary } = product;
			this.activity[product.link] = {
				product: summary as Product,
				openedAt: opened ? Date.now() : (this.activity[product.link]?.openedAt ?? 0)
			};
		}
		this.activity = Object.fromEntries(
			Object.entries(this.activity)
				.sort((a, b) => b[1].openedAt - a[1].openedAt)
				.filter(([link], index) => index < KEEP || this.wishlist.includes(link))
		);
		this.#persist();
		if (auth.user && opened) {
			for (const product of products) {
				const entry = this.activity[product?.link];
				if (entry) {
					this.#saveToAccount('/api/me/activity', 'PUT', {
						link: product.link,
						product: entry.product,
						openedAt: entry.openedAt
					});
				}
			}
		}
	}

	/** Note that this person opened a report, so it shows in their history. */
	remember(product: Product) {
		this.cache([product], true);
	}

	/** Note the products this person's own scan just collected, so they show in their history at once. */
	recordScan(products: Product[]) {
		this.cache(products, true);
	}

	/** Save or unsave a product. The toast offers Undo, which runs this again quietly. */
	async toggleWishlist(product: Product, options: { undo?: boolean } = {}) {
		const link = safeLink(product?.link);
		if (!link) return;
		const saved = this.wishlist.includes(link);
		this.wishlist = saved ? this.wishlist.filter((item) => item !== link) : [...this.wishlist, link];
		if (!saved) this.cache([product]);
		this.#persist();
		if (auth.user) {
			const entry = this.activity[link];
			// The account needs the product's summary before it can list it as saved.
			if (!saved && entry) {
				await this.#saveToAccount('/api/me/activity', 'PUT', {
					link,
					product: entry.product,
					openedAt: entry.openedAt
				});
			}
			await this.#saveToAccount('/api/me/wishlist', saved ? 'DELETE' : 'PUT', { link });
		}
		if (options.undo === false) {
			toast('Undone.');
			return;
		}
		toast(
			saved
				? 'Removed from wishlist.'
				: auth.user
					? 'Saved to the wishlist in your account.'
					: 'Saved to your wishlist on this browser.',
			{ action: { label: 'Undo', onClick: () => this.toggleWishlist(product, { undo: false }) } }
		);
	}

	/** After signing in: bring over what this browser's guest opened or saved, once, then use the account's copy. */
	async loadAccount() {
		if (!auth.user) return;
		const localWishlist = read<string[]>(KEYS.wishlist, []);
		const wishlist = Array.isArray(localWishlist) ? localWishlist.filter((link) => safeLink(link)) : [];
		const localActivity = read<Record<string, ActivityEntry>>(KEYS.activity, {});
		const opened = Object.fromEntries(
			Object.entries(localActivity && typeof localActivity === 'object' ? localActivity : {}).filter(
				([link, entry]) => safeLink(link) && (entry?.openedAt > 0 || wishlist.includes(link))
			)
		);
		let library: LibraryData;
		try {
			library =
				Object.keys(opened).length || wishlist.length
					? await api('/api/me/import', json('POST', { activity: opened, wishlist }))
					: await api('/api/me/library');
		} catch (failure) {
			// The server says nobody is signed in any more: find out, so the app can ask them to sign in again.
			if (failure instanceof ApiError && failure.status === 401) {
				await auth.refresh();
				return;
			}
			// Home, History and Wishlist show this as an error with "Try again", not as an empty list.
			this.error = true;
			return;
		}
		this.error = false;
		// The next guest on a shared computer must not see this user's history.
		try {
			Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
		} catch {
			/* nothing to clean up */
		}
		this.activity = library.activity ?? {};
		this.wishlist = library.wishlist ?? [];
		this.clearedAt = Number(library.clearedAt) || 0;
	}

	/** "Try again" after the library could not be loaded. */
	async retry() {
		// Show the loading state while it tries, not the old error.
		this.error = false;
		this.ready = false;
		await this.loadAccount();
		this.ready = true;
	}

	/** After signing out or deleting the account: nothing of that account stays on screen. */
	forget() {
		this.activity = {};
		this.wishlist = [];
		this.clearedAt = 0;
		this.error = false;
	}

	/** Empties Scan History and Home. Wishlisted products keep their place in the wishlist. */
	async clearHistory() {
		const now = Date.now();
		if (auth.user) {
			let library: LibraryData;
			try {
				library = await api('/api/me/activity', json('DELETE', { clearedAt: now }));
			} catch {
				toast.error("Your history couldn't be cleared. Check your connection and try again.");
				return false;
			}
			this.activity = library.activity ?? {};
			this.wishlist = library.wishlist ?? [];
			this.clearedAt = Number(library.clearedAt) || now;
		} else {
			this.clearedAt = now;
			this.activity = Object.fromEntries(
				Object.entries(this.activity)
					.filter(([link]) => this.wishlist.includes(link))
					.map(([link, entry]) => [link, { ...entry, openedAt: 0 }])
			);
			try {
				localStorage.setItem(KEYS.cleared, JSON.stringify(now));
			} catch {
				/* the history is cleared for this visit either way */
			}
			this.#persist();
		}
		toast('Scan history cleared. Your wishlist is kept.');
		return true;
	}
}

export const library = new Library();
