<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card/index.js';
	import { accuracyBrief, chipFor, VERDICT_GROUPS, view } from '#lib/product.js';
	import type { Product } from '#lib/types.js';
	import { cn } from '#lib/utils.js';

	let { product }: { product: Product } = $props();

	const verdict = $derived(view(product));
	const chip = $derived(chipFor(product));
</script>

<!-- Beside the chart at the top of the Summary tab. The "What do these labels mean?" link under the result jumps here. -->
<Card id="report-guide" tabindex={-1} class="scroll-mt-20 outline-none">
	<CardHeader class="gap-1.5">
		<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Results</p>
		<CardTitle class="text-xl">How DeFaketive labels a product</CardTitle>
		<CardDescription>A plain result from what reviewers reported. No score.</CardDescription>
	</CardHeader>
	<CardContent class="grid gap-3">
		{#each VERDICT_GROUPS as group (group.kind)}
			<div class={cn('rounded-lg border p-3', chip.kind === group.kind && 'border-foreground/40 bg-muted/50')}>
				<p class="flex flex-wrap items-center gap-2 text-sm font-medium">
					<i class="tone-{group.kind} size-2.5 shrink-0 rounded-full bg-(--tone)" aria-hidden="true"></i>
					{group.label}
					{#if chip.kind === group.kind}<Badge variant="secondary">This product</Badge>{/if}
				</p>
				<p class="text-muted-foreground mt-0.5 text-sm">{group.meaning}</p>
			</div>
		{/each}
		<p class="text-muted-foreground text-xs">{accuracyBrief(verdict.safety_check_accuracy)}</p>
	</CardContent>
</Card>
