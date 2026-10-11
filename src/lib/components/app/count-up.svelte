<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	// A number that counts up to its value. People who ask for less motion get the number at once.
	let { value, decimals = 0 }: { value: number; decimals?: number } = $props();

	const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const tween = new Tween(0, { duration: reduced ? 0 : 700, easing: cubicOut });
	$effect(() => {
		tween.set(Number(value) || 0);
	});
</script>

{tween.current.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
