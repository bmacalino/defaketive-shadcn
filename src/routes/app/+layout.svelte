<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SearchIcon from '@lucide/svelte/icons/search';
	import AppSidebar from '#lib/components/app/app-sidebar.svelte';
	import ScanPill from '#lib/components/app/scan-pill.svelte';
	import ThemeToggle from '#lib/components/app/theme-toggle.svelte';
	import SiteFooter from '#lib/components/app/site-footer.svelte';
	import {
		Breadcrumb,
		BreadcrumbItem,
		BreadcrumbLink,
		BreadcrumbList,
		BreadcrumbPage,
		BreadcrumbSeparator
	} from '#lib/components/ui/breadcrumb/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { guestDestination } from '#lib/nav.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { ui } from '#lib/stores/ui.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The app is for signed-in people. A guest who lands on one of its pages (a typed address, an old bookmark,
	// a shared link) is sent to the public screen that does the same job, or asked to sign in when there is none.
	// Nothing of the app is drawn until we know who is here.
	// When the server cannot be reached we do not know who is here, so nobody is sent anywhere: the banner at
	// the top of the page says what is wrong and offers "Try again".
	$effect(() => {
		if (!auth.ready || auth.user || ui.leaving || auth.unreachable) return;
		const wanted = page.url.pathname + page.url.search;
		const target = guestDestination(page.url);
		goto(target.href, { replaceState: true }).then(() => {
			if (target.signIn) ui.openAuth('signin', 'Sign in or create a free account to open that page.', wanted);
		});
	});

	const titles: Record<string, string> = {
		home: 'Home',
		analyze: 'Check a product',
		products: 'Products',
		report: 'Report',
		history: 'History',
		wishlist: 'Wishlist',
		settings: 'Settings',
		about: 'About',
		faq: 'FAQ',
		extension: 'Get the extension'
	};
	const current = $derived(titles[page.url.pathname.split('/')[2] ?? ''] ?? 'DeFaketive');

	const mac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
</script>

{#if !auth.user}
	<div class="text-muted-foreground grid min-h-[70svh] place-items-center px-4 text-center" role="status">
		{#if auth.unreachable}
			<span class="text-sm">Nothing can be shown until the server answers.</span>
		{:else}
			<span class="flex items-center gap-2 text-sm"><Spinner /> Opening DeFaketive…</span>
		{/if}
	</div>
{:else}
<Sidebar.Provider>
	<AppSidebar />
	<!-- min-w-0 lets wide content (a row of cards) scroll inside the page instead of stretching it. -->
	<Sidebar.Inset class="min-w-0">
		<header class="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem class="hidden md:block">
						<BreadcrumbLink href="/app/home">DeFaketive</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator class="hidden md:block" />
					<BreadcrumbItem><BreadcrumbPage>{current}</BreadcrumbPage></BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<div class="ml-auto flex items-center gap-1">
				<Button variant="outline" size="sm" class="text-muted-foreground hidden w-56 justify-start gap-2 font-normal md:inline-flex" onclick={() => (ui.commandOpen = true)} aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}>
					<SearchIcon /> Search… <Kbd class="ml-auto">{mac ? '⌘' : 'Ctrl'} K</Kbd>
				</Button>
				<Button variant="ghost" size="icon" class="md:hidden" aria-label="Search pages and products" onclick={() => (ui.commandOpen = true)}><SearchIcon /></Button>
				<ScanPill />
				<ThemeToggle />
			</div>
		</header>
		<div class="page-view flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
			<div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
				{@render children()}
			</div>
		</div>
		<SiteFooter compact />
	</Sidebar.Inset>
</Sidebar.Provider>
{/if}
