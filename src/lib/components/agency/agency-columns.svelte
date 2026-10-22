<script lang="ts">
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	// Columns for a count over time (safety reviews per year): one grey column per step, its number on top, the
	// step under it. A step with nothing still keeps its place, so a quiet year shows as a gap.
	type Column = { label: string; value: number };
	let { columns, label, tip }: { columns: Column[]; label: string; tip: (column: Column) => string } = $props();

	const highest = $derived(Math.max(1, ...columns.map((c) => c.value)));
</script>

<ul class="flex h-44 items-end gap-2" aria-label={label}>
	{#each columns as column (column.label)}
		<li class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 text-xs">
			<span class="text-muted-foreground tabular-nums">{column.value}</span>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<div
							{...props}
							tabindex="-1"
							role="img"
							aria-label="{column.label}: {tip(column)}"
							class="w-full max-w-10 rounded-t bg-(--muted-foreground)"
							style="height: {column.value ? Math.max(2, (column.value / highest) * 100) : 0}%"
						></div>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{tip(column)}</Tooltip.Content>
			</Tooltip.Root>
			<span class="border-border w-full border-t pt-1 text-center">{column.label}</span>
		</li>
	{/each}
</ul>
