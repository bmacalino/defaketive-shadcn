<script lang="ts">
	import { cn } from '#lib/utils.js';

	// Small line drawings for empty screens. They use the text colour, so they follow light and dark.
	let {
		kind,
		class: className
	}: { kind: 'search' | 'history' | 'heart' | 'scan' | 'error' | 'reviews'; class?: string } = $props();
</script>

<svg
	viewBox="0 0 160 112"
	fill="none"
	stroke="currentColor"
	stroke-width="2.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={cn('float text-foreground/70 h-28 w-40', className)}
	aria-hidden="true"
>
	{#if kind === 'search'}
		<rect x="22" y="58" width="34" height="34" rx="6" class="fill-muted stroke-foreground/30" />
		<rect x="62" y="44" width="34" height="48" rx="6" class="fill-muted stroke-foreground/30" />
		<rect x="102" y="66" width="34" height="26" rx="6" class="fill-muted stroke-foreground/30" />
		<circle cx="88" cy="40" r="19" class="fill-background" />
		<path d="M102 54 L118 70" />
		<path d="M80 40h16" />
	{:else if kind === 'history'}
		<circle cx="80" cy="54" r="34" class="fill-muted stroke-foreground/30" />
		<path d="M80 34v20l14 9" />
		<path d="M44 38 L36 30 M36 30 L36 42 M36 30 L48 30" class="stroke-foreground/40" />
		<path d="M50 100h60" class="stroke-foreground/20" />
	{:else if kind === 'heart'}
		<path d="M80 92 C40 66 36 40 56 32 C68 28 76 34 80 42 C84 34 92 28 104 32 C124 40 120 66 80 92Z" class="fill-muted stroke-foreground/50" />
		<path d="M120 28v12 M114 34h12" class="stroke-foreground/40" />
		<path d="M36 82v8 M32 86h8" class="stroke-foreground/30" />
	{:else if kind === 'scan'}
		<path d="M44 38v-8a6 6 0 0 1 6-6h8 M116 38v-8a6 6 0 0 0-6-6h-8 M44 74v8a6 6 0 0 0 6 6h8 M116 74v8a6 6 0 0 1-6 6h-8" class="stroke-foreground/50" />
		<rect x="60" y="40" width="40" height="32" rx="6" class="fill-muted stroke-foreground/30" />
		<path d="M44 56h72" />
	{:else if kind === 'reviews'}
		<rect x="30" y="26" width="76" height="44" rx="8" class="fill-muted stroke-foreground/30" />
		<path d="M44 42h48 M44 54h30" class="stroke-foreground/40" />
		<path d="M106 62h14a8 8 0 0 1 8 8v12l-10-8h-12" class="fill-background" />
		<circle cx="124" cy="32" r="6" class="stroke-foreground/30" />
	{:else}
		<path d="M80 22 L128 92 H32 Z" class="fill-muted stroke-foreground/40" />
		<path d="M80 50v22" />
		<circle cx="80" cy="82" r="1.5" fill="currentColor" />
	{/if}
</svg>
