<script lang="ts">
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ProductCardSkeleton from '#lib/components/app/product-card-skeleton.svelte';
	import ProductGrid from '#lib/components/app/product-grid.svelte';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '#lib/components/ui/sheet/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { byConcern, GROUP_NAMES, matchesConcern, platformName, reviewCount, type ConcernFilter } from '#lib/product.js';
	import { catalog } from '#lib/stores/catalog.svelte.js';

	let platform = $state('all');
	let concern = $state<ConcernFilter>('all');
	let sort = $state<'fewest' | 'most' | 'reviews'>('fewest');

	const platforms = [
		['all', 'All marketplaces'],
		['Shopee PH', 'Shopee PH'],
		['Lazada PH', 'Lazada PH'],
		['Temu PH', 'Temu PH']
	];
	// The same four group names as everywhere else, plus both warning groups together.
	const concerns: [ConcernFilter, string][] = [
		['all', 'All products'],
		['attention', `${GROUP_NAMES.caution} or ${GROUP_NAMES.safety.toLowerCase()}`],
		['safety', GROUP_NAMES.safety],
		['caution', GROUP_NAMES.caution],
		['clear', GROUP_NAMES.clear],
		['unknown', GROUP_NAMES.unknown]
	];
	const sorts: [typeof sort, string][] = [
		['fewest', 'Fewest reported problems'],
		['most', 'Most reported problems'],
		['reviews', 'Most reviews analyzed']
	];

	// A search shows its own matches; otherwise this is the whole catalog.
	const searching = $derived(catalog.results.length > 0);
	const source = $derived(searching ? catalog.results : catalog.browse);
	const filtered = $derived(
		source
			.filter((p) => (platform === 'all' || platformName(p) === platform) && matchesConcern(p, concern))
			.sort((a, b) =>
				sort === 'reviews' ? reviewCount(b) - reviewCount(a) : sort === 'most' ? byConcern(a, b) : byConcern(b, a)
			)
	);
	const filtering = $derived(platform !== 'all' || concern !== 'all');
	const activeFilters = $derived((platform !== 'all' ? 1 : 0) + (concern !== 'all' ? 1 : 0) + (sort !== 'fewest' ? 1 : 0));
	let filtersOpen = $state(false);
	const label = (list: string[][] | [string, string][], value: string) => list.find(([v]) => v === value)?.[1] ?? '';

	function clearFilters() {
		platform = 'all';
		concern = 'all';
	}
</script>

<svelte:head><title>Products · DeFaketive</title></svelte:head>

<header class="space-y-1">
	<h1 class="text-3xl font-semibold tracking-tight">Products</h1>
	<p class="text-muted-foreground">
		Every product anyone has checked with DeFaketive. Products with the fewest reported problems appear first.
	</p>
</header>

{#snippet filterControls(suffix: string)}
	<div class="grid gap-1.5">
		<Label for="filter-platform{suffix}">Marketplace</Label>
		<Select.Root type="single" bind:value={platform}>
			<Select.Trigger id="filter-platform{suffix}" class="w-full sm:w-48">{label(platforms, platform)}</Select.Trigger>
			<Select.Content>
				{#each platforms as [value, text] (value)}<Select.Item {value} label={text}>{text}</Select.Item>{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="grid gap-1.5">
		<Label for="filter-risk{suffix}">Show</Label>
		<Select.Root type="single" bind:value={concern}>
			<Select.Trigger id="filter-risk{suffix}" class="w-full sm:w-60">{label(concerns, concern)}</Select.Trigger>
			<Select.Content>
				{#each concerns as [value, text] (value)}<Select.Item {value} label={text}>{text}</Select.Item>{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="grid gap-1.5">
		<Label for="filter-sort{suffix}">Sort by</Label>
		<Select.Root type="single" bind:value={sort}>
			<Select.Trigger id="filter-sort{suffix}" class="w-full sm:w-56">{label(sorts, sort)}</Select.Trigger>
			<Select.Content>
				{#each sorts as [value, text] (value)}<Select.Item {value} label={text}>{text}</Select.Item>{/each}
			</Select.Content>
		</Select.Root>
	</div>
{/snippet}

<!-- Wide screens: the filters sit in a row. Phones: one Filters button opens them from the bottom. -->
<div class="hidden flex-wrap items-end gap-4 sm:flex" aria-label="Filter products" role="group">
	{@render filterControls('')}
	{#if searching}
		<Button variant="outline" onclick={() => (catalog.results = [])}>Show all products</Button>
	{/if}
</div>
<div class="flex flex-wrap items-center gap-2 sm:hidden">
	<Button variant="outline" onclick={() => (filtersOpen = true)}>
		<SlidersHorizontalIcon /> Filters
		{#if activeFilters}<Badge variant="secondary">{activeFilters}</Badge>{/if}
	</Button>
	{#if searching}
		<Button variant="outline" onclick={() => (catalog.results = [])}>Show all</Button>
	{/if}
</div>
<Sheet bind:open={filtersOpen}>
	<SheetContent side="bottom" class="max-h-[85svh] rounded-t-xl">
		<SheetHeader>
			<SheetTitle>Filter products</SheetTitle>
			<SheetDescription>Choose what to show and how to sort it.</SheetDescription>
		</SheetHeader>
		<div class="grid gap-4 px-4">{@render filterControls('-sheet')}</div>
		<SheetFooter>
			<Button onclick={() => (filtersOpen = false)}>Show {filtered.length} product{filtered.length === 1 ? '' : 's'}</Button>
			{#if filtering || sort !== 'fewest'}
				<Button variant="ghost" onclick={() => { clearFilters(); sort = 'fewest'; }}>Reset</Button>
			{/if}
		</SheetFooter>
	</SheetContent>
</Sheet>

<p class="text-muted-foreground text-sm" aria-live="polite">
	{#if filtered.length}
		{filtered.length} product{filtered.length === 1 ? '' : 's'} shown{searching ? ' for your search' : ''}.
	{/if}
</p>

{#if catalog.browseLoading && !source.length}
	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" role="status" aria-label="Loading products">
		{#each [1, 2, 3, 4] as n (n)}<ProductCardSkeleton />{/each}
	</div>
{:else if filtered.length}
	<ProductGrid products={filtered} />
{:else}
	{#if filtering && source.length}
		<EmptyState art="search" title="No products match these filters" description="Try another marketplace or verdict.">
			{#snippet actions()}<Button variant="outline" onclick={clearFilters}>Clear filters</Button>{/snippet}
		</EmptyState>
	{:else if catalog.error && !catalog.modelUnavailable}
		<!-- A failed load must not look like an empty list. -->
		<EmptyState art="error" title="Products couldn't be loaded" description="The server did not answer. Nothing was lost.">
			{#snippet actions()}<Button onclick={() => catalog.reload()}>Try again</Button>{/snippet}
		</EmptyState>
	{:else}
		<EmptyState art="search" title="No products checked yet" description={catalog.modelUnavailable || 'Check a product and its report will be listed here.'}>
			{#snippet actions()}<Button href="/app/analyze">Check a product</Button>{/snippet}
		</EmptyState>
	{/if}
{/if}
