<script lang="ts">
	import StarIcon from '@lucide/svelte/icons/star';
	import { cn } from '#lib/utils.js';

	let {
		value,
		showNumber = true,
		class: className
	}: { value?: number | string | null; showNumber?: boolean; class?: string } = $props();

	const rating = $derived(Math.max(0, Math.min(5, Number(value) || 0)));
</script>

{#if !rating}
	<span class={cn('text-muted-foreground text-xs', className)}>No rating</span>
{:else}
	<span class={cn('inline-flex items-center gap-1.5', className)} role="img" aria-label="{rating.toFixed(1)} out of 5 stars">
		<span class="flex" aria-hidden="true">
			{#each [1, 2, 3, 4, 5] as position (position)}
				<StarIcon
					class={cn('size-3.5', rating >= position - 0.5 ? 'fill-foreground text-foreground' : 'text-muted-foreground/40')}
				/>
			{/each}
		</span>
		{#if showNumber}<span class="text-muted-foreground text-xs" aria-hidden="true">{rating.toFixed(1)}/5</span>{/if}
	</span>
{/if}
