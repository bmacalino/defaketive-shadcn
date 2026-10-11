<script lang="ts">
	import { PieChart, Text } from 'layerchart';
	import CountUp from './count-up.svelte';
	import * as Chart from '#lib/components/ui/chart/index.js';

	// The four groups a shopper sees on cards, as a donut. The list beside it carries the same numbers in words.
	let { groups, total }: { groups: { key: string; label: string; count: number; percent: number }[]; total: number } = $props();

	// The verdict colours, so a slice matches its chip. Each also has a word in the list.
	const colors: Record<string, string> = {
		clear: 'var(--success)',
		caution: 'var(--warning)',
		safety: 'var(--destructive)',
		unknown: 'var(--unknown)'
	};
	const config = $derived(
		Object.fromEntries(groups.map((g) => [g.key, { label: g.label, color: colors[g.key] }])) satisfies Chart.ChartConfig
	);
	const data = $derived(groups.filter((g) => g.count > 0).map((g) => ({ ...g, color: colors[g.key] })));
	const summary = $derived(groups.map((g) => `${g.count} ${g.label.toLowerCase()}`).join(', '));
</script>

<div class="flex flex-wrap items-center gap-6">
	<div class="size-40 shrink-0" role="img" aria-label="Your checked products: {summary}">
		<Chart.Container {config} class="aspect-square size-full">
			{#if data.length}
				<PieChart {data} key="key" value="count" c="color" innerRadius={-14} padding={4} cornerRadius={3} padAngle={0.02} props={{ pie: { motion: 'tween' } }}>
					{#snippet aboveMarks()}
						<Text value={String(total)} textAnchor="middle" verticalAnchor="middle" class="fill-foreground text-xl! font-semibold" dy={-4} />
						<Text value={total === 1 ? 'product' : 'products'} textAnchor="middle" verticalAnchor="middle" class="fill-muted-foreground text-xs!" dy={14} />
					{/snippet}
					{#snippet tooltip()}
						<Chart.Tooltip hideLabel />
					{/snippet}
				</PieChart>
			{:else}
				<svg viewBox="0 0 100 100" class="size-full" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--muted)" stroke-width="10" /></svg>
			{/if}
		</Chart.Container>
	</div>
	<ul class="grid min-w-48 flex-1 gap-3 text-sm">
		{#each groups as group (group.key)}
			<li class="flex items-center gap-3">
				<i class="size-3 shrink-0 rounded-full" style="background: {colors[group.key]}" aria-hidden="true"></i>
				<span class="flex-1">{group.label} <span class="text-muted-foreground">· {group.count} product{group.count === 1 ? '' : 's'}</span></span>
				<b class="tabular-nums"><CountUp value={group.percent} />%</b>
			</li>
		{/each}
	</ul>
</div>
