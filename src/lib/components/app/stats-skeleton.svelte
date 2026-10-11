<script lang="ts">
	import { Card } from '#lib/components/ui/card/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
</script>

<div class="grid grid-cols-2 gap-4 lg:grid-cols-4" role="status" aria-label="Loading your numbers">
	{#each [1, 2, 3, 4] as n (n)}
		<Card class="gap-2 p-4"><Skeleton class="h-8 w-16" /><Skeleton class="h-4 w-28" /></Card>
	{/each}
</div>
