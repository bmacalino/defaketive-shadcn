<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { cn } from '#lib/utils.js';

	// How far a live scan has got: three steps that tick off, and a bar with a light sweep while it works.
	// `compact` shows just the bar and one line, for the Home card.
	let {
		stage,
		progress,
		running = true,
		compact = false,
		class: className
	}: { stage: number; progress: number; running?: boolean; compact?: boolean; class?: string } = $props();

	const steps = ['Collect', 'Read', 'Report'];
</script>

<div class={cn('grid gap-3', className)}>
	{#if !compact}
		<ol class="flex items-center" aria-label="Scan stages">
			{#each steps as label, index (label)}
				{@const n = index + 1}
				{@const done = n < stage}
				{@const current = n === stage}
				<li class="flex items-center {index < steps.length - 1 ? 'flex-1' : ''}" aria-current={current ? 'step' : undefined}>
					<span class="relative grid size-7 shrink-0 place-items-center">
						{#if current && running}
							<span class="bg-primary/30 absolute inset-0 rounded-full" style="animation: ping-once 1.4s ease-out infinite" aria-hidden="true"></span>
						{/if}
						<span
							class={cn(
								'relative grid size-7 place-items-center rounded-full border text-xs font-medium transition-colors duration-300',
								done && 'bg-primary text-primary-foreground border-primary',
								current && 'border-primary text-foreground border-2',
								!done && !current && 'text-muted-foreground'
							)}
						>
							{#if done}<CheckIcon class="pop size-4" />{:else}{n}{/if}
						</span>
					</span>
					<span class={cn('ml-2 text-xs', current ? 'text-foreground font-semibold' : done ? 'text-foreground' : 'text-muted-foreground')}>
						{done ? '✓ ' : ''}{label}
					</span>
					{#if index < steps.length - 1}
						<span class="bg-muted relative mx-3 h-0.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
							<span class="bg-primary absolute inset-y-0 left-0 transition-[width] duration-700 ease-out" style="width: {done ? 100 : 0}%"></span>
						</span>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
	<div
		class="bg-muted relative h-1.5 w-full overflow-hidden rounded-full"
		role="progressbar"
		aria-label="Scan progress"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(progress)}
	>
		<div class="bg-primary relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out" style="width: {progress}%">
			{#if running}<div class="shimmer absolute inset-0"></div>{/if}
		</div>
	</div>
	{#if compact}
		<p class="text-muted-foreground text-xs">Step {Math.min(stage, 3)} of 3 · {steps[Math.min(stage, 3) - 1]}</p>
	{/if}
</div>
