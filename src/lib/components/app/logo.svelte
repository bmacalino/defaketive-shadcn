<script lang="ts">
	import { cn } from '#lib/utils.js';

	let {
		href = '/',
		showName = true,
		class: className
	}: { href?: string; showName?: boolean; class?: string } = $props();
</script>

<!-- The mark is one solid dot, as in the DeFaketive Figma file. -->
<a {href} class={cn('tap inline-flex items-center gap-2 font-semibold tracking-tight', className)} aria-label="DeFaketive home">
	<span class="bg-primary size-5 shrink-0 rounded-full" aria-hidden="true"></span>
	{#if showName}<span>DeFaketive</span>{/if}
</a>
