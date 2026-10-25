<script lang="ts">
	import type { Snippet } from 'svelte';
	import Highlighted from '#lib/components/app/highlighted.svelte';
	import VerdictBadge from '#lib/components/app/verdict-badge.svelte';
	import { Card } from '#lib/components/ui/card/index.js';
	import { levelChip } from '#lib/agency.js';
	import { accuracyCopy, dateText, groupOfTone, money, segments } from '#lib/product.js';
	import type { AgencyQuote, AgencyReview, AgencySheet } from '#lib/types.js';

	// One listing's evidence sheet: what the saved report says about safety, with every review it counts. Shown alone
	// on the evidence page (with this account's own controls passed in) and one after another in a combined report,
	// where the title is a level lower and the "How to read" box sits once on the cover instead.
	let {
		sheet,
		id,
		kicker = '',
		nested = false,
		reading = true,
		controls,
		quoteActions
	}: {
		sheet: AgencySheet;
		/** Unique on the page: several sheets can share one. */
		id: string;
		/** The small line above the title. */
		kicker?: string;
		/** Inside a combined report: the title is an h2 and the sections h3. */
		nested?: boolean;
		/** The "How to read this sheet" box. */
		reading?: boolean;
		/** This account's status and note (evidence page only; never printed). */
		controls?: Snippet;
		/** Under each quote: "Not a safety problem" (evidence page only; never printed). */
		quoteActions?: Snippet<[AgencyQuote]>;
	} = $props();

	const title = $derived(nested ? 'h2' : 'h1');
	const section = $derived(nested ? 'h3' : 'h2');

	const readLine = (value: AgencySheet) => {
		const read = value.reviews_analyzed.toLocaleString();
		const listed = value.ratings_listed ? ` of this listing's ${value.ratings_listed.toLocaleString()} ratings` : '';
		const quota = value.star_quota ? `, up to ${value.star_quota} from each star level` : '';
		return `${read} written review${value.reviews_analyzed === 1 ? '' : 's'}${quota}${listed}`;
	};
	const reviewDate = (review: AgencyReview) => {
		if (!review.date) return 'No date';
		if (review.date_relative) {
			return review.day
				? `about ${dateText(review.day)} (Lazada showed "${review.date}" when the reviews were collected)`
				: `${review.date}, as Lazada showed it when the reviews were collected`;
		}
		return dateText(review.date) ?? review.date;
	};
	const stars = (rating: number | null) => (rating ? `${rating} star${rating === 1 ? '' : 's'}` : 'Stars not recorded');
	// The full review only when it says more than the sentences quoted from it.
	const saysMore = (review: AgencyReview) =>
		review.text.replace(/\s+/g, ' ').trim().length > review.quotes.map((quote) => quote.text).join(' ').replace(/\s+/g, ' ').trim().length + 3;
</script>

<article class="space-y-6" aria-labelledby="{id}-title">
	<header class="space-y-1">
		{#if kicker}<p class="text-muted-foreground text-sm">{kicker}</p>{/if}
		<svelte:element this={title} id="{id}-title" class={nested ? 'text-xl font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>
			{sheet.name || 'Unnamed listing'}
		</svelte:element>
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
			{#if sheet.variants?.length}
				<!-- Which model to buy for a test: the variants the safety reviews name, most first. -->
				<div class="sm:col-span-2">
					<dt class="text-muted-foreground">Variants named in safety reviews</dt>
					<dd class="mt-1 flex flex-wrap items-center gap-1.5">
						{#each sheet.variants as item (item.variant)}
							<span class="rounded-md border px-2 py-0.5 text-xs break-words">{item.variant} × {item.reviews}</span>
						{/each}
						{#if sheet.variants_more}<span class="text-muted-foreground text-xs">+{sheet.variants_more} more</span>{/if}
					</dd>
				</div>
			{/if}
		</dl>
	</Card>

	{@render controls?.()}

	<section aria-labelledby="{id}-verdict" class="space-y-2" data-print="keep">
		<svelte:element this={section} id="{id}-verdict" class="text-lg font-semibold">What the report says</svelte:element>
		<div class="flex flex-wrap items-center gap-2">
			<VerdictBadge kind={sheet.level === 'reports' ? 'safety' : sheet.level === 'mentions' ? 'caution' : groupOfTone(sheet.tone)} label={sheet.level ? levelChip(sheet.level).label : undefined} />
			<span class="font-medium">{sheet.headline}</span>
		</div>
		{#if sheet.detail}<p class="text-muted-foreground">{sheet.detail}</p>{/if}
		{#if !sheet.checked_with_current}
			<p class="text-muted-foreground text-sm">This report was made with an older version of the check.</p>
		{/if}
	</section>

	<section aria-labelledby="{id}-reviews" class="space-y-3">
		<svelte:element this={section} id="{id}-reviews" class="text-lg font-semibold">
			{sheet.reviews.length
				? `The ${sheet.reviews.length === 1 ? 'review' : `${sheet.reviews.length} reviews`} that mention safety`
				: 'No reviews mention safety'}
		</svelte:element>
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
							{#if quoteActions}<div class="pl-3 text-sm" data-print="hide">{@render quoteActions(quote)}</div>{/if}
						{/each}
						{#if review.text && saysMore(review)}
							<p class="text-muted-foreground text-sm"><span class="text-foreground font-medium">Full review:</span> {review.text}</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	{#if reading}
		<section data-print="keep" aria-labelledby="{id}-reading" class="space-y-2 rounded-lg border p-4 text-sm">
			<svelte:element this={section} id="{id}-reading" class="font-semibold">How to read this sheet</svelte:element>
			<p>{sheet.note}</p>
			<p>{accuracyCopy(sheet.accuracy)}</p>
			<p class="text-muted-foreground">
				DeFaketive is a student capstone project. This sheet is not an official finding of the DTI or of Lazada.
			</p>
			{#if sheet.checker_version}
				<p class="text-muted-foreground text-xs break-all">Checker version: {sheet.checker_version}</p>
			{/if}
		</section>
	{/if}
</article>
