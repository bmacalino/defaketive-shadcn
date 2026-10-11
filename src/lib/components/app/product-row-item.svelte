<script lang="ts">
	import HeartIcon from '@lucide/svelte/icons/heart';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { HoverCard, HoverCardContent, HoverCardTrigger } from '#lib/components/ui/hover-card/index.js';
	import { reportHref } from '#lib/nav.js';
	import { money, platformName, safeImage, safeLink, shortDate, shortTime } from '#lib/product.js';
	import { library } from '#lib/stores/library.svelte.js';
	import type { Product } from '#lib/types.js';
	import ProductImage from './product-image.svelte';
	import ProductPreview from './product-preview.svelte';
	import Stars from './stars.svelte';
	import VerdictBadge from './verdict-badge.svelte';

	// One scan in a list: photo, when, name, where, verdict, rating, price and the save heart.
	let { product }: { product: Product } = $props();

	const link = $derived(safeLink(product.link));
	const image = $derived(safeImage(product));
	const name = $derived(product.name || 'Unnamed product');
	const time = $derived(library.timeOf(product));
	const saved = $derived(library.isSaved(link));
</script>

<article class="relative flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
	<ProductImage src={image} {name} compact class="size-16 shrink-0 rounded-lg sm:size-20" />
	<div class="text-muted-foreground hidden w-16 shrink-0 text-xs sm:block">
		{#if time}
			<div class="text-foreground font-medium">{shortDate(time)}</div>
			<time datetime={new Date(time).toISOString()}>{shortTime(time)}</time>
		{:else}
			<span>No date</span>
		{/if}
	</div>
	<div class="min-w-0 flex-1 space-y-1.5">
		{#if link}
			<HoverCard openDelay={500} closeDelay={80}>
				<HoverCardTrigger
					href={reportHref(link)}
					class="line-clamp-1 font-medium hover:underline after:absolute after:inset-0 after:content-['']"
					title={name}>{name}</HoverCardTrigger
				>
				<HoverCardContent class="w-80" side="bottom" align="start" sideOffset={8}>
					<ProductPreview {product} />
				</HoverCardContent>
			</HoverCard>
		{:else}
			<span class="line-clamp-1 font-medium" title={name}>{name}</span>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant="outline">{platformName(product)}</Badge>
			<VerdictBadge {product} />
			<Stars value={product.rating} />
		</div>
	</div>
	<b class="hidden shrink-0 sm:block">{money(product.price)}</b>
	<Button
		variant="ghost"
		size="icon"
		class="relative z-10 shrink-0"
		aria-pressed={saved}
		aria-label="{saved ? 'Remove from' : 'Save to'} wishlist: {name}"
		disabled={!link}
		onclick={() => library.toggleWishlist(product)}
	>
		<HeartIcon class={saved ? 'fill-current' : ''} />
	</Button>
</article>
