<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Snippet } from 'svelte';
	import type { Product } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Carousel, CarouselContent, CarouselItem } from '#lib/components/ui/carousel/index.js';
	import type { CarouselAPI } from '#lib/components/ui/carousel/context.js';
	import ProductCard from './product-card.svelte';

	// A titled row of product cards in a carousel: drag or swipe it, or use the arrows.
	let {
		id,
		title,
		description,
		href,
		hrefLabel = 'See all',
		products,
		empty,
		overlay
	}: {
		id: string;
		title: string;
		description?: string;
		href?: string;
		hrefLabel?: string;
		products: Product[];
		empty?: Snippet;
		/** Something to lay over a card's photo, such as a save count. */
		overlay?: Snippet<[Product]>;
	} = $props();

	let api = $state<CarouselAPI>();
	let canPrev = $state(false);
	let canNext = $state(false);

	// Keep the arrows in step with where the row is. They only show when there is something off-screen.
	$effect(() => {
		if (!api) return;
		const current = api;
		const update = () => {
			canPrev = current.canScrollPrev();
			canNext = current.canScrollNext();
		};
		update();
		current.on('scroll', update).on('reInit', update).on('resize', update);
		return () => {
			current.off('scroll', update).off('reInit', update).off('resize', update);
		};
	});
	// New products: let the carousel measure again.
	$effect(() => {
		products.length;
		api?.reInit();
	});
</script>

<section aria-labelledby="{id}-title" class="space-y-3">
	<header class="flex items-end justify-between gap-4">
		<div>
			<h2 id="{id}-title" class="text-lg font-semibold tracking-tight">{title}</h2>
			{#if description}<p class="text-muted-foreground text-sm">{description}</p>{/if}
		</div>
		<div class="flex items-center gap-1">
			{#if canPrev || canNext}
				<Button variant="outline" size="icon-sm" aria-label="Show earlier: {title}" disabled={!canPrev} onclick={() => api?.scrollPrev()}>
					<ChevronLeftIcon />
				</Button>
				<Button variant="outline" size="icon-sm" aria-label="Show more: {title}" disabled={!canNext} onclick={() => api?.scrollNext()}>
					<ChevronRightIcon />
				</Button>
			{/if}
			{#if href}
				<Button variant="ghost" size="sm" {href}>{hrefLabel} <ArrowRightIcon /></Button>
			{/if}
		</div>
	</header>
	{#if products.length}
		<Carousel opts={{ align: 'start', dragFree: true, containScroll: 'trimSnaps' }} setApi={(a) => (api = a)} aria-label={title}>
			<CarouselContent class="-ms-4 py-1">
				{#each products as product, index (product.link)}
					<CarouselItem class="basis-72 ps-4">
						<div class="reveal h-full" style="--i:{index}">
							{#if overlay}
								<ProductCard {product} class="h-full">
									{#snippet note()}{@render overlay(product)}{/snippet}
								</ProductCard>
							{:else}
								<ProductCard {product} class="h-full" />
							{/if}
						</div>
					</CarouselItem>
				{/each}
			</CarouselContent>
		</Carousel>
	{:else}
		{@render empty?.()}
	{/if}
</section>
