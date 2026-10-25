<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import FlagOffIcon from '@lucide/svelte/icons/flag-off';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { onMount, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import AgencyCaseControls from '#lib/components/agency/agency-case.svelte';
	import AgencySheetView from '#lib/components/agency/agency-sheet.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ReportSkeleton from '#lib/components/app/report-skeleton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { printInLightTheme } from '#lib/agency.js';
	import { api, ApiError, json } from '#lib/api.js';
	import { agencyReportHref } from '#lib/nav.js';
	import { dateText } from '#lib/product.js';
	import { agency, AGENCY_REFUSED } from '#lib/stores/agency.svelte.js';
	import type { AgencySheet } from '#lib/types.js';

	// One listing's evidence sheet for a partner agency (the sheet itself is agency-sheet.svelte), with this account's
	// status, note and "Not a safety problem" marks, none of which print. Opening it marks the listing as seen.
	const link = $derived(page.url.searchParams.get('link') ?? '');
	let sheet = $state<AgencySheet | null>(null);
	let status = $state<'loading' | 'ready' | 'refused' | 'missing' | 'error'>('loading');
	const madeOn = dateText(new Date().toISOString());

	async function load(wanted: string) {
		status = 'loading';
		if (!wanted) {
			status = 'missing';
			return;
		}
		try {
			sheet = (await api<{ sheet: AgencySheet }>(`/api/agency/evidence?link=${encodeURIComponent(wanted)}`)).sheet;
			status = 'ready';
			agency.refreshCount();
		} catch (error) {
			if (error instanceof ApiError && (error.status === 401 || error.status === 403)) status = 'refused';
			else if (error instanceof ApiError && error.status === 404) status = 'missing';
			else status = 'error';
		}
	}
	$effect(() => {
		const wanted = link;
		untrack(() => load(wanted));
	});

	onMount(printInLightTheme);

	// "Not a safety problem": this account's word that a quote was flagged by mistake (song lyrics with "burned" in
	// them, say). It goes to the team for the next checker round; the report and its counts do not change.
	const MAX_REASON = 500;
	let marking = $state<string | null>(null);
	let reason = $state('');
	let sending = $state(false);
	function setMarked(sentence: string, marked: boolean) {
		for (const review of sheet?.reviews ?? []) {
			for (const quote of review.quotes) if (quote.text === sentence) quote.marked_not_safety = marked;
		}
	}
	function askWhy(sentence: string) {
		reason = '';
		marking = sentence;
	}
	async function markNotSafety(event: SubmitEvent) {
		event.preventDefault();
		if (!sheet || marking === null) return;
		sending = true;
		try {
			await api('/api/agency/feedback', json('POST', { link: sheet.link, sentence: marking, reason }));
			setMarked(marking, true);
			marking = null;
			toast('Sent to the DeFaketive team. The report stays as it is.');
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			sending = false;
		}
	}
	async function undo(sentence: string) {
		if (!sheet) return;
		try {
			await api('/api/agency/feedback', json('DELETE', { link: sheet.link, sentence }));
			setMarked(sentence, false);
			toast('Taken back.');
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

<svelte:head><title>Evidence sheet{sheet ? ` · ${sheet.name}` : ''} · DeFaketive</title></svelte:head>

<div data-print="hide" class="flex flex-wrap items-center gap-2">
	<Button variant="ghost" href="/app/agency" class="-ml-2"><ArrowLeftIcon /> Back to {agency.title}</Button>
	{#if status === 'ready' && sheet}
		<div class="ml-auto flex flex-wrap gap-2">
			<Button variant="outline" href={agencyReportHref(sheet.link)}>Open report</Button>
			<Button onclick={() => print()}><PrinterIcon /> Print or save as PDF</Button>
		</div>
	{/if}
</div>

{#if status === 'loading'}
	<ReportSkeleton />
{:else if status === 'refused'}
	<EmptyState art="search" title="This page is for partner agencies" description={AGENCY_REFUSED}>
		{#snippet actions()}<Button href="/app/home">Go to Home</Button>{/snippet}
	</EmptyState>
{:else if status === 'missing'}
	<EmptyState art="search" title="No evidence sheet for this listing" description="There is no saved Lazada report for this link.">
		{#snippet actions()}<Button href="/app/agency">Back to the watch list</Button>{/snippet}
	</EmptyState>
{:else if status === 'error' || !sheet}
	<EmptyState art="error" title="The evidence sheet couldn't be loaded" description="The server didn't answer. Nothing was changed.">
		{#snippet actions()}<Button onclick={() => load(link)}>Try again</Button>{/snippet}
	</EmptyState>
{:else}
	{@const current = sheet}
	<AgencySheetView sheet={current} id="sheet" kicker="DeFaketive evidence sheet · prepared for the {agency.officeName || 'partner agency'} · {madeOn}">
		{#snippet controls()}
			<section aria-labelledby="case-title" class="space-y-2" data-print="hide">
				<h2 id="case-title" class="text-sm font-medium">Case status and note <span class="text-muted-foreground font-normal">· only you see these, and they are not printed</span></h2>
				<AgencyCaseControls link={current.link} name={current.name} value={current.case} id="sheet" />
			</section>
		{/snippet}
		{#snippet quoteActions(quote)}
			{#if quote.marked_not_safety}
				<p class="text-muted-foreground flex flex-wrap items-center gap-x-2">
					<FlagOffIcon class="size-3.5" aria-hidden="true" /> You marked this as not a safety problem.
					<button type="button" class="tap underline underline-offset-4 hover:text-foreground" onclick={() => undo(quote.text)}>Undo</button>
				</p>
			{:else}
				<Button variant="ghost" size="sm" class="text-muted-foreground -ml-2 h-7" onclick={() => askWhy(quote.text)}>
					<FlagOffIcon /> Not a safety problem
				</Button>
			{/if}
		{/snippet}
	</AgencySheetView>
{/if}

<Dialog open={marking !== null} onOpenChange={(open) => !open && (marking = null)}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Not a safety problem?</DialogTitle>
			<DialogDescription>
				This tells the DeFaketive team the check got this sentence wrong, for the next time it is improved. The report
				and its counts stay as they are.
			</DialogDescription>
		</DialogHeader>
		<form class="grid gap-3" onsubmit={markNotSafety}>
			{#if marking}<blockquote class="text-muted-foreground border-l-2 pl-3 text-sm">“{marking}”</blockquote>{/if}
			<label class="text-sm font-medium" for="not-safety-reason">Why? <span class="text-muted-foreground font-normal">(optional)</span></label>
			<Textarea id="not-safety-reason" rows={3} maxlength={MAX_REASON} bind:value={reason} placeholder="For example: these are song lyrics, not a burn" />
			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (marking = null)}>Cancel</Button>
				<Button type="submit" disabled={sending}>{#if sending}<Spinner />{/if}Send to the team</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
