<script lang="ts">
	import { counts, money, platformName, reviewCount, segments, view } from '#lib/product.js';
	import type { Badge, Product } from '#lib/types.js';
	import Highlighted from './highlighted.svelte';
	import ReportChips from './report-chips.svelte';
	import Stars from './stars.svelte';
	import VerdictBadge from './verdict-badge.svelte';

	// The pop-up shown when you rest the mouse on a product: the verdict, the counts and the strongest quote.
	// Everything here comes from the list card, so it appears at once. The full report has the rest.
	let { product }: { product: Product } = $props();

	const verdict = $derived(view(product));
	const found = $derived(counts(product));

	// Safety first, then whichever label has the most reports.
	const lead = $derived.by((): Badge | undefined => {
		const withQuote = (verdict.badges ?? []).filter((b) => b.mentions > 0 && b.evidence?.length);
		return (
			withQuote.find((b) => b.category === 'safety') ??
			withQuote.sort((a, b) => b.mentions - a.mentions)[0]
		);
	});
	const quote = $derived(lead?.evidence?.[0]);
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap items-center gap-2">
		<VerdictBadge {product} />
		<span class="text-muted-foreground text-xs">{platformName(product)} · {money(product.price)}</span>
	</div>
	<p class="leading-snug font-semibold">{verdict.headline}</p>
	<ReportChips {product} />
	{#if quote}
		<blockquote class="bg-muted/60 grid gap-1 rounded-md p-2.5 text-sm">
			<p class="line-clamp-4"><Highlighted pieces={segments(quote.text, quote.highlights)} /></p>
			<small class="text-muted-foreground text-xs">
				{[lead?.label, quote.rating ? `${Number(quote.rating).toFixed(0)}-star review` : ''].filter(Boolean).join(' · ')}
			</small>
		</blockquote>
	{:else if verdict.available && !found.safety && !found.defect && !found.counterfeit}
		<p class="text-muted-foreground text-sm">No review was flagged. This is not proof that a product is safe.</p>
	{:else if !verdict.available}
		<p class="text-muted-foreground text-sm">{verdict.detail}</p>
	{/if}
	<div class="text-muted-foreground flex items-center justify-between gap-2 text-xs">
		<span>{reviewCount(product).toLocaleString()} reviews analyzed</span>
		<Stars value={product.rating} showNumber={false} />
	</div>
	<p class="text-muted-foreground border-t pt-2 text-xs">Open the report to read every review.</p>
</div>
