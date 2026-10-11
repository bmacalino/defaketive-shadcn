<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		words,
		active,
		onpick
	}: {
		words: { word: string; category: string; count: number }[];
		active: string;
		onpick: (word: string) => void;
	} = $props();

	const top = $derived(words.slice(0, 6));
	const max = $derived(top[0]?.count || 1);
</script>

<Card>
	<CardHeader>
		<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Warning words</p>
		<CardTitle class="text-xl">Warning words found</CardTitle>
		<CardDescription>Words the check matched in these reviews. Pick one to see its reviews.</CardDescription>
	</CardHeader>
	<CardContent class="grid gap-3">
		{#each top as item (item.word)}
			<div class="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3">
				<Button
					variant={active === item.word ? 'secondary' : 'outline'}
					size="sm"
					class="justify-start truncate"
					aria-pressed={active === item.word}
					title="Show reviews that mention this"
					onclick={() => onpick(item.word)}>{item.word}</Button
				>
				<Progress value={(item.count / max) * 100} aria-label="{item.count} reviews" />
				<b class="text-sm tabular-nums">{item.count}×</b>
			</div>
		{:else}
			<p class="text-muted-foreground text-sm">The check matched no warning words in these reviews.</p>
		{/each}
	</CardContent>
</Card>
