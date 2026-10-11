<script lang="ts">
	import ImageOffIcon from '@lucide/svelte/icons/image-off';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	// A product photo that eases in. While it loads there is a soft colour wash (different for each product),
	// and if there is no photo, or it fails, a calm "No photo" tile takes its place.
	let {
		src = '',
		name = '',
		compact = false,
		class: className,
		children
	}: { src?: string; name?: string; compact?: boolean; class?: string; children?: Snippet } = $props();

	let loaded = $state(false);
	let failed = $state(false);

	// A new address starts over.
	$effect(() => {
		src;
		loaded = false;
		failed = false;
	});

	const hue = $derived.by(() => {
		let h = 0;
		for (const char of name || src) h = (h * 31 + char.charCodeAt(0)) % 360;
		return h;
	});
	const usable = $derived(Boolean(src) && !failed);
</script>

<div class={cn('photo-ph relative overflow-hidden', !loaded && usable && 'photo-sweep', className)} style="--h: {hue}">
	{#if usable}
		<img
			{src}
			alt=""
			loading="lazy"
			decoding="async"
			class={cn('size-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
			onload={() => (loaded = true)}
			onerror={() => (failed = true)}
		/>
	{:else}
		<div class="text-foreground/70 absolute inset-0 grid place-content-center justify-items-center gap-1 text-center text-xs">
			<ImageOffIcon class={compact ? 'size-4' : 'size-6'} aria-hidden="true" />
			{#if !compact}<span>No photo</span>{/if}
		</div>
	{/if}
	{@render children?.()}
</div>
