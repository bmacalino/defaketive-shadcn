<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '#lib/components/ui/empty/index.js';
	import { cn } from '#lib/utils.js';
	import EmptyArt from './empty-art.svelte';

	// One look for every empty screen: a drawing, a plain title, one sentence, and what to do next.
	let {
		art,
		title,
		description,
		actions,
		class: className
	}: {
		art: 'search' | 'history' | 'heart' | 'scan' | 'error' | 'reviews';
		title: string;
		description?: string;
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<Empty class={cn('reveal border border-dashed', className)}>
	<EmptyHeader>
		<EmptyArt kind={art} />
		<EmptyTitle>{title}</EmptyTitle>
		{#if description}<EmptyDescription>{description}</EmptyDescription>{/if}
	</EmptyHeader>
	{#if actions}
		<EmptyContent><div class="flex flex-wrap justify-center gap-2">{@render actions()}</div></EmptyContent>
	{/if}
</Empty>
