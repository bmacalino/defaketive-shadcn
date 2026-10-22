<script lang="ts">
	import { BarChart } from 'layerchart';
	import { scaleBand } from 'd3-scale';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { library } from '#lib/stores/library.svelte.js';

	// Products checked per day (scanned or opened), from this visitor's history. The chart starts on the day the account
	// was created and shows at most the latest 30 days. A young account still gets 14 slots, running forward from the day
	// it was made, so the bars stay thin and the first two weeks fill in day by day. A guest, or a server that sends no
	// date, gets the last 14 days.
	const MIN_DAYS = 14;
	const MAX_DAYS = 30;
	const config = { products: { label: 'Products', color: 'var(--chart-3)' } } satisfies Chart.ChartConfig;
	const dayName = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });

	const data = $derived.by(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const created = new Date(Date.parse(auth.user?.created_at ?? ''));
		created.setHours(0, 0, 0, 0);
		const sinceCreated = Math.round((today.getTime() - created.getTime()) / 86_400_000) + 1;
		// How many of the days so far to show, then how many slots in all.
		const past = Number.isNaN(sinceCreated) ? MIN_DAYS : Math.min(MAX_DAYS, Math.max(1, sinceCreated));
		const count = Math.max(MIN_DAYS, past);
		const days = Array.from({ length: count }, (_, i) => {
			const day = new Date(today);
			day.setDate(today.getDate() - (past - 1) + i);
			return { key: day.getTime(), day: dayName.format(day), products: 0 };
		});
		for (const product of library.history) {
			const time = library.timeOf(product);
			if (!time) continue;
			const day = new Date(time);
			day.setHours(0, 0, 0, 0);
			const slot = days.find((d) => d.key === day.getTime());
			if (slot) slot.products += 1;
		}
		return days;
	});
	const total = $derived(data.reduce((sum, d) => sum + d.products, 0));
	const period = $derived(`from ${data[0]?.day} to ${data.at(-1)?.day}`);
</script>

{#if total > 0}
	<Card class="reveal gap-2 p-4">
	<h2 class="text-sm font-medium">Products checked per day</h2>
	<div role="img" aria-label="Products checked per day {period}: {total} in total">
		<Chart.Container {config} class="aspect-auto h-36 w-full">
			<BarChart {data} x="day" xScale={scaleBand().padding(0.3)} axis="x" grid={false} series={[{ key: 'products', label: 'Products', color: config.products.color }]} props={{ bars: { stroke: 'none', radius: 3, rounded: 'top' }, xAxis: { ticks: 7 } }}>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
	</div>
	</Card>
{/if}
