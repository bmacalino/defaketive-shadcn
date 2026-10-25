<script lang="ts">
	import * as Table from '#lib/components/ui/table/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { LEVEL_SERIES, PLAIN_SERIES } from '#lib/agency.js';
	import type { AgencyPatterns } from '#lib/types.js';
	import AgencyBars from './agency-bars.svelte';
	import AgencyChartCard from './agency-chart-card.svelte';
	import AgencyColumns from './agency-columns.svelte';

	// The Overview tab: five charts of the same saved reports the watch list shows, then every kind in a table.
	// Each chart says in words what it shows and what it does not; counts, never percentages, because most groups
	// are small.
	let {
		patterns,
		onselect
	}: {
		patterns: AgencyPatterns;
		/** A kind, price band or other problem picked on a chart: the page opens the watch list with it. */
		onselect?: (group: { kind?: string; price?: string; also?: string }) => void;
	} = $props();

	const count = (value: number) => value.toLocaleString();
	const plural = (value: number, one: string, many = `${one}s`) => `${count(value)} ${value === 1 ? one : many}`;

	type Split = { reports: number; mentions: number; listings: number };
	const splitValues = (row: Split) => ({ reports: row.reports, mentions: row.mentions, none: row.listings - row.reports - row.mentions });
	const splitTip = (row: { values: Record<string, number> }) => {
		const { reports = 0, mentions = 0, none = 0 } = row.values;
		return `${plural(reports + mentions + none, 'listing')} checked: ${count(reports)} with safety reports, ${count(mentions)} with safety mentions, ${count(none)} with neither`;
	};
	const flaggedEnd = (row: { values: Record<string, number> }) => {
		const { reports = 0, mentions = 0, none = 0 } = row.values;
		return `${count(reports + mentions)} of ${count(reports + mentions + none)}`;
	};

	// 1. Kinds with at least one flagged listing, in the server's order (most red first, "Other" last).
	const kinds = $derived(patterns.kinds.filter((kind) => kind.reports + kind.mentions > 0));
	const quietKinds = $derived(patterns.kinds.length - kinds.length);
	const kindRows = $derived(kinds.map((kind) => ({ label: kind.kind, values: splitValues(kind) })));
	const topKind = $derived(
		[...kinds].filter((k) => k.kind !== 'Other').sort((a, b) => b.reports + b.mentions - (a.reports + a.mentions))[0]
	);

	// 2. Price bands. The takeaway names the band with the largest share flagged.
	const prices = $derived(patterns.charts.prices.filter((band) => band.listings > 0));
	const priceRows = $derived(prices.map((band) => ({ label: band.band, values: splitValues(band) })));
	const topBand = $derived(
		[...prices].sort((a, b) => (b.reports + b.mentions) / b.listings - (a.reports + a.mentions) / a.listings)[0]
	);

	// 3. Kinds of hazard, by quote.
	const hazards = $derived(patterns.charts.hazards);
	const hazardRows = $derived(hazards.map((h) => ({ label: h.hazard[0].toUpperCase() + h.hazard.slice(1), values: { value: h.quotes } })));
	const quotes = $derived(hazards.reduce((sum, h) => sum + h.quotes, 0));

	// 4. Safety reviews per year.
	const years = $derived(patterns.charts.years);
	const dated = $derived(years.reduce((sum, y) => sum + y.reviews, 0));
	const topYear = $derived([...years].sort((a, b) => b.reviews - a.reviews)[0]);

	// 5. What else buyers report about the flagged listings: misleading listings and copies concern the office too.
	// Each bar is all the flagged listings; the grey part is those without that problem.
	const also = $derived(patterns.charts.also ?? []);
	const flaggedCount = $derived(also[0]?.flagged ?? 0);
	const alsoRows = $derived(
		also.map((item) => ({ label: item.label, values: { reports: item.reports, mentions: item.mentions, none: item.flagged - item.reports - item.mentions } }))
	);
	const alsoTip = (row: { values: Record<string, number> }) => {
		const { reports = 0, mentions = 0, none = 0 } = row.values;
		return `${count(reports + mentions)} of ${plural(reports + mentions + none, 'flagged listing')}: ${count(reports)} with safety reports, ${count(mentions)} with safety mentions`;
	};
	const ALSO_LEGEND = [
		{ key: 'reports', label: 'Safety reports' },
		{ key: 'mentions', label: 'Safety mentions' },
		{ key: 'none', label: 'Without it' }
	];
</script>

{#snippet levelLegend(keys: readonly string[])}
	<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="What the colours mean">
		{#each LEVEL_SERIES.filter((s) => keys.includes(s.key)) as s (s.key)}
			<li class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm" style="background: {s.color}" aria-hidden="true"></span>{s.label}</li>
		{/each}
	</ul>
{/snippet}

<div class="grid gap-4 md:grid-cols-2">
	<AgencyChartCard
		class="md:col-span-2"
		title="By product kind"
		takeaway={topKind
			? `Most flagged: ${topKind.kind.toLowerCase()}, ${count(topKind.reports + topKind.mentions)} of ${count(topKind.listings)} listings with safety reviews.`
			: 'No kind of product has safety reviews yet.'}
		note={`Each bar is all the listings of that kind DeFaketive has checked. Choose a kind to see its listings. ${quietKinds ? `${plural(quietKinds, 'kind')} with no safety reviews ${quietKinds === 1 ? 'is' : 'are'} only in the table below.` : ''}`}
	>
		{#snippet legend()}{@render levelLegend(['reports', 'mentions', 'none'])}{/snippet}
		{#snippet chart()}
			<AgencyBars rows={kindRows} series={LEVEL_SERIES} label="Listings with safety reviews, by kind of product" end={flaggedEnd} tip={splitTip} onselect={onselect && ((row) => onselect({ kind: row.label }))} />
		{/snippet}
	</AgencyChartCard>

	<AgencyChartCard
		title="By price"
		takeaway={topBand
			? `Largest share: ${topBand.band.toLowerCase()}, ${count(topBand.reports + topBand.mentions)} of ${count(topBand.listings)} listings.`
			: 'No prices to compare.'}
		note={`Most listings under ₱200 are chargers and cables, so this does not show that cheap means unsafe.${patterns.charts.no_price ? ` ${plural(patterns.charts.no_price, 'listing')} with no price ${patterns.charts.no_price === 1 ? 'is' : 'are'} left out.` : ''}`}
	>
		{#snippet legend()}{@render levelLegend(['reports', 'mentions', 'none'])}{/snippet}
		{#snippet chart()}
			<AgencyBars rows={priceRows} series={LEVEL_SERIES} label="Listings with safety reviews, by price" end={flaggedEnd} tip={splitTip} onselect={onselect && ((row) => onselect({ price: row.label }))} />
		{/snippet}
		{#snippet numbers()}
			<Table.Root>
				<Table.Header><Table.Row><Table.Head>Price</Table.Head><Table.Head class="text-right">Listings</Table.Head><Table.Head class="text-right">Safety reports</Table.Head><Table.Head class="text-right">Safety mentions</Table.Head></Table.Row></Table.Header>
				<Table.Body>
					{#each prices as band (band.band)}
						<Table.Row><Table.Cell>{band.band}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(band.listings)}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(band.reports)}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(band.mentions)}</Table.Cell></Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/snippet}
	</AgencyChartCard>

	<AgencyChartCard
		title="Kinds of hazard"
		takeaway={hazards.length ? `Most often: ${hazards[0].hazard}, ${count(hazards[0].quotes)} of ${plural(quotes, 'quote')}.` : 'No safety quotes yet.'}
		note={'Counted by quoted sentence. One review can mention more than one problem. "A safety problem" is a quote the check could not place in one group.'}
	>
		{#snippet chart()}
			<AgencyBars rows={hazardRows} series={PLAIN_SERIES} label="Safety quotes by kind of hazard" end={(row) => count(row.values.value ?? 0)} tip={(row) => plural(row.values.value ?? 0, 'quote')} />
		{/snippet}
		{#snippet numbers()}
			<Table.Root>
				<Table.Header><Table.Row><Table.Head>Hazard</Table.Head><Table.Head class="text-right">Quotes</Table.Head></Table.Row></Table.Header>
				<Table.Body>
					{#each hazards as hazard (hazard.hazard)}
						<Table.Row><Table.Cell>{hazard.hazard}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(hazard.quotes)}</Table.Cell></Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/snippet}
	</AgencyChartCard>

	<AgencyChartCard
		title="When buyers reported"
		takeaway={topYear?.reviews ? `Most safety reviews are from ${topYear.year}: ${count(topYear.reviews)} of ${count(dated)}.` : 'No dated safety reviews yet.'}
		note={`DeFaketive reads up to 60 of the newest reviews per star level, so older years look smaller than they were. Dates Lazada gave as "3 weeks ago" are counted back from when the reviews were collected.${patterns.charts.recent_or_unknown ? ` ${plural(patterns.charts.recent_or_unknown, 'review')} with no date ${patterns.charts.recent_or_unknown === 1 ? 'is' : 'are'} left out.` : ''}`}
	>
		{#snippet chart()}
			<AgencyColumns
				columns={years.map((y) => ({ label: String(y.year), value: y.reviews }))}
				label="Safety reviews by year"
				tip={(column) => plural(column.value, 'safety review')}
			/>
		{/snippet}
		{#snippet numbers()}
			<Table.Root>
				<Table.Header><Table.Row><Table.Head>Year</Table.Head><Table.Head class="text-right">Safety reviews</Table.Head></Table.Row></Table.Header>
				<Table.Body>
					{#each years as year (year.year)}
						<Table.Row><Table.Cell>{year.year}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(year.reviews)}</Table.Cell></Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/snippet}
	</AgencyChartCard>

	{#if also.length && flaggedCount}
		<AgencyChartCard
			title="What else buyers report"
			takeaway={`Most often: ${also[0].label.toLowerCase()}, ${count(also[0].reports + also[0].mentions)} of ${plural(flaggedCount, 'flagged listing')}.`}
			note="Counted on the listings with safety reviews; a listing can have both. Choose one to see its listings."
		>
			{#snippet legend()}
				<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="What the colours mean">
					{#each LEVEL_SERIES as s, index (s.key)}
						<li class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm" style="background: {s.color}" aria-hidden="true"></span>{ALSO_LEGEND[index].label}</li>
					{/each}
				</ul>
			{/snippet}
			{#snippet chart()}
				<AgencyBars
					rows={alsoRows}
					series={LEVEL_SERIES}
					label="Flagged listings that buyers also report other problems about"
					end={flaggedEnd}
					tip={alsoTip}
					onselect={onselect && ((row) => onselect({ also: also.find((item) => item.label === row.label)?.category }))}
				/>
			{/snippet}
			{#snippet numbers()}
				<Table.Root>
					<Table.Header><Table.Row><Table.Head>Also reported</Table.Head><Table.Head class="text-right">Safety reports</Table.Head><Table.Head class="text-right">Safety mentions</Table.Head><Table.Head class="text-right">Of flagged</Table.Head></Table.Row></Table.Header>
					<Table.Body>
						{#each also as item (item.category)}
							<Table.Row><Table.Cell>{item.label}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(item.reports)}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(item.mentions)}</Table.Cell><Table.Cell class="text-right tabular-nums">{count(item.reports + item.mentions)} of {count(item.flagged)}</Table.Cell></Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/snippet}
		</AgencyChartCard>
	{/if}
</div>

<section class="space-y-2" aria-labelledby="kinds-table-title">
	<h3 id="kinds-table-title" class="font-semibold">Every kind of product</h3>
	<p class="text-muted-foreground text-sm">
		How each kind fares across the {count(patterns.listings)} Lazada listings DeFaketive has checked.
	</p>
	<Card class="py-0">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="pl-4">Kind</Table.Head>
					<Table.Head class="text-right">Listings checked</Table.Head>
					<Table.Head class="text-right">Safety reports</Table.Head>
					<Table.Head class="text-right">Safety mentions</Table.Head>
					<Table.Head class="pr-4">Most reported problem</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each patterns.kinds as kind (kind.kind)}
					<Table.Row>
						<Table.Cell class="pl-4 font-medium">{kind.kind}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{count(kind.listings)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums {kind.reports ? 'font-semibold' : 'text-muted-foreground'}">{count(kind.reports)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums {kind.mentions ? '' : 'text-muted-foreground'}">{count(kind.mentions)}</Table.Cell>
						<Table.Cell class="text-muted-foreground pr-4">{kind.top_hazard ?? '—'}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card>
</section>
