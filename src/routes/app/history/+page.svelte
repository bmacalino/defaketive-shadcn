<script lang="ts">
	import CountUp from '#lib/components/app/count-up.svelte';
	import { page } from '$app/state';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import RowItemSkeleton from '#lib/components/app/row-item-skeleton.svelte';
	import StatsSkeleton from '#lib/components/app/stats-skeleton.svelte';
	import ScansChart from '#lib/components/app/scans-chart.svelte';
	import ProductRowItem from '#lib/components/app/product-row-item.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { ToggleGroup, ToggleGroupItem } from '#lib/components/ui/toggle-group/index.js';
	import { chipFor, dayLabel, GROUP_NAMES, type ChipKind } from '#lib/product.js';
	import { library } from '#lib/stores/library.svelte.js';

	type Filter = 'all' | ChipKind;
	const FILTERS: [Filter, string][] = [
		['all', 'All'],
		['clear', GROUP_NAMES.clear],
		['caution', GROUP_NAMES.caution],
		['safety', GROUP_NAMES.safety],
		['unknown', GROUP_NAMES.unknown]
	];

	// Home links here with ?filter=safety or ?filter=caution.
	const requested = page.url.searchParams.get('filter');
	let filter = $state<Filter>(FILTERS.some(([value]) => value === requested) ? (requested as Filter) : 'all');

	// Pressing the chip that is already on switches it off; fall back to "All" instead.
	$effect(() => {
		if (!filter) filter = 'all';
	});

	const products = $derived(library.history);
	const kinds = $derived(products.map((p) => chipFor(p).kind));
	const count = (kind: ChipKind) => kinds.filter((k) => k === kind).length;
	const stats = $derived([
		// Not "scans": a report you only opened is counted here too.
		{ value: products.length, label: 'Products checked', tone: '' },
		{ value: count('clear'), label: GROUP_NAMES.clear, tone: 'clear' },
		{ value: count('caution'), label: GROUP_NAMES.caution, tone: 'caution' },
		{ value: count('safety'), label: GROUP_NAMES.safety, tone: 'safety' }
	]);
	const shown = $derived(products.filter((_, index) => filter === 'all' || kinds[index] === filter));

	// Group the scans by the day they were checked.
	const days = $derived.by(() => {
		const groups = new Map<string, typeof shown>();
		for (const product of shown) {
			const label = dayLabel(library.timeOf(product));
			groups.set(label, [...(groups.get(label) ?? []), product]);
		}
		return [...groups];
	});
</script>

<svelte:head><title>History · DeFaketive</title></svelte:head>

<header class="space-y-1">
	<h1 class="text-3xl font-semibold tracking-tight">History</h1>
	<p class="text-muted-foreground">Products you scanned or opened, grouped by date. Only you see this list.</p>
</header>

{#if !library.ready}
	<StatsSkeleton />
	<Card class="gap-0 divide-y py-0" role="status" aria-label="Loading your history">
		{#each [1, 2, 3] as n (n)}<RowItemSkeleton />{/each}
	</Card>
{:else if library.error}
	<!-- A failed load must not look like an empty history. -->
	<EmptyState art="error" title="Your history couldn't be loaded" description="Nothing was lost. It is still saved in your account.">
		{#snippet actions()}<Button onclick={() => library.retry()}>Try again</Button>{/snippet}
	</EmptyState>
{:else}
	<dl class="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Your scan history in numbers">
		{#each stats as stat, index (stat.label)}
			<Card class="reveal gap-1 p-4" style="--i:{index}">
				<dd class="text-3xl font-semibold tabular-nums"><CountUp value={stat.value} /></dd>
				<dt class="text-muted-foreground flex items-center gap-2 text-sm">
					{#if stat.tone}<i class="tone-{stat.tone} size-2.5 rounded-full bg-(--tone)" aria-hidden="true"></i>{/if}{stat.label}
				</dt>
			</Card>
		{/each}
	</dl>

	<ScansChart />

	<div class="flex flex-wrap items-center gap-3">
		<span class="text-muted-foreground text-sm" aria-hidden="true">Filter:</span>
		<ToggleGroup type="single" variant="outline" bind:value={filter} aria-label="Filter scans" class="flex-wrap">
			{#each FILTERS as [value, label] (value)}
				<ToggleGroupItem {value} aria-label={label}>{label}</ToggleGroupItem>
			{/each}
		</ToggleGroup>
		<span class="text-muted-foreground ml-auto text-sm" aria-live="polite">{shown.length} result{shown.length === 1 ? '' : 's'}</span>
	</div>

	{#if !shown.length}
		{#if products.length}
			<EmptyState art="history" title="No scans match this filter" description="Nothing in your history has this verdict.">
				{#snippet actions()}<Button variant="outline" onclick={() => (filter = 'all')}>Show all scans</Button>{/snippet}
			</EmptyState>
		{:else}
			<EmptyState art="history" title="No scans yet" description="Check a product and it will be listed here, grouped by date.">
				{#snippet actions()}<Button href="/app/analyze">Check a product</Button>{/snippet}
			</EmptyState>
		{/if}
	{:else}
		<div class="space-y-6">
			{#each days as [label, items] (label)}
				<section aria-labelledby="day-{label}" class="reveal space-y-2">
					<header class="flex items-baseline justify-between">
						<h2 id="day-{label}" class="font-semibold">{label}</h2>
						<span class="text-muted-foreground text-sm">{items.length} product{items.length === 1 ? '' : 's'}</span>
					</header>
					<Card class="gap-0 divide-y py-0">
						{#each items as product (product.link)}
							<ProductRowItem {product} />
						{/each}
					</Card>
				</section>
			{/each}
		</div>
		<p class="text-muted-foreground text-xs">Showing {shown.length} of {products.length} product{products.length === 1 ? '' : 's'} · Your 100 most recent are kept</p>
	{/if}
{/if}
