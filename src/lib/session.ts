import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { agency } from '#lib/stores/agency.svelte.js';
import { auth } from '#lib/stores/auth.svelte.js';
import { catalog } from '#lib/stores/catalog.svelte.js';
import { library } from '#lib/stores/library.svelte.js';
import { scan } from '#lib/stores/scan.svelte.js';
import { ui } from '#lib/stores/ui.svelte.js';

/**
 * Clear everything on screen that belonged to the account that just left, so the next person on this
 * browser (a guest or another account) starts with nothing of theirs: history, wishlist, the last-scan card,
 * any search results and the agency menu.
 */
export function forgetAccount() {
	agency.forget();
	library.forget();
	scan.reset();
	catalog.results = [];
}

/** Sign out from anywhere in the app. */
export async function signOut() {
	ui.leaving = true;
	try {
		await auth.signOut();
		forgetAccount();
		toast("You're signed out.");
		await goto('/');
	} catch (error) {
		toast.error((error as Error).message);
	} finally {
		ui.leaving = false;
	}
}
