<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { chipFor, counts, labelOf } from '#lib/product.js';
	import type { Category, Product } from '#lib/types.js';

	let { product }: { product: Product } = $props();

	// The three labels that can raise a warning. The server words each one.
	const shown: Category[] = ['safety', 'defect', 'counterfeit'];
	const found = $derived(counts(product));
	const chips = $derived(shown.filter((category) => (found[category] ?? 0) > 0));
	// The safety count takes the product's own colour: red only when the reports are serious or repeated.
	const safetyTone = $derived(chipFor(product).kind === 'safety' ? 'tone-safety' : 'tone-caution');
</script>

{#if chips.length}
	<div class="flex flex-wrap gap-1.5">
		{#each chips as category (category)}
			<Badge
				variant={category === 'safety' ? 'outline' : 'secondary'}
				class={category === 'safety' ? `${safetyTone} border-(--tone)/45 bg-(--tone-soft) text-foreground [&>svg]:text-(--tone)` : ''}
			>
				{labelOf(product, category)} · {found[category]}
			</Badge>
		{/each}
	</div>
{/if}
