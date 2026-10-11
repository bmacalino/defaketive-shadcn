<script lang="ts">
	import { onMount } from 'svelte';
	import ProductCardSkeleton from '#lib/components/app/product-card-skeleton.svelte';
	import ProductGrid from '#lib/components/app/product-grid.svelte';
	import ProductRow from '#lib/components/app/product-row.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { safeLink } from '#lib/product.js';
	import { catalog } from '#lib/stores/catalog.svelte.js';
	import { library } from '#lib/stores/library.svelte.js';

	onMount(() => {
		catalog.loadExtras();
	});

	const saved = $derived(library.saved);
	// Checked products with nothing flagged that this visitor hasn't saved yet.
	const picks = $derived(
		catalog.suggestions.filter((p) => safeLink(p?.link) && !library.wishlist.includes(p.link))
	);
	// A product shows as popular only once two or more people saved it.
	const popular = $derived(
		catalog.popular.filter((item) => safeLink(item?.product?.link) && Number(item.saves) >= 2)
	);
</script>

<svelte:head><title>Wishlist · DeFaketive</title></svelte:head>

<header class="space-y-1">
	<h1 class="text-3xl font-semibold tracking-tight">Wishlist</h1>
	<p class="text-muted-foreground">Your saved products, products with no warnings, and what other users save most.</p>
</header>

<section class="space-y-3" aria-labelledby="saved-title">
	<div>
		<h2 id="saved-title" class="text-lg font-semibold tracking-tight">Your saved items</h2>
		{#if library.ready && !library.error}
			<p class="text-muted-foreground text-sm" aria-live="polite">{saved.length} product{saved.length === 1 ? '' : 's'} saved</p>
		{/if}
	</div>
	{#if !library.ready}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" role="status" aria-label="Loading your wishlist">
			{#each [1, 2, 3] as n (n)}<ProductCardSkeleton />{/each}
		</div>
	{:else if library.error}
		<!-- A failed load must not look like an empty wishlist. -->
		<EmptyState art="error" title="Your wishlist couldn't be loaded" description="Nothing was lost. It is still saved in your account.">
			{#snippet actions()}<Button onclick={() => library.retry()}>Try again</Button>{/snippet}
		</EmptyState>
	{:else if saved.length}
		<ProductGrid products={saved} />
	{:else}
		<EmptyState art="heart" title="Start building your shortlist" description="Tap the heart on {picks.length || popular.length ? 'a product below' : 'any product'} to save it here.">
			{#snippet actions()}<Button href="/app/products">Browse products</Button>{/snippet}
		</EmptyState>
	{/if}
</section>

{#if picks.length}
	<ProductRow
		id="picks"
		title="Products with no warnings"
		description="Checked products with enough reviews and nothing flagged, that you haven't saved yet."
		products={picks}
	/>
{/if}

{#if popular.length}
	<ProductRow
		id="popular"
		title="Most saved by users"
		description="Products DeFaketive users saved most often."
		products={popular.map((item) => item.product)}
	>
		{#snippet overlay(product)}
			<Badge variant="secondary" class="bg-background/90 backdrop-blur">
				{(popular.find((item) => item.product.link === product.link)?.saves ?? 0).toLocaleString()} saves
			</Badge>
		{/snippet}
	</ProductRow>
{/if}
