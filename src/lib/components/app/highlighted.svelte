<script lang="ts">
	// Text with the matched words picked out. Plain text nodes only, so a review can't inject markup.
	// The highlighter is amber, never red: red is kept for serious or repeated safety reports.
	let { pieces }: { pieces: { text: string; mark: boolean }[] } = $props();
</script>

{#each pieces as piece, index (index)}{#if piece.mark}<mark class="bg-warning/25 text-foreground rounded-sm px-0.5 font-medium">{piece.text}</mark>{:else}{piece.text}{/if}{/each}
