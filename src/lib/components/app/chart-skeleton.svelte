<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
</script>

<div class="flex flex-wrap items-center gap-6" role="status" aria-label="Loading chart">
	<Skeleton class="size-40 rounded-full" />
	<div class="grid flex-1 gap-3">{#each [1, 2, 3, 4] as n (n)}<Skeleton class="h-4 w-full" />{/each}</div>
</div>
