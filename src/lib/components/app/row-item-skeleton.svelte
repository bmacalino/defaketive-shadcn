<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
</script>

<div class="flex items-center gap-4 p-4" aria-hidden="true">
	<Skeleton class="size-16 shrink-0 rounded-lg" />
	<div class="hidden w-16 space-y-2 sm:block"><Skeleton class="h-3 w-12" /><Skeleton class="h-3 w-10" /></div>
	<div class="flex-1 space-y-2.5">
		<Skeleton class="h-4 w-3/4" />
		<div class="flex gap-2"><Skeleton class="h-5 w-20 rounded-full" /><Skeleton class="h-5 w-24 rounded-full" /></div>
	</div>
	<Skeleton class="hidden h-5 w-16 sm:block" />
	<Skeleton class="size-9 rounded-md" />
</div>
