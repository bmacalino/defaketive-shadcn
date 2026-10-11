<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import VerdictBadge from '#lib/components/app/verdict-badge.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card/index.js';
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#lib/components/ui/collapsible/index.js';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#lib/components/ui/table/index.js';
	import { chipFor, groupOfTone, SAFETY_LIFT_NOTE, VERDICT_GROUPS, VERDICT_GUIDE, view } from '#lib/product.js';
	import type { Product } from '#lib/types.js';
	import { cn } from '#lib/utils.js';

	let { product }: { product: Product } = $props();

	const verdict = $derived(view(product));
	const chip = $derived(chipFor(product));
	let open = $state(false);
</script>

<!-- The last card on a report. The "What do these labels mean?" link under the verdict jumps here. -->
<Card id="report-guide" tabindex={-1} class="scroll-mt-20 outline-none">
	<CardHeader class="flex-row items-start justify-between gap-4">
		<div class="space-y-1.5">
			<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Verdicts</p>
			<CardTitle class="text-xl">How DeFaketive labels a product</CardTitle>
			<CardDescription>Each product gets a plain verdict from what its reviewers reported. There is no score.</CardDescription>
		</div>
	</CardHeader>
	<CardContent class="grid gap-4">
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{#each VERDICT_GROUPS as group (group.kind)}
				<div class={cn('rounded-lg border p-3', chip.kind === group.kind && 'border-foreground/40 bg-muted/50')}>
					<p class="flex flex-wrap items-center gap-2 font-medium">
						<i class="tone-{group.kind} size-2.5 shrink-0 rounded-full bg-(--tone)" aria-hidden="true"></i>
						{group.label}
						{#if chip.kind === group.kind}<Badge variant="secondary">This product</Badge>{/if}
					</p>
					<p class="text-muted-foreground mt-1 text-sm">{group.meaning}</p>
				</div>
			{/each}
		</div>
		<Collapsible bind:open>
			<CollapsibleTrigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm">
						{open ? 'Hide full detail' : 'View full detail'}
						<ChevronDownIcon class={cn('transition-transform', open && 'rotate-180')} />
					</Button>
				{/snippet}
			</CollapsibleTrigger>
			<CollapsibleContent class="space-y-3 pt-3">
				<Table>
					<TableHeader>
						<TableRow><TableHead>Verdict</TableHead><TableHead>Shown as</TableHead><TableHead>What it means</TableHead></TableRow>
					</TableHeader>
					<TableBody>
						{#each VERDICT_GUIDE as row (row.state)}
							<TableRow data-state={verdict.state === row.state ? 'selected' : undefined}>
								<TableCell class="font-medium whitespace-normal">
									{row.label}
									{#if verdict.state === row.state}<Badge variant="secondary" class="ml-2">This product</Badge>{/if}
								</TableCell>
								<TableCell><VerdictBadge kind={groupOfTone(row.tone)} /></TableCell>
								<TableCell class="text-muted-foreground whitespace-normal">{row.meaning}</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
				<p class="text-muted-foreground text-sm">{SAFETY_LIFT_NOTE}</p>
				<p class="text-sm">This product: <b>{verdict.headline}</b>. {verdict.detail}</p>
			</CollapsibleContent>
		</Collapsible>
	</CardContent>
</Card>
