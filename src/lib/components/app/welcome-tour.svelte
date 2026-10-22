<script lang="ts">
	import { goto } from '$app/navigation';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import LinkIcon from '@lucide/svelte/icons/link';
	import MessageSquareQuoteIcon from '@lucide/svelte/icons/message-square-quote';
	import PackageSearchIcon from '@lucide/svelte/icons/package-search';
	import PuzzleIcon from '@lucide/svelte/icons/puzzle';
	import ScanSearchIcon from '@lucide/svelte/icons/scan-search';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#lib/components/ui/dialog/index.js';
	import { firstName, LAZADA_REVIEWS_PER_STAR, typicalScanTime, VERDICT_GROUPS } from '#lib/product.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { library } from '#lib/stores/library.svelte.js';
	import { ui } from '#lib/stores/ui.svelte.js';
	import { cn } from '#lib/utils.js';
	import VerdictBadge from './verdict-badge.svelte';

	// Four short pages for someone who just made an account: what DeFaketive does, how to check a product, what the
	// four labels mean, and where things are kept. It opens once by itself (auth-dialog.svelte, after a sign-up);
	// Settings and Ctrl+K open it again. Every page can be skipped.
	const pages = ['welcome', 'check', 'labels', 'library'] as const;
	const titles: Record<(typeof pages)[number], string> = {
		welcome: 'Welcome to DeFaketive',
		check: 'Check a product',
		labels: 'Read the result',
		library: 'Keep track of what you check'
	};
	let step = $state(0);
	const current = $derived(pages[step]);
	const last = $derived(step === pages.length - 1);
	const name = $derived(firstName(auth.user?.name));

	// Each opening starts at the first page.
	$effect(() => {
		if (ui.tourOpen) step = 0;
	});

	function close() {
		ui.tourOpen = false;
	}
	function finish(href?: string) {
		close();
		if (href) goto(href);
	}
</script>

<Dialog bind:open={ui.tourOpen}>
	<DialogContent class="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg" data-tour>
		<DialogHeader>
			<DialogDescription class="text-xs font-medium">Step {step + 1} of {pages.length}</DialogDescription>
			<DialogTitle class="text-xl">
				{current === 'welcome' && name ? `${titles.welcome}, ${name}` : titles[current]}
			</DialogTitle>
		</DialogHeader>

		{#key step}
			<div class="animate-in fade-in-0 slide-in-from-right-2 grid gap-4 text-sm duration-200">
				{#if current === 'welcome'}
					<p class="text-base">
						DeFaketive reads the reviews of a Lazada PH product and shows you what buyers report about fakes, defects and
						safety problems, in their own words.
					</p>
					<ul class="grid gap-3">
						<li class="flex items-start gap-3">
							<span class="bg-muted grid size-8 shrink-0 place-items-center rounded-full" aria-hidden="true"><LinkIcon class="size-4" /></span>
							<span><b class="font-medium">You paste a product link.</b> <span class="text-muted-foreground">Nothing to install.</span></span>
						</li>
						<li class="flex items-start gap-3">
							<span class="bg-muted grid size-8 shrink-0 place-items-center rounded-full" aria-hidden="true"><TriangleAlertIcon class="size-4" /></span>
							<span><b class="font-medium">We look for reports of problems.</b> <span class="text-muted-foreground">In English, Filipino and Taglish.</span></span>
						</li>
						<li class="flex items-start gap-3">
							<span class="bg-muted grid size-8 shrink-0 place-items-center rounded-full" aria-hidden="true"><MessageSquareQuoteIcon class="size-4" /></span>
							<span><b class="font-medium">You read the result and the reviews behind it.</b> <span class="text-muted-foreground">No score.</span></span>
						</li>
					</ul>
					<p class="text-muted-foreground">Three more short pages show you around. You can skip them.</p>
				{:else if current === 'check'}
					<p class="text-base">Copy the address of a Lazada PH product page and paste it into <b class="font-medium">Check a product</b>, or the box on Home.</p>
					<!-- A picture of the box, not a working one. -->
					<div class="bg-muted/50 flex items-center gap-2 rounded-lg border p-3" aria-hidden="true">
						<span class="bg-background text-muted-foreground flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border px-3">
							<LinkIcon class="size-4 shrink-0" /><span class="truncate">https://www.lazada.com.ph/products/…</span>
						</span>
						<span class="bg-primary text-primary-foreground flex h-9 items-center gap-1 rounded-md px-3 font-medium">Check <ArrowRightIcon class="size-4" /></span>
					</div>
					<ul class="text-muted-foreground grid list-disc gap-1.5 pl-5">
						<li>We read up to {LAZADA_REVIEWS_PER_STAR} reviews from each star level. A check usually takes {typicalScanTime('lazada')}.</li>
						<li>You can keep browsing while it runs. The top of the page shows how it is going.</li>
						<li>A product someone already checked opens at once.</li>
					</ul>
				{:else if current === 'labels'}
					<p class="text-base">Every report starts with one of four labels. The reviews behind it are right underneath.</p>
					<ul class="grid gap-2.5">
						{#each VERDICT_GROUPS as group (group.kind)}
							<li class="grid gap-1 rounded-lg border p-3">
								<VerdictBadge kind={group.kind} class="w-fit" />
								<span class="text-muted-foreground">{group.meaning}</span>
							</li>
						{/each}
					</ul>
					<p class="text-muted-foreground">Review signals are a guide, not proof. Read the reviews and judge for yourself.</p>
				{:else}
					<ul class="grid gap-3">
						<li class="flex items-start gap-3">
							<span class="bg-muted grid size-8 shrink-0 place-items-center rounded-full" aria-hidden="true"><HistoryIcon class="size-4" /></span>
							<span><b class="font-medium">History</b> <span class="text-muted-foreground">keeps every product you check or open, in your account.</span></span>
						</li>
						<li class="flex items-start gap-3">
							<span class="bg-muted grid size-8 shrink-0 place-items-center rounded-full" aria-hidden="true"><HeartIcon class="size-4" /></span>
							<span><b class="font-medium">Wishlist</b> <span class="text-muted-foreground">holds the products you save with the heart.</span></span>
						</li>
						<li class="flex items-start gap-3">
							<span class="bg-muted grid size-8 shrink-0 place-items-center rounded-full" aria-hidden="true"><PackageSearchIcon class="size-4" /></span>
							<span><b class="font-medium">Products</b> <span class="text-muted-foreground">lists every product anyone has checked. Search it by name.</span></span>
						</li>
					</ul>
					<div class="flex items-start gap-3 rounded-lg border p-3">
						<PuzzleIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<p>
							<b class="font-medium">Shopping on a computer?</b>
							<span class="text-muted-foreground">The extension adds a Check with DeFaketive button to Lazada pages.</span>
							<button type="button" class="tap text-primary font-medium underline underline-offset-4" onclick={() => finish('/app/extension')}>Get the extension</button>
						</p>
					</div>
				{/if}
			</div>
		{/key}

		<DialogFooter class="flex-row flex-wrap items-center gap-2 sm:justify-between">
			<!-- Where you are, for the eye. The heading above says it in words. -->
			<div class="flex gap-1.5" aria-hidden="true">
				{#each pages as page, index (page)}
					<span class={cn('h-1.5 rounded-full transition-all', index === step ? 'bg-primary w-5' : 'bg-muted-foreground/30 w-1.5')}></span>
				{/each}
			</div>
			<div class="ml-auto flex flex-wrap gap-2">
				{#if step > 0}
					<Button variant="ghost" onclick={() => (step -= 1)}><ArrowLeftIcon /> Back</Button>
				{:else}
					<Button variant="ghost" onclick={close}>Skip</Button>
				{/if}
				{#if last}
					<Button onclick={() => finish('/app/analyze')}><ScanSearchIcon /> {library.history.length ? 'Check a product' : 'Check my first product'}</Button>
				{:else}
					<Button onclick={() => (step += 1)}>Next <ArrowRightIcon /></Button>
				{/if}
			</div>
		</DialogFooter>
	</DialogContent>
</Dialog>
