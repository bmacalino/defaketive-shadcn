<script lang="ts">
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { cn } from '#lib/utils.js';

	// The same shape as a product card, so nothing jumps when the real ones arrive.
	let { class: className }: { class?: string } = $props();
</script>

<Card class={cn('gap-0 py-0', className)} aria-hidden="true">
	<Skeleton class="aspect-[4/3] w-full rounded-none" />
	<CardContent class="gap-3 p-4">
		<div class="flex items-center justify-between"><Skeleton class="h-5 w-20 rounded-full" /><Skeleton class="size-7 rounded-md" /></div>
		<Skeleton class="h-4 w-full" />
		<Skeleton class="h-4 w-2/3" />
		<div class="flex items-center justify-between pt-1"><Skeleton class="h-5 w-16" /><Skeleton class="h-4 w-24" /></div>
	</CardContent>
</Card>
