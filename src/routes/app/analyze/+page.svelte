<script lang="ts">
	import { page } from '$app/state';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import LinkIcon from '@lucide/svelte/icons/link';
	import { onMount } from 'svelte';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card/index.js';
	import { InputGroup, InputGroupAddon, InputGroupInput } from '#lib/components/ui/input-group/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import ScanProgress from '#lib/components/app/scan-progress.svelte';
	import { RadioGroup, RadioGroupItem } from '#lib/components/ui/radio-group/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { LAZADA_REVIEWS_PER_STAR, linkIdentity, MARKETPLACES, queryContext, typicalScanTime } from '#lib/product.js';
	import { catalog } from '#lib/stores/catalog.svelte.js';
	import { library } from '#lib/stores/library.svelte.js';
	import { scan } from '#lib/stores/scan.svelte.js';
	import { ui } from '#lib/stores/ui.svelte.js';
	import type { Marketplace } from '#lib/types.js';

	let query = $state('');
	let marketplace = $state<Marketplace>('shopee');
	// The usual limits for a fresh scan: up to 6 products when searching by name, up to 100 reviews each
	// (Lazada reads up to 60 from each star level instead).
	const productCount = 6;
	const reviewCount = 100;

	// A link pasted on Home or the landing page arrives in the address.
	onMount(() => {
		const incoming = page.url.searchParams.get('q');
		if (incoming && !scan.busy) query = incoming;
		// "/" pressed on another page lands here with the bar ready to type in.
		if (ui.focusScan) {
			ui.focusScan = false;
			document.getElementById('search-query')?.focus();
		}
	});

	const context = $derived(queryContext(query));
	const hasQuery = $derived(query.trim() !== '');
	const unsupported = $derived(context.isUrl && !context.platform);
	const chosen = $derived<Marketplace>(context.platform ?? marketplace);
	const lazada = $derived(chosen === 'lazada');
	const match = $derived(
		context.platform
			? (catalog.lookup(query) ?? library.mine.find((product) => linkIdentity(product.link) === linkIdentity(query)))
			: null
	);
	const disabled = $derived(scan.busy || !hasQuery || unsupported);

	// What the main button does depends on what was pasted.
	const primary = $derived(
		context.platform && match
			? { intent: 'saved', label: 'Open report' }
			: context.platform
				? { intent: 'live', label: `Check this ${MARKETPLACES[context.platform]} product` }
				: hasQuery
					? { intent: 'saved', label: 'Search saved reports' }
					: { intent: 'saved', label: 'Check' }
	);
	const fresh = $derived(
		context.platform && match
			? 'Check again for new reviews'
			: !context.platform && hasQuery && !unsupported
				? 'Collect fresh reviews'
				: ''
	);

	const plan = $derived(
		lazada
			? `up to ${LAZADA_REVIEWS_PER_STAR} reviews from each star level`
			: `up to ${reviewCount} reviews each`
	);
	const products = $derived(context.platform ? 1 : productCount);
	const summary = $derived(
		hasQuery && !unsupported
			? `Fresh collection settings: ${MARKETPLACES[chosen]} · up to ${products} product${products === 1 ? '' : 's'} · ${plan}`
			: ''
	);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const intent = (event.submitter as HTMLElement | null)?.dataset.intent ?? primary.intent;
		scan.search({
			query,
			marketplace: chosen,
			live: intent === 'live',
			productCount,
			reviewCount
		});
	}

	const running = $derived(scan.summary?.state === 'running' && scan.busy);
	const stage = $derived(Math.min(3, Math.max(1, Number(scan.summary?.stage) || 1)));
	const progress = $derived(
		Number.isFinite(Number(scan.summary?.progress))
			? Math.min(100, Math.max(0, Number(scan.summary?.progress)))
			: ({ 1: 18, 2: 68, 3: 92 } as Record<number, number>)[stage]
	);
	// One product from a link takes a known time. A search by name scans several products, so nothing is promised there.
	const oneProduct = $derived(queryContext(scan.summary?.query ?? '').isUrl);
	const stepper = ['Paste a link', 'We read the reviews', 'Read your report'];
</script>

<svelte:head><title>Check a product · DeFaketive</title></svelte:head>

<header class="space-y-1">
	<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Before you buy</p>
	<h1 class="text-3xl font-semibold tracking-tight">Check a product</h1>
	<p class="text-muted-foreground">One product link. The review evidence you need to make a decision.</p>
</header>

<ol class="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="How a check works">
	{#each stepper as step, index (step)}
		<li class="flex items-center gap-2">
			<span class="bg-primary text-primary-foreground grid size-6 place-items-center rounded-full text-xs font-medium">{index + 1}</span>
			{step}
		</li>
	{/each}
</ol>

<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
	<Card>
		<CardHeader>
			<CardTitle>Paste a product link</CardTitle>
			<CardDescription>
				From Shopee PH, Lazada PH or Temu. You can also search saved reports by name.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form onsubmit={submit} class="grid gap-4" aria-describedby="scan-summary">
				<div class="grid gap-2">
					<Label for="search-query">Product link or product name</Label>
					<InputGroup class="h-11">
						<InputGroupAddon><LinkIcon /></InputGroupAddon>
						<InputGroupInput
							id="search-query"
							data-scan-input
							name="query"
							placeholder="Paste a product link..."
							autocomplete="off"
							bind:value={query}
							disabled={scan.busy}
							aria-invalid={unsupported}
						/>
						<InputGroupAddon align="inline-end" class="max-md:hidden"><Kbd title="Press / to jump here">/</Kbd></InputGroupAddon>
					</InputGroup>
					<p class="text-muted-foreground text-xs">Shopee PH · Lazada PH · Temu</p>
					{#if context.isUrl}
						<p class="flex items-center gap-1.5 text-sm {unsupported ? 'text-destructive' : 'text-success'}" aria-live="polite">
							{#if unsupported}
								<CircleAlertIcon class="size-4" /> This website is not supported. Paste a Shopee PH, Lazada PH, or Temu product link.
							{:else}
								<CheckIcon class="size-4" /> {MARKETPLACES[context.platform!]} product link detected.
							{/if}
						</p>
					{/if}
					{#if match}
						<p class="bg-muted rounded-lg px-3 py-2 text-sm" aria-live="polite">
							Saved report found: <span class="font-medium">{match.name || `${MARKETPLACES[context.platform!]} product`}</span>
						</p>
					{/if}
				</div>

				{#if hasQuery && !context.isUrl}
					<fieldset class="grid gap-2" disabled={scan.busy}>
						<legend class="mb-2 text-sm font-medium">Choose a marketplace</legend>
						<RadioGroup bind:value={marketplace} class="flex flex-wrap gap-2">
							{#each Object.entries(MARKETPLACES) as [key, label] (key)}
								<!-- The whole box is the label, so pressing anywhere in it picks the marketplace. -->
								<Label
									for="market-{key}"
									class="has-[[data-state=checked]]:border-primary flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 font-normal"
								>
									<RadioGroupItem value={key} id="market-{key}" />
									{label.replace(' PH', '')}
								</Label>
							{/each}
						</RadioGroup>
					</fieldset>
				{/if}

				<p id="scan-summary" class="text-muted-foreground text-xs" hidden={!summary}>{summary}</p>

				<div class="flex flex-wrap gap-2">
					<Button type="submit" size="lg" {disabled} data-intent={primary.intent}>
						{primary.label} <ArrowRightIcon />
					</Button>
					{#if fresh}
						<Button type="submit" size="lg" variant="outline" {disabled} data-intent="live">{fresh}</Button>
					{/if}
				</div>

				{#if scan.feedback}
					<Alert variant={scan.feedback.kind === 'error' ? 'destructive' : 'default'} class={scan.feedback.kind === 'warning' ? 'tone-caution border-(--tone)/50 bg-(--tone-soft) *:[svg]:text-(--tone)' : ''}>
						<CircleAlertIcon />
						<AlertTitle>{scan.feedback.title}</AlertTitle>
						<AlertDescription>{scan.feedback.message}</AlertDescription>
					</Alert>
				{/if}

				{#if running}
					<div class="bg-muted/50 grid gap-3 rounded-lg border p-4" role="status" aria-live="polite">
						<div class="flex items-center gap-3">
							<Spinner class="size-5" />
							<div class="flex flex-1 items-center justify-between gap-2">
								<b class="text-sm">
									{scan.summary?.platform
										? `${MARKETPLACES[scan.summary.platform as Marketplace] ?? scan.summary.platform} live scan`
										: 'Live scan running'}
								</b>
								<span class="text-muted-foreground text-xs tabular-nums">{scan.elapsed}</span>
							</div>
						</div>
						{#if scan.summary?.needs_you}
							<Alert class="tone-caution border-(--tone)/50 bg-(--tone-soft) *:[svg]:text-(--tone)">
								<CircleAlertIcon />
								<AlertTitle>This scan needs you</AlertTitle>
								<AlertDescription>{scan.summary.message}</AlertDescription>
							</Alert>
						{:else}
							<p class="text-muted-foreground text-sm">{scan.summary?.message || 'Preparing…'}</p>
						{/if}
						<ScanProgress {stage} {progress} />
						{#if oneProduct}<p class="text-muted-foreground text-xs">A scan of one product usually takes {typicalScanTime(scan.summary?.platform)}.</p>{/if}
					</div>
				{/if}

				<p class="text-muted-foreground text-xs">
					{scan.busy
						? 'You can browse your workspace while this scan runs. The bell at the top tells you when it is done.'
						: 'Results are based on a sample of public reviews. Collection time varies by marketplace.'}
				</p>
			</form>
		</CardContent>
	</Card>

	<aside class="space-y-4">
		<Card>
			<CardHeader><CardTitle>What happens next?</CardTitle></CardHeader>
			<CardContent class="text-muted-foreground space-y-3 text-sm">
				<p>
					We detect the marketplace and collect a sample of public reviews. Your report gives a plain verdict, quotes what
					reviewers reported, and shows every review behind it.
				</p>
				<h3 class="text-foreground font-medium">Already checked this product?</h3>
				<p>Open its report straight away, or check it again for new reviews.</p>
				<a class="tap text-primary inline-flex items-center gap-1 font-medium underline underline-offset-4" href="/app/history">Find a saved report <ArrowRightIcon class="size-4" /></a>
				<p class="text-xs">
					Some marketplaces may ask you to log in or complete a CAPTCHA during collection. If that happens, a Chrome
					window opens for it and this page tells you.
				</p>
			</CardContent>
		</Card>
	</aside>
</div>
