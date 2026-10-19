<script lang="ts">
	import { goto } from '$app/navigation';
	import ExtensionGuide from '#lib/components/app/extension-guide.svelte';
	import SiteFooter from '#lib/components/app/site-footer.svelte';
	import SiteHeader from '#lib/components/app/site-header.svelte';
	import { auth } from '#lib/stores/auth.svelte.js';

	// The extension guide on the public site. Someone signed in gets the same page inside the app.
	$effect(() => {
		if (auth.ready && auth.user) goto('/app/extension', { replaceState: true });
	});
</script>

<svelte:head><title>Get the extension · DeFaketive</title></svelte:head>

<div class="flex min-h-svh flex-col">
	<SiteHeader />
	<main class="page-view mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 md:px-6">
		<ExtensionGuide />
	</main>
	<SiteFooter />
</div>
