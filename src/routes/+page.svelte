<script lang="ts">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import BoxesIcon from '@lucide/svelte/icons/boxes';
	import FileSearchIcon from '@lucide/svelte/icons/file-search';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import { onMount } from 'svelte';
	import CountUp from '#lib/components/app/count-up.svelte';
	import FaqList from '#lib/components/app/faq-list.svelte';
	import ScanStartForm from '#lib/components/app/scan-start-form.svelte';
	import SiteFooter from '#lib/components/app/site-footer.svelte';
	import SiteHeader from '#lib/components/app/site-header.svelte';
	import TeamGrid from '#lib/components/app/team-grid.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { catalog } from '#lib/stores/catalog.svelte.js';

	onMount(() => {
		catalog.loadStats();
	});

	const features = [
		{ icon: LanguagesIcon, title: 'Taglish-aware sentiment', text: 'A language model trained on Filipino and English reviews sorts each review as positive, negative, or mixed or unclear.' },
		{ icon: FileSearchIcon, title: 'Separate warnings', text: 'Safety, fake and defect reports are checked one by one, so good reviews never average away a fire report.' },
		{ icon: GlobeIcon, title: 'Multi-platform coverage', text: 'Collects public reviews straight from Shopee PH, Lazada PH and Temu PH product pages.' },
		{ icon: BoxesIcon, title: 'Similar products', text: 'When reviewers report problems, see similar products whose reviews raised no warnings.' }
	];
	const steps = [
		['Paste link', 'Copy any gadget link from Shopee PH, Lazada PH or Temu PH.'],
		['We read the reviews', 'We collect the reviews and read every one, looking for words like peke, sira and umusok.'],
		['Read the verdict', 'A plain verdict on safety, fakes and defects, with the exact reviews behind it.'],
		['Shop smarter', 'If reviewers report problems, compare similar products with no warnings.']
	];
	const platforms = ['Shopee', 'Lazada', 'Temu'];
</script>

<svelte:head><title>DeFaketive · See what buyers report before you buy</title></svelte:head>

<SiteHeader />

<main class="page-view">
	<section class="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center" aria-labelledby="landing-title">
		<div class="space-y-6">
			<p class="text-muted-foreground text-sm font-medium">Real reviews · Real buyers · Their own words</p>
			<h1 id="landing-title" class="text-4xl font-semibold tracking-tight text-balance md:text-6xl">See what buyers report before you buy</h1>
			<p class="text-muted-foreground max-w-xl text-lg">
				DeFaketive reads customer reviews from Shopee, Lazada and Temu PH (in English, Filipino or Taglish) and shows you
				what buyers report about fakes, defects and safety problems, in their own words.
			</p>
			<div class="flex flex-wrap items-center gap-3">
				<Button size="lg" href={auth.user ? '/app/analyze' : '/scan'}>Try it free</Button>
				<Button size="lg" variant="outline" href="#how"><ArrowDownIcon /> How it works</Button>
			</div>
			<p class="text-muted-foreground text-sm">No sign up required</p>
		</div>
		<Card class="p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold tracking-wide uppercase">Check a product</h2>
			</div>
			<ScanStartForm placeholder="Paste a product link..." target={auth.user ? '/app/analyze' : '/scan'} />
		</Card>
	</section>

	<!-- The numbers are real, from the server. If they can't be fetched the strip is left out, not left loading. -->
	<section class={['border-y', catalog.statsFailed && !catalog.stats && 'hidden']} aria-label="DeFaketive in numbers">
		<dl class="mx-auto grid w-full max-w-6xl grid-cols-3 gap-4 px-4 py-8 text-center md:px-6">
			{#if catalog.stats}
				<div><dd class="text-3xl font-semibold tabular-nums"><CountUp value={catalog.stats.marketplaces} /></dd><dt class="text-muted-foreground text-sm">Marketplaces supported</dt></div>
				<div><dd class="text-3xl font-semibold tabular-nums"><CountUp value={catalog.stats.products} /></dd><dt class="text-muted-foreground text-sm">Products checked</dt></div>
				<div><dd class="text-3xl font-semibold tabular-nums"><CountUp value={catalog.stats.reviews} /></dd><dt class="text-muted-foreground text-sm">Reviews analyzed</dt></div>
			{:else}
				{#each [1, 2, 3] as n (n)}<Skeleton class="mx-auto h-14 w-32" />{/each}
			{/if}
		</dl>
	</section>

	<section class="mx-auto w-full max-w-6xl space-y-8 px-4 py-16 md:px-6" aria-labelledby="features-title">
		<h2 id="features-title" class="text-3xl font-semibold tracking-tight">Built for a safer tomorrow</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each features as feature (feature.title)}
				<Card class="gap-3 p-5">
					<feature.icon class="size-6" aria-hidden="true" />
					<h3 class="font-semibold">{feature.title}</h3>
					<p class="text-muted-foreground text-sm">{feature.text}</p>
				</Card>
			{/each}
		</div>
	</section>

	<section id="how" class="bg-muted/40 border-y" aria-labelledby="how-title">
		<div class="mx-auto w-full max-w-6xl space-y-8 px-4 py-16 md:px-6">
			<div class="space-y-1">
				<h2 id="how-title" class="text-3xl font-semibold tracking-tight">How it works</h2>
				<p class="text-muted-foreground">Four simple steps from link to evidence.</p>
			</div>
			<ol class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each steps as [title, text], index (title)}
					<li>
						<Card class="h-full gap-2 p-5">
							<span class="text-muted-foreground text-sm font-medium">0{index + 1}</span>
							<h3 class="font-semibold">{title}</h3>
							<p class="text-muted-foreground text-sm">{text}</p>
						</Card>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<section class="mx-auto w-full max-w-6xl space-y-4 px-4 py-16 md:px-6" aria-labelledby="platforms-title">
		<h2 id="platforms-title" class="text-sm font-semibold tracking-wide uppercase">Supported platforms</h2>
		<ul class="flex flex-wrap gap-3">
			{#each platforms as platform (platform)}
				<li class="rounded-full border px-4 py-1.5 text-sm font-medium">{platform}</li>
			{/each}
		</ul>
	</section>

	<section id="faq" class="mx-auto w-full max-w-3xl space-y-6 px-4 py-16 md:px-6" aria-labelledby="faq-title">
		<h2 id="faq-title" class="text-3xl font-semibold tracking-tight">Common questions</h2>
		<FaqList value="q4" />
	</section>

	<section id="about" class="bg-muted/40 border-t" aria-labelledby="about-title">
		<div class="mx-auto w-full max-w-6xl space-y-6 px-4 py-16 md:px-6">
			<div class="space-y-1">
				<h2 id="about-title" class="text-3xl font-semibold tracking-tight">The minds behind a safer shopping experience</h2>
				<p class="text-muted-foreground">Pangasinan State University – Urdaneta City Campus · BS Information Technology · May 2026</p>
			</div>
			<TeamGrid />
		</div>
	</section>
</main>

<SiteFooter />
