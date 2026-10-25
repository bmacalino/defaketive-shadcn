<script lang="ts">
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	// Horizontal bars, one row per thing, for short ranked lists (kinds of product, price bands, kinds of hazard).
	// Plain HTML so a long label wraps on a phone and the chart prints. Each bar's length is its total against the
	// longest; a stacked bar splits that total by series with a 2px gap. The number at the end and the label carry
	// the meaning, so nothing depends on colour alone; the tooltip gives the split.
	type Series = { key: string; label: string; color: string };
	type Row = { label: string; values: Record<string, number> };
	let {
		rows,
		series,
		label,
		end,
		tip,
		onselect
	}: {
		rows: Row[];
		series: readonly Series[];
		/** What the whole chart shows, for screen readers. */
		label: string;
		/** The number at the end of a row. */
		end: (row: Row) => string;
		/** The split, in words: the tooltip and what a screen reader hears for the row. */
		tip: (row: Row) => string;
		/** When given, each row's label is a button that opens that group (on the watch list). */
		onselect?: (row: Row) => void;
	} = $props();

	const total = (row: Row) => series.reduce((sum, s) => sum + (row.values[s.key] ?? 0), 0);
	const longest = $derived(Math.max(1, ...rows.map(total)));
</script>

<ul class="space-y-3 sm:space-y-2" aria-label={label}>
	{#each rows as row (row.label)}
		<li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto]">
			{#if onselect}
				<button
					type="button"
					class="tap col-span-2 w-fit text-left leading-snug underline decoration-dotted underline-offset-4 hover:decoration-solid sm:col-span-1"
					aria-label="{row.label}: show on the watch list"
					onclick={() => onselect(row)}>{row.label}</button
				>
			{:else}
				<span class="col-span-2 leading-snug sm:col-span-1">{row.label}</span>
			{/if}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<div {...props} tabindex="-1" role="img" aria-label="{row.label}: {tip(row)}" class="flex h-3 w-full items-stretch gap-0.5 py-0">
							{#each series as s (s.key)}
								{#if row.values[s.key]}
									<span
										class="h-full min-w-0.5 first:rounded-l-[1px] last:rounded-r"
										style="width: {((row.values[s.key] ?? 0) / longest) * 100}%; background: {s.color}"
									></span>
								{/if}
							{/each}
						</div>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{tip(row)}</Tooltip.Content>
			</Tooltip.Root>
			<span class="text-muted-foreground min-w-14 text-right whitespace-nowrap tabular-nums">{end(row)}</span>
		</li>
	{/each}
</ul>
