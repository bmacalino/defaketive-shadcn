import { auth } from '#lib/stores/auth.svelte.js';
import { catalog } from '#lib/stores/catalog.svelte.js';
import { library } from '#lib/stores/library.svelte.js';

/**
 * Everything the app needs on every page: who is here, the products, and that person's own library.
 * The first page load runs it once. A "Try again" button runs it again after the server did not answer.
 */
export async function boot() {
	// The whole-database list is not waited for: pages fill in when it arrives.
	catalog.loadAll();
	const [user] = await Promise.all([auth.refresh(), catalog.load()]);
	if (user) await library.loadAccount();
	library.ready = true;
}
