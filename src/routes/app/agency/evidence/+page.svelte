<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import FlagOffIcon from '@lucide/svelte/icons/flag-off';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { onMount, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import AgencyCaseControls from '#lib/components/agency/agency-case.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import Highlighted from '#lib/components/app/highlighted.svelte';
	import ReportSkeleton from '#lib/components/app/report-skeleton.svelte';
	import VerdictBadge from '#lib/components/app/verdict-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
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
	import { api, ApiError, json } from '#lib/api.js';
	import { reportHref } from '#lib/nav.js';
	import { accuracyCopy, dateText, groupOfTone, money, segments } from '#lib/product.js';
	import { agency, AGENCY_REFUSED } from '#lib/stores/agency.svelte.js';
	import type { AgencyReview, AgencySheet } from '#lib/types.js';

	// One listing's evidence sheet for a partner agency: what the saved report says about safety, with every review
	// it counts, made to be printed or saved as a PDF. The server builds it (agency_api.evidence_sheet) and leaves
	// out who wrote each review. Opening it marks the listing as seen for this account.
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

	// Paper is white: print in the light theme, then put the person's theme back.
	onMount(() => {
		const root = document.documentElement;
		let dark = false;
		let scheme = '';
		const before = () => {
			dark = root.classList.contains('dark');
			scheme = root.style.colorScheme;
			root.classList.remove('dark');
			root.style.colorScheme = 'light';
		};
		const after = () => {
			if (dark) root.classList.add('dark');
			root.style.colorScheme = scheme;
			dark = false;
		};
		addEventListener('beforeprint', before);
		addEventListener('afterprint', after);
		return () => {
			removeEventListener('beforeprint', before);
			removeEventListener('afterprint', after);
		};
	});

	const readLine = (value: AgencySheet) => {
		const read = value.reviews_analyzed.toLocaleString();
		const listed = value.ratings_listed ? ` of this listing's ${value.ratings_listed.toLocaleString()} ratings` : '';
		const quota = value.star_quota ? `, up to ${value.star_quota} from each star level` : '';
		return `${read} written review${value.reviews_analyzed === 1 ? '' : 's'}${quota}${listed}`;
	};
	const reviewDate = (review: AgencyReview) => {
		if (!review.date) return 'No date';
		if (review.date_relative) return `${review.date}, as Lazada showed it when the reviews were collected`;
		return dateText(review.date) ?? review.date;
	};
	const stars = (rating: number | null) => (rating ? `${rating} star${rating === 1 ? '' : 's'}` : 'Stars not recorded');

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
	// The full review only when it says more than the sentences quoted from it.
	const saysMore = (review: AgencyReview) =>
		review.text.replace(/\s+/g, ' ').trim().length > review.quotes.map((quote) => quote.text).join(' ').replace(/\s+/g, ' ').trim().length + 3;
</script>

<svelte:head><title>Evidence sheet{sheet ? ` · ${sheet.name}` : ''} · DeFaketive</title></svelte:head>

<div data-print="hide" class="flex flex-wrap items-center gap-2">
	<Button variant="ghost" href="/app/agency" class="-ml-2"><ArrowLeftIcon /> Back to {agency.title}</Button>
	{#if status === 'ready' && sheet}
		<div class="ml-auto flex flex-wrap gap-2">
			<Button variant="outline" href={reportHref(sheet.link)}>Open report</Button>
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
	<article class="space-y-6" aria-labelledby="sheet-title">
		<header class="space-y-1">
			<p class="text-muted-foreground text-sm">
				DeFaketive evidence sheet · prepared for the {agency.officeName || 'partner agency'} · {madeOn}
			</p>
			<h1 id="sheet-title" class="text-2xl font-semibold tracking-tight">{sheet.name || 'Unnamed listing'}</h1>
		</header>

		<Card class="p-4" data-print="keep">
			<dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
				<div class="sm:col-span-2">
					<dt class="text-muted-foreground">Listing</dt>
					<dd class="break-all"><a class="underline underline-offset-4" href={sheet.link} target="_blank" rel="noopener noreferrer">{sheet.link}</a></dd>
				</div>
				<div><dt class="text-muted-foreground">Seller, as listed</dt><dd>{sheet.seller || 'Not listed'}</dd></div>
				<div><dt class="text-muted-foreground">Price when checked</dt><dd>{money(sheet.price)}</dd></div>
				<div><dt class="text-muted-foreground">Kind of product</dt><dd>{sheet.kind}</dd></div>
				<div><dt class="text-muted-foreground">Report date</dt><dd>{dateText(sheet.checked_at) ?? 'Unknown'}</dd></div>
				<div class="sm:col-span-2"><dt class="text-muted-foreground">Reviews read</dt><dd>{readLine(sheet)}</dd></div>
			</dl>
		</Card>

		<section aria-labelledby="case-title" class="space-y-2" data-print="hide">
			<h2 id="case-title" class="text-sm font-medium">Your status and note <span class="text-muted-foreground font-normal">· only you see these, and they are not printed</span></h2>
			<AgencyCaseControls link={sheet.link} name={sheet.name} value={sheet.case} id="sheet" />
		</section>

		<section aria-labelledby="verdict-title" class="space-y-2" data-print="keep">
			<h2 id="verdict-title" class="text-lg font-semibold">What the report says</h2>
			<div class="flex flex-wrap items-center gap-2">
				<VerdictBadge kind={sheet.level === 'reports' ? 'safety' : sheet.level === 'mentions' ? 'caution' : groupOfTone(sheet.tone)} />
				<span class="font-medium">{sheet.headline}</span>
			</div>
			{#if sheet.detail}<p class="text-muted-foreground">{sheet.detail}</p>{/if}
			{#if !sheet.checked_with_current}
				<p class="text-muted-foreground text-sm">This report was made with an older version of the check.</p>
			{/if}
		</section>

		<section aria-labelledby="reviews-title" class="space-y-3">
			<h2 id="reviews-title" class="text-lg font-semibold">
				{sheet.reviews.length
					? `The ${sheet.reviews.length === 1 ? 'review' : `${sheet.reviews.length} reviews`} that mention safety`
					: 'No reviews mention safety'}
			</h2>
			{#if sheet.reviews.length}
				<p class="text-muted-foreground text-sm">
					{sheet.summary}. Newest first. Highlighted words are the ones the check matched. Reviewers' names are left out.
				</p>
				<ol class="space-y-3">
					{#each sheet.reviews as review, index (index)}
						<li data-print="keep" class="space-y-2 rounded-lg border p-3">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
								<span class="font-medium">Review {index + 1}</span>
								<span>{stars(review.rating)}</span>
								<span class="text-muted-foreground">{reviewDate(review)}</span>
								{#if review.variation}<span class="text-muted-foreground">{review.variation}</span>{/if}
							</div>
							{#each review.quotes as quote, place (place)}
								<blockquote class="border-l-2 pl-3">
									“<Highlighted pieces={segments(quote.text, quote.highlights)} />”{#if quote.hazard}<span class="text-muted-foreground text-sm">&nbsp;· {quote.hazard}</span>{/if}
								</blockquote>
								<div class="pl-3 text-sm" data-print="hide">
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
								</div>
							{/each}
							{#if review.text && saysMore(review)}
								<p class="text-muted-foreground text-sm"><span class="text-foreground font-medium">Full review:</span> {review.text}</p>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<section data-print="keep" aria-labelledby="reading-title" class="space-y-2 rounded-lg border p-4 text-sm">
			<h2 id="reading-title" class="font-semibold">How to read this sheet</h2>
			<p>{sheet.note}</p>
			<p>{accuracyCopy(sheet.accuracy)}</p>
			<p class="text-muted-foreground">
				DeFaketive is a student capstone project. This sheet is not an official finding of the DTI or of Lazada.
			</p>
			{#if sheet.checker_version}
				<p class="text-muted-foreground text-xs break-all">Checker version: {sheet.checker_version}</p>
			{/if}
		</section>
	</article>
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
