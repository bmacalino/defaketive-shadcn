import { api, ApiError } from '#lib/api.js';
import { linkIdentity } from '#lib/product.js';
import type { Product } from '#lib/types.js';

/** The analyzed products the server knows about, and the lists built from them. */
class Catalog {
	/** Every product analyzed for this visitor's session. */
	products = $state<Product[]>([]);
	loading = $state(true);
	error = $state(false);
	/** Set when the review model isn't installed on the server, so nothing can be analyzed. */
	modelUnavailable = $state('');

	/**
	 * Every analyzed product in the server's database, not just this visitor's session. Empty when the server does
	 * not offer it (server.py not running), in which case lists fall back to the session catalog.
	 */
	all = $state<Product[]>([]);
	allLoading = $state(true);

	/** What to browse and search: the whole database when we have it, otherwise this session's products. */
	browse = $derived(this.all.length ? this.all : this.products);
	/** True until there is something to browse. */
	browseLoading = $derived((this.loading || this.allLoading) && !this.browse.length);

	/** The products shown on the Products page: the last search, or the whole catalog. */
	results = $state<Product[]>([]);

	/** Checked products with enough reviews and nothing flagged (the original app's own list). */
	picks = $state<Product[]>([]);
	/** The same idea, picked from the whole database when we have it. */
	suggestions = $derived(
		this.all.length
			? this.all
					.filter((product) => product.badge_view?.state === 'no_warning_signs')
					.sort((a, b) => (b.badge_view?.reviews_analyzed ?? 0) - (a.badge_view?.reviews_analyzed ?? 0))
					.slice(0, 12)
			: this.picks
	);
	/** Products other users saved most, with how many saved them. */
	popular = $state<{ product: Product; saves: number }[]>([]);
	/** Real totals from the server's database, for the landing and sign-in pages. */
	stats = $state<{ products: number; reviews: number; marketplaces: number } | null>(null);
	/** True when those totals could not be fetched, so the page leaves the strip out instead of waiting forever. */
	statsFailed = $state(false);

	async load() {
		this.loading = true;
		try {
			const data = await api<{ products: Product[] }>('/api/products');
			this.products = data.products ?? [];
			this.error = false;
			this.modelUnavailable = '';
		} catch (failure) {
			this.error = true;
			if (failure instanceof ApiError && failure.body.model_unavailable) {
				this.modelUnavailable = failure.message;
			}
		} finally {
			this.loading = false;
		}
	}

	async loadAll() {
		this.allLoading = true;
		try {
			const data = await api<{ products: Product[] }>('/api/saved/products');
			this.all = Array.isArray(data.products) ? data.products : [];
		} catch {
			// The original app on its own does not have this route. Everything still works from the session catalog.
			this.all = [];
		} finally {
			this.allLoading = false;
		}
	}

	/** "Try again" after the products could not be loaded. */
	async reload() {
		await Promise.all([this.load(), this.loadAll()]);
	}

	/** An analyzed product by its listing link, from the whole database. */
	lookup(link: string): Product | undefined {
		const identity = linkIdentity(link);
		return identity ? this.browse.find((product) => linkIdentity(product.link) === identity) : undefined;
	}

	async loadExtras() {
		const [picks, popular] = await Promise.all([
			api<{ products: Product[] }>('/api/picks').catch(() => null),
			api<{ products: { product: Product; saves: number }[] }>('/api/saved/popular').catch(() =>
				api<{ products: { product: Product; saves: number }[] }>('/api/wishlist/popular').catch(() => null)
			)
		]);
		if (picks) this.picks = Array.isArray(picks.products) ? picks.products : [];
		if (popular) this.popular = Array.isArray(popular.products) ? popular.products : [];
	}

	async loadStats() {
		try {
			this.stats = await api('/api/stats/public');
			this.statsFailed = false;
		} catch {
			// The numbers are decoration; the page works without them.
			this.statsFailed = true;
		}
	}
}

export const catalog = new Catalog();
