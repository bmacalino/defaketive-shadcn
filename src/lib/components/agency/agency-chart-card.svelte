<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';
	import { Card } from '#lib/components/ui/card/index.js';
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#lib/components/ui/collapsible/index.js';
	import { cn } from '#lib/utils.js';

	// One chart on the Overview: what it is, what it says in one line, the chart, what it does NOT show, and the
	// same numbers as a table for anyone who can't read the chart.
	let {
		title,
		takeaway,
		note,
		legend,
		chart,
		numbers,
		class: className
	}: {
		title: string;
		takeaway: string;
		note: string;
		legend?: Snippet;
		chart: Snippet;
		numbers?: Snippet;
		class?: string;
	} = $props();

	let open = $state(false);
</script>

<Card class={cn('gap-4 p-4 sm:p-5', className)} data-print="keep">
	<header class="space-y-1">
		<h3 class="font-semibold">{title}</h3>
		<p class="text-sm">{takeaway}</p>
	</header>
	{#if legend}{@render legend()}{/if}
	{@render chart()}
	<p class="text-muted-foreground text-xs">{note}</p>
	{#if numbers}
		<Collapsible bind:open>
			<CollapsibleTrigger class="text-muted-foreground hover:text-foreground tap flex items-center gap-1 text-sm underline-offset-4 hover:underline">
				{open ? 'Hide the numbers' : 'Show the numbers'}
				<ChevronDownIcon class={cn('size-4 transition-transform', open && 'rotate-180')} />
			</CollapsibleTrigger>
			<CollapsibleContent class="pt-2">{@render numbers()}</CollapsibleContent>
		</Collapsible>
	{/if}
</Card>
