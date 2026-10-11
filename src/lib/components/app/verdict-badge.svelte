<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { chipFor, GROUP_NAMES, type ChipKind } from '#lib/product.js';
	import type { Product } from '#lib/types.js';
	import { cn } from '#lib/utils.js';

	// Give it a product to show that product's group, or a `kind` to show a group by itself (in a legend).
	let { product, kind, class: className }: { product?: Product | null; kind?: ChipKind; class?: string } = $props();

	const chip = $derived(kind ? { kind, label: GROUP_NAMES[kind] } : chipFor(product));
</script>

<!--
	The tint and the border come from the verdict group (.tone-* in layout.css). The words stay the normal text
	colour, so they are always easy to read; the icon carries the hue, and its shape differs for each group.
-->
<Badge variant="outline" class={cn('tone-' + chip.kind, 'border-(--tone)/45 bg-(--tone-soft) text-foreground [&>svg]:text-(--tone)', className)}>
	{#if chip.kind === 'safety'}<TriangleAlertIcon />
	{:else if chip.kind === 'caution'}<CircleAlertIcon />
	{:else if chip.kind === 'clear'}<CircleCheckIcon />
	{:else}<CircleHelpIcon />{/if}
	{chip.label}
</Badge>
