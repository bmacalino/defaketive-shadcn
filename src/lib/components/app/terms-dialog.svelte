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
				DeFaketive is a free student research project for academic use, not a business. It is not affiliated with Lazada;
				Lazada is a trademark of its owner.
			</p>
			<p class="text-muted-foreground">
				Reports summarize what reviewers wrote on Lazada and quote short parts of their reviews. They are not proof that a
				product is fake, defective or unsafe. Decide for yourself before buying.
			</p>
			<p class="text-muted-foreground">
				Please don't misuse the service: no automated or bulk checks, and no attempts to get around the daily limits on new
				checks. The service may pause, or end when the study ends.
			</p>
			<p class="text-muted-foreground">
				Do you sell a product we report on, or did you write a review we quote? Email us to have a report or a quote looked at
				or removed.
			</p>
		</section>
		<section bind:this={privacyEl} class="space-y-2">
			<h3 class="font-semibold">Privacy Policy</h3>
			<p class="text-muted-foreground">
				With an account, we keep your name, your email and a scrambled copy of your password. Your password itself is never
				stored. We also keep your scan history and wishlist so they follow you to any browser.
			</p>
			<p class="text-muted-foreground">
				For guests, we count scans per day using a browser cookie. To keep the daily limits fair, we also count new checks per
				internet connection. For that we store a scrambled code made from the connection's address, never the address
				itself, and we delete these counts after a week.
			</p>
			<p class="text-muted-foreground">
				Reports quote public Lazada reviews. We don't show or share the reviewers' names.
			</p>
			<p class="text-muted-foreground">
				A partner government office, the Department of Trade and Industry (DTI), may be given a view of the saved reports
				to look into safety problems. It sees the same reports anyone can open, without reviewers' names, and nothing
				about your account.
			</p>
			<p class="text-muted-foreground">
				We use this information to run DeFaketive and, only as overall numbers, for our study. We don't sell or share it. We
				keep it until you delete your account, or until the project ends, when we delete it.
			</p>
			<p class="text-muted-foreground">
				Under the Data Privacy Act of 2012 you can ask to see, correct or delete your information. To delete your account, use
				Settings → Delete account. For anything else, email the team at
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
