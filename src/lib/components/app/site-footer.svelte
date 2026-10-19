<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { ui } from '#lib/stores/ui.svelte.js';
	import Logo from './logo.svelte';

	// `compact` is the one-line footer under the app's pages: the menu already holds everything else, and on a phone
	// the full footer was a whole extra screen under a short page like Settings.
	let { compact = false }: { compact?: boolean } = $props();

	// Inside the app the links open app pages. On the public site they stay on the public site,
	// so a guest is never dropped into the main app.
	const inApp = $derived(page.url.pathname.startsWith('/app'));
	const analyzeHref = $derived(inApp || auth.user ? '/app/analyze' : '/scan');
	const link = 'tap text-muted-foreground hover:text-foreground';
</script>

{#if compact}
	<footer class="border-t px-4 py-4 md:px-6 lg:px-8">
		<div class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs">
			<p class="text-muted-foreground">© 2026 DeFaketive · For academic use only</p>
			<nav class="flex flex-wrap gap-x-4" aria-label="Footer">
				<a class={link} href={inApp ? '/app/faq' : '/#faq'}>How verdicts work</a>
				<a class={link} href={inApp ? '/app/about' : '/#about'}>About the team</a>
				<a class={link} href="mailto:bmacalino_20ur2047@psu.edu.ph">Contact</a>
				<button type="button" class={link} onclick={() => ui.openTerms('privacy')}>Privacy</button>
				<button type="button" class={link} onclick={() => ui.openTerms('terms')}>Terms</button>
			</nav>
		</div>
	</footer>
{:else}
	<footer class="border-t px-4 py-8 md:px-6 lg:px-8">
		<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 md:flex-row md:justify-between">
			<div class="max-w-md space-y-3">
				<Logo />
				<p class="text-muted-foreground text-sm">
					A capstone research project from Pangasinan State University – Urdaneta City Campus. Checks Filipino e-commerce
					reviews for reports of counterfeit, defective and unsafe gadgets.
				</p>
			</div>
			<nav class="flex flex-wrap gap-x-10 gap-y-3 text-sm" aria-label="Footer">
				<div class="flex flex-col gap-2">
					<span class="font-medium">Product</span>
					<a class={link} href={analyzeHref}>Check a product</a>
					<a class={link} href={inApp ? '/app/faq' : '/#faq'}>How verdicts work</a>
				</div>
				<div class="flex flex-col gap-2">
					<span class="font-medium">About</span>
					<a class={link} href={inApp ? '/app/about' : '/#about'}>About the team</a>
					<a class={link} href="mailto:bmacalino_20ur2047@psu.edu.ph">Contact</a>
				</div>
				<div class="flex flex-col gap-2">
					<span class="font-medium">Legal</span>
					<button type="button" class="{link} text-left" onclick={() => ui.openTerms('privacy')}>Privacy policy</button>
					<button type="button" class="{link} text-left" onclick={() => ui.openTerms('terms')}>Terms of use</button>
				</div>
			</nav>
		</div>
		<p class="text-muted-foreground mx-auto mt-6 w-full max-w-6xl text-xs">© 2026 DeFaketive · For academic use only</p>
	</footer>
{/if}
