<script lang="ts">
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { boot } from '#lib/boot.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { catalog } from '#lib/stores/catalog.svelte.js';

	// Shown on every page when the server did not answer. It says so plainly and offers one thing to do.
	// It is plain grey on purpose: colour is kept for verdicts.
	let busy = $state(false);

	async function retry() {
		busy = true;
		try {
			await boot();
			// The landing page's numbers, if they were missed the first time.
			if (catalog.statsFailed) await catalog.loadStats();
		} finally {
			busy = false;
		}
	}
</script>

{#if auth.unreachable}
	<div role="alert" class="bg-muted text-foreground relative z-50 border-b">
		<div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm md:px-6">
			<WifiOffIcon class="size-4 shrink-0" aria-hidden="true" />
			<p class="min-w-0 flex-1">
				<b class="font-semibold">Can't reach the DeFaketive server.</b> Check that it is running, then try again.
			</p>
			<Button size="sm" variant="outline" onclick={retry} disabled={busy}>
				{#if busy}<Spinner />{/if}
				Try again
			</Button>
		</div>
	</div>
{/if}
