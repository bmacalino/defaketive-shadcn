<script lang="ts">
	import { goto } from '$app/navigation';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import HouseIcon from '@lucide/svelte/icons/house';
	import InfoIcon from '@lucide/svelte/icons/info';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import PackageSearchIcon from '@lucide/svelte/icons/package-search';
	import ScanSearchIcon from '@lucide/svelte/icons/scan-search';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import type { Component } from 'svelte';
	import { toggleMode } from 'mode-watcher';
	import {
		CommandDialog,
		CommandEmpty,
		CommandGroup,
		CommandInput,
		CommandItem,
		CommandList,
		CommandSeparator
	} from '#lib/components/ui/command/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import { reportHref } from '#lib/nav.js';
	import { signOut } from '#lib/session.js';
	import { chipFor, linkIdentity, platformName, view } from '#lib/product.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { catalog } from '#lib/stores/catalog.svelte.js';
	import { library } from '#lib/stores/library.svelte.js';
	import { ui } from '#lib/stores/ui.svelte.js';

	// Ctrl+K from anywhere: jump to a page, open a product you have checked, or do a quick action.
	// The app's pages and the list of analyzed products are for signed-in people; a guest gets the public pages.
	type Page = { href: string; label: string; icon: Component; words: string };
	const guestPages: Page[] = [
		{ href: '/scan', label: 'Check a product', icon: ScanSearchIcon, words: 'scan analyze link paste new guest' },
		{ href: '/#how', label: 'How it works', icon: ListOrderedIcon, words: 'steps guide' },
		{ href: '/#faq', label: 'FAQ', icon: CircleHelpIcon, words: 'questions help verdicts' },
		{ href: '/#about', label: 'About', icon: InfoIcon, words: 'team project' }
	];
	const appPages: Page[] = [
		{ href: '/app/home', label: 'Home', icon: HouseIcon, words: 'overview start' },
		{ href: '/app/analyze', label: 'Check a product', icon: ScanSearchIcon, words: 'scan analyze link paste new' },
		{ href: '/app/products', label: 'Products', icon: PackageSearchIcon, words: 'checked analyzed browse list' },
		{ href: '/app/history', label: 'History', icon: HistoryIcon, words: 'scans past' },
		{ href: '/app/wishlist', label: 'Wishlist', icon: HeartIcon, words: 'saved shortlist' },
		{ href: '/app/settings', label: 'Settings', icon: SettingsIcon, words: 'account preferences dark alerts' },
		{ href: '/app/about', label: 'About', icon: InfoIcon, words: 'team project' },
		{ href: '/app/faq', label: 'FAQ', icon: CircleHelpIcon, words: 'questions help verdicts' }
	];
	const pages = $derived(auth.user ? appPages : guestPages);

	// Your own products first, then everything else that was analyzed. One entry per listing.
	const products = $derived.by(() => {
		if (!auth.user) return [];
		const seen = new Set<string>();
		return [...library.mine, ...catalog.browse]
			.filter((product) => {
				const key = linkIdentity(product.link);
				if (!key || seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.slice(0, 80);
	});

	function go(path: string) {
		ui.commandOpen = false;
		goto(path);
	}
	function run(action: () => void) {
		ui.commandOpen = false;
		action();
	}
</script>

<CommandDialog
	bind:open={ui.commandOpen}
	title="Search DeFaketive"
	description={auth.user ? 'Jump to a page, open a product you checked, or run an action.' : 'Jump to a page or run an action.'}
>
	<CommandInput placeholder={auth.user ? 'Search pages and products…' : 'Search pages…'} aria-controls="palette-list" />
	<CommandList id="palette-list" tabindex={0} class="max-h-80">
		<CommandEmpty>{auth.user ? 'Nothing matches. Try a page name or part of a product name.' : 'Nothing matches. Try a page name.'}</CommandEmpty>
		<CommandGroup heading="Go to">
			{#each pages as item (item.href)}
				<CommandItem value="{item.label} {item.words}" onSelect={() => go(item.href)}>
					<item.icon /> {item.label}
				</CommandItem>
			{/each}
		</CommandGroup>
		<CommandSeparator />
		<CommandGroup heading="Actions">
			<CommandItem value="toggle dark light theme mode" onSelect={() => run(toggleMode)}><MoonIcon /> Switch light or dark theme</CommandItem>
			{#if auth.user}
				<CommandItem value="sign out log out" onSelect={() => run(signOut)}><LogOutIcon /> Sign out</CommandItem>
			{:else}
				<CommandItem value="sign in log in" onSelect={() => run(() => ui.openAuth('signin'))}><LogInIcon /> Sign in</CommandItem>
				<CommandItem value="create account sign up register" onSelect={() => run(() => ui.openAuth('signup'))}><UserPlusIcon /> Create account</CommandItem>
			{/if}
		</CommandGroup>
		{#if products.length}
			<CommandSeparator />
			<CommandGroup heading="Products">
				{#each products as product (product.link)}
					<CommandItem
						value="{product.name} {platformName(product)} {view(product).headline} {chipFor(product).label}"
						onSelect={() => go(reportHref(product.link))}
					>
						<PackageSearchIcon />
						<span class="min-w-0 flex-1 truncate">{product.name || 'Unnamed product'}</span>
						<span class="text-muted-foreground shrink-0 text-xs">{chipFor(product).label}</span>
					</CommandItem>
				{/each}
			</CommandGroup>
		{/if}
	</CommandList>
	<div class="text-muted-foreground flex items-center gap-4 border-t px-3 py-2 text-xs">
		<span class="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
		<span class="flex items-center gap-1"><Kbd>Enter</Kbd> open</span>
		<span class="flex items-center gap-1"><Kbd>Esc</Kbd> close</span>
		<span class="ml-auto flex items-center gap-1"><Kbd>/</Kbd> link box</span>
	</div>
</CommandDialog>
