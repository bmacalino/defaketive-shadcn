<script lang="ts">
	import { goto } from '$app/navigation';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FlagOffIcon from '@lucide/svelte/icons/flag-off';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import MessageSquareQuoteIcon from '@lucide/svelte/icons/message-square-quote';
	import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import StoreIcon from '@lucide/svelte/icons/store';
	import type { Component } from 'svelte';
	import VerdictBadge from '#lib/components/app/verdict-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#lib/components/ui/dialog/index.js';
	import { firstName } from '#lib/product.js';
	import { agency } from '#lib/stores/agency.svelte.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { cn } from '#lib/utils.js';

	// "Get started" for a partner agency's account, which the team makes on the server, so it never sees the welcome
	// tour a sign-up opens. Five short pages: what the view is, your own password, the watch list, evidence sheets,
	// the Overview and Sellers. It opens by itself until the account closes it once (the app layout decides); the DTI
	// view, Settings and Ctrl+K open it again. Every page can be skipped.
	const pages = ['welcome', 'password', 'watch', 'sheet', 'more'] as const;
	const titles = $derived<Record<(typeof pages)[number], string>>({
		welcome: `Welcome to the ${agency.title}`,
		password: 'Set your own password',
		watch: 'The watch list',
		sheet: 'Evidence sheets',
		more: 'Overview and Sellers'
	});
	let step = $state(0);
	const current = $derived(pages[step]);
	const last = $derived(step === pages.length - 1);
	const name = $derived(firstName(auth.user?.name));
	const office = $derived(agency.officeName || 'partner agency');

	// Each opening starts at the first page.
	$effect(() => {
		if (agency.guideOpen) step = 0;
	});

	function finish(href?: string) {
		agency.closeGuide();
		if (href) goto(href);
	}
</script>

{#snippet point(Icon: Component, title: string, text: string)}
	<li class="flex items-start gap-3">
		<span class="bg-muted grid size-8 shrink-0 place-items-center rounded-full" aria-hidden="true"><Icon class="size-4" /></span>
		<span><b class="font-medium">{title}</b> <span class="text-muted-foreground">{text}</span></span>
	</li>
{/snippet}

<Dialog open={agency.guideOpen} onOpenChange={(open) => !open && agency.closeGuide()}>
	<DialogContent class="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg" data-agency-guide>
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
						Lazada listings whose buyers report safety problems, arranged for the {office}. DeFaketive reads the reviews
						and finds what buyers say about fire, smoke, shocks and burns.
					</p>
					<ul class="grid gap-3">
						{@render point(MessageSquareQuoteIcon, 'Leads to look into, not findings.', "A buyer's review is not proof, and the check misses some reports and flags some harmless ones.")}
						{@render point(FileTextIcon, 'Every review behind each listing.', "In the buyers' own words, without their names.")}
						{@render point(PrinterIcon, 'Any listing prints or saves as a PDF.', 'Ready for your own investigation.')}
					</ul>
					<p class="text-muted-foreground">Four more short pages show you around. You can skip them.</p>
				{:else if current === 'password'}
					<p class="text-base">
						The DeFaketive team made this account and gave you a password. Set one that only you know before you go on.
					</p>
					<div class="flex items-start gap-3 rounded-lg border p-3">
						<KeyRoundIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<p class="text-muted-foreground">
							In <b class="text-foreground font-medium">Settings</b>, choose <b class="text-foreground font-medium">Edit</b>,
							type a new password, and confirm it with the one you were given.
						</p>
					</div>
					<Button variant="outline" class="w-fit" onclick={() => finish('/app/settings?edit=1')}><KeyRoundIcon /> Change my password</Button>
				{:else if current === 'watch'}
					<p class="text-base">The listings to look at, newest report first, at two levels:</p>
					<ul class="grid gap-2.5">
						<li class="grid gap-1 rounded-lg border p-3">
							<VerdictBadge kind="safety" class="w-fit" />
							<span class="text-muted-foreground">The check's most serious level: buyers report fire, smoke, shocks or burns, more than once or very clearly.</span>
						</li>
						<li class="grid gap-1 rounded-lg border p-3">
							<VerdictBadge kind="caution" label="Safety mentions" class="w-fit" />
							<span class="text-muted-foreground">Safety mentions below that level. Worth a look, with more care.</span>
						</li>
					</ul>
					<ul class="grid gap-3">
						{@render point(SparklesIcon, 'New', 'marks a listing you have not opened yet. The menu shows how many.')}
						{@render point(NotebookPenIcon, 'Case status and note', 'keep track of each listing: Not reviewed, Under review or Closed, no action. Only you see them.')}
						{@render point(DownloadIcon, 'Download spreadsheet', 'gives the list as a file for Excel, with your statuses and notes.')}
					</ul>
				{:else if current === 'sheet'}
					<p class="text-base">
						Open a listing's <b class="font-medium">Evidence sheet</b> to see every review the report counts, newest first:
						stars, date, the words the check matched, and the full review.
					</p>
					<ul class="grid gap-3">
						{@render point(PrinterIcon, 'Print or save as PDF.', 'The menu, the buttons and your notes are left out.')}
						{@render point(FlagOffIcon, 'Not a safety problem?', 'Tell us when the check got a sentence wrong. The report stays as it is; we use it to improve the check.')}
						{@render point(EyeOffIcon, 'No names.', "Reviewers' names never leave our server.")}
					</ul>
				{:else}
					<ul class="grid gap-3">
						{@render point(ChartColumnIcon, 'Overview', 'shows listings by kind of product and by price, the kinds of hazard, and when buyers reported. Each chart says what it does not show.')}
						{@render point(StoreIcon, 'Sellers', 'lists sellers with two or more flagged listings. Names are as Lazada shows them, not checked identities.')}
						{@render point(ListChecksIcon, 'Only what DeFaketive checked.', 'The numbers cover the Lazada listings in our database, not all of Lazada.')}
					</ul>
					<p class="text-muted-foreground">
						You can open this guide again from the {agency.title}, from Settings, or with Ctrl+K.
					</p>
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
					<Button variant="ghost" onclick={() => finish()}>Skip</Button>
				{/if}
				{#if last}
					<Button onclick={() => finish('/app/agency')}><ListChecksIcon /> Open the watch list</Button>
				{:else}
					<Button onclick={() => (step += 1)}>Next <ArrowRightIcon /></Button>
				{/if}
			</div>
		</DialogFooter>
	</DialogContent>
</Dialog>
