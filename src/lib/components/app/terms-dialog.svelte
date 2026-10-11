<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		Dialog,
		DialogClose,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '#lib/components/ui/dialog/index.js';
	import { ui } from '#lib/stores/ui.svelte.js';
	import { tick } from 'svelte';

	let termsEl = $state<HTMLElement | null>(null);
	let privacyEl = $state<HTMLElement | null>(null);

	// Open at the section that was asked for.
	$effect(() => {
		if (!ui.termsOpen) return;
		const section = ui.termsSection;
		tick().then(() => (section === 'privacy' ? privacyEl : termsEl)?.scrollIntoView({ block: 'start' }));
	});
</script>

<Dialog bind:open={ui.termsOpen}>
	<DialogContent class="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
		<DialogHeader>
			<DialogTitle class="text-xl">Terms &amp; Privacy</DialogTitle>
			<DialogDescription>DeFaketive is a student research project.</DialogDescription>
		</DialogHeader>
		<section bind:this={termsEl} class="space-y-2">
			<h3 class="font-semibold">Terms of Use</h3>
			<p class="text-muted-foreground">
				DeFaketive is a student research project for academic use. Its warnings summarize what reviewers wrote; they are
				not proof that a product is fake, defective or unsafe. Decide for yourself before buying.
			</p>
			<p class="text-muted-foreground">Please don't misuse the service, for example by automating scans.</p>
		</section>
		<section bind:this={privacyEl} class="space-y-2">
			<h3 class="font-semibold">Privacy Policy</h3>
			<p class="text-muted-foreground">
				With an account, we keep your name, your email and a scrambled copy of your password. Your password itself is never
				stored. We also keep your scan history and wishlist so they follow you to any browser.
			</p>
			<p class="text-muted-foreground">For guests, we count scans per day using a browser cookie.</p>
			<p class="text-muted-foreground">
				We don't sell or share any of this. To delete your account, use Settings → Delete account, or email the team at
				<a class="underline underline-offset-4" href="mailto:bmacalino_20ur2047@psu.edu.ph">bmacalino_20ur2047@psu.edu.ph</a>.
			</p>
		</section>
		<DialogFooter>
			<DialogClose>
				{#snippet child({ props })}
					<Button {...props}>Close</Button>
				{/snippet}
			</DialogClose>
		</DialogFooter>
	</DialogContent>
</Dialog>
