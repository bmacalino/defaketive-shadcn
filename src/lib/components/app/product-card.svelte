<script lang="ts">
	import HeartIcon from '@lucide/svelte/icons/heart';
	import type { Snippet } from 'svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { HoverCard, HoverCardContent, HoverCardTrigger } from '#lib/components/ui/hover-card/index.js';
	import { reportHref } from '#lib/nav.js';
	import { money, platformName, safeImage, safeLink } from '#lib/product.js';
	import { library } from '#lib/stores/library.svelte.js';
	import type { Product } from '#lib/types.js';
	import { cn } from '#lib/utils.js';
	import ProductImage from './product-image.svelte';
	import ProductPreview from './product-preview.svelte';
	import ReportChips from './report-chips.svelte';
	import Stars from './stars.svelte';
	import VerdictBadge from './verdict-badge.svelte';

	let {
		product,
		note,
		class: className
	}: { product: Product; note?: Snippet; class?: string } = $props();

	const link = $derived(safeLink(product.link));
	const image = $derived(safeImage(product));
	const name = $derived(product.name || 'Unnamed product');
	const saved = $derived(library.isSaved(link));
</script>

<Card class={cn('relative gap-0 py-0 transition-shadow focus-within:ring-2 hover:shadow-md', className)}>
	<div class="relative">
		<ProductImage src={image} {name} class="aspect-[4/3] w-full" />
		<VerdictBadge {product} class="absolute top-2 left-2 shadow-sm" />
		{#if note}<div class="absolute right-2 bottom-2">{@render note()}</div>{/if}
	</div>
	<CardContent class="flex flex-1 flex-col gap-2 p-4">
		<div class="flex items-center justify-between gap-2">
			<Badge variant="outline">{platformName(product)}</Badge>
			<Button
				variant="ghost"
				size="icon-sm"
				class="relative z-10 -mr-1"
				aria-pressed={saved}
				aria-label="{saved ? 'Remove from' : 'Save to'} wishlist: {name}"
				disabled={!link}
				onclick={() => library.toggleWishlist(product)}
			>
				<HeartIcon class={saved ? 'fill-current' : ''} />
			</Button>
		</div>
		{#if link}
			<!-- Resting the mouse on the name (or anywhere on the card) shows a short preview. -->
			<HoverCard openDelay={500} closeDelay={80}>
				<HoverCardTrigger
					href={reportHref(link)}
					class="line-clamp-2 leading-snug font-medium hover:underline after:absolute after:inset-0 after:content-['']"
					title={name}>{name}</HoverCardTrigger
				>
				<HoverCardContent class="w-80" side="right" align="start" sideOffset={12}>
					<ProductPreview {product} />
				</HoverCardContent>
			</HoverCard>
		{:else}
			<span class="line-clamp-2 leading-snug font-medium" title={name}>{name}</span>
		{/if}
		<ReportChips {product} />
		<div class="mt-auto flex items-center justify-between gap-2 pt-1">
			<span class="font-semibold">{money(product.price)}</span>
			<Stars value={product.rating} />
		</div>
	</CardContent>
</Card>
