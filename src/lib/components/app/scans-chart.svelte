<script lang="ts">
	import { BarChart } from 'layerchart';
	import { scaleBand } from 'd3-scale';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { library } from '#lib/stores/library.svelte.js';

	// Scans per day over the last two weeks, from this visitor's history.
	const DAYS = 14;
	const config = { scans: { label: 'Scans', color: 'var(--chart-3)' } } satisfies Chart.ChartConfig;

	const data = $derived.by(() => {
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		const days = Array.from({ length: DAYS }, (_, i) => {
			const day = new Date(start);
			day.setDate(start.getDate() - (DAYS - 1 - i));
			return { key: day.getTime(), day: new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(day), scans: 0 };
		});
		for (const product of library.history) {
			const time = library.timeOf(product);
			if (!time) continue;
			const day = new Date(time);
			day.setHours(0, 0, 0, 0);
			const slot = days.find((d) => d.key === day.getTime());
			if (slot) slot.scans += 1;
		}
		return days;
	});
	const total = $derived(data.reduce((sum, d) => sum + d.scans, 0));
</script>

{#if total > 0}
	<Card class="reveal gap-2 p-4">
	<h2 class="text-sm font-medium">Scans per day</h2>
	<div role="img" aria-label="Scans per day over the last {DAYS} days: {total} in total">
		<Chart.Container {config} class="aspect-auto h-36 w-full">
			<BarChart {data} x="day" xScale={scaleBand().padding(0.3)} axis="x" grid={false} series={[{ key: 'scans', label: 'Scans', color: config.scans.color }]} props={{ bars: { stroke: 'none', radius: 3, rounded: 'top' }, xAxis: { ticks: 7 } }}>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
	</div>
	</Card>
{/if}
