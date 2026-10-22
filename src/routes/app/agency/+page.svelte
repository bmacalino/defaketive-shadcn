<script lang="ts">
	import { page } from '$app/state';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { toast } from 'svelte-sonner';
	import AgencyCaseControls from '#lib/components/agency/agency-case.svelte';
	import AgencyOverview from '#lib/components/agency/agency-overview.svelte';
	import AgencySellerList from '#lib/components/agency/agency-sellers.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import Highlighted from '#lib/components/app/highlighted.svelte';
	import ProductImage from '#lib/components/app/product-image.svelte';
	import RowItemSkeleton from '#lib/components/app/row-item-skeleton.svelte';
	import VerdictBadge from '#lib/components/app/verdict-badge.svelte';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '#lib/components/ui/tabs/index.js';
	import { ToggleGroup, ToggleGroupItem } from '#lib/components/ui/toggle-group/index.js';
	import { STATUSES } from '#lib/agency.js';
	import { api, ApiError, json } from '#lib/api.js';
	import { evidenceHref, reportHref } from '#lib/nav.js';
	import { accuracyCopy, dateText, money, segments } from '#lib/product.js';
	import { agency, AGENCY_REFUSED } from '#lib/stores/agency.svelte.js';
	import type { AgencyCase, AgencyLevel, AgencyPatterns, AgencyRow, AgencySellers, AgencyWatch } from '#lib/types.js';

	// The saved reports arranged for a partner agency (agency_api.py). The server decides who may see them and
	// words every verdict; this page only lays them out. Everything here says what buyers report, never that a
	// product is unsafe or that a seller broke a rule.
	const LEVELS: { value: AgencyLevel; label: string; meaning: string }[] = [
		{
			value: 'reports',
			label: 'Safety reports',
			meaning: "The check's most serious level: buyers report fire, smoke, shocks or burns, more than once or very clearly."
		},
		{
			value: 'mentions',
			label: 'Safety mentions',
			meaning: 'Some reviews mention a safety problem, below that level. Worth a look, with more care.'
		}
	];
	const TABS = ['watch', 'overview', 'sellers'];

	// ?tab= keeps a tab across a reload; the first version called the Overview "kinds".
	const asked = page.url.searchParams.get('tab');
	let tab = $state(asked === 'kinds' ? 'overview' : TABS.includes(asked ?? '') ? asked! : 'watch');
	let level = $state<AgencyLevel>('reports');
	// Pressing the filter that is already on switches it off; keep one on.
	let shownLevel: AgencyLevel = 'reports';
	$effect(() => {
		if (level) shownLevel = level;
		else level = shownLevel;
	});
	// "all", or one of the statuses ("none" is "No status": the menu cannot hold an empty value).
	let statusFilter = $state('all');
	const STATUS_FILTERS = [{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s.value || 'none', label: s.label }))];

	let watch = $state<Record<AgencyLevel, AgencyWatch | null>>({ reports: null, mentions: null });
	let patterns = $state<AgencyPatterns | null>(null);
	let sellers = $state<AgencySellers | null>(null);
	let status = $state<'loading' | 'ready' | 'refused' | 'error'>('loading');
	let marking = $state(false);

	async function load() {
		status = 'loading';
		try {
			const [reports, mentions, kinds, bySeller] = await Promise.all([
				api<AgencyWatch>('/api/agency/watch?level=reports'),
				api<AgencyWatch>('/api/agency/watch?level=mentions'),
				api<AgencyPatterns>('/api/agency/patterns'),
				api<AgencySellers>('/api/agency/sellers')
			]);
			watch = { reports, mentions };
			patterns = kinds;
			sellers = bySeller;
			agency.newCount = reports.new;
			status = 'ready';
		} catch (error) {
			if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
				status = 'refused';
			} else {
				status = 'error';
			}
		}
	}
	load();

	const current = $derived(watch[level]);
	const allRows = $derived(current?.rows ?? []);
	const rows = $derived(
		statusFilter === 'all' ? allRows : allRows.filter((row) => (row.case?.status || 'none') === statusFilter)
	);
	const fresh = $derived(allRows.filter((row) => row.new).length);
	const note = $derived(watch.reports?.note ?? '');
	const accuracy = $derived(watch.reports?.accuracy ?? null);

	async function markAllSeen() {
		marking = true;
		try {
			const answer = await api<{ marked: number; new: Record<AgencyLevel, number> }>('/api/agency/seen', json('POST', { level }));
			const shown = watch[level];
			if (shown) shown.rows = shown.rows.map((row) => ({ ...row, new: false }));
			for (const value of ['reports', 'mentions'] as const) {
				const list = watch[value];
				if (list) list.new = answer.new;
			}
			agency.newCount = answer.new;
			toast(`${answer.marked} listing${answer.marked === 1 ? '' : 's'} marked as seen.`);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			marking = false;
		}
	}

	/** Keep the list in step with a saved status or note, so the status filter is right. */
	function saved(link: string, value: AgencyCase | null) {
		for (const list of [watch.reports, watch.mentions]) {
			const row = list?.rows.find((item) => item.link === link);
			if (row) row.case = value;
		}
	}

	const count = (value: number) => value.toLocaleString();
	const statusName = $derived(STATUS_FILTERS.find((s) => s.value === statusFilter)?.label ?? 'All statuses');
</script>

<svelte:head><title>{agency.title} · DeFaketive</title></svelte:head>

<header class="space-y-1">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-3xl font-semibold tracking-tight">{agency.title}</h1>
		{#if agency.member}
			<Button variant="outline" size="sm" onclick={() => (agency.guideOpen = true)}><CompassIcon /> Get started</Button>
		{/if}
	</div>
	<p class="text-muted-foreground">
		Lazada listings whose buyers report safety problems, arranged for the {agency.officeName || 'partner agency'}. Open a
		listing's evidence sheet to print it or save it as a PDF.
	</p>
</header>

{#if status === 'loading'}
	<Card class="gap-0 divide-y py-0" role="status" aria-label="Loading the watch list">
		{#each [1, 2, 3] as n (n)}<RowItemSkeleton />{/each}
	</Card>
{:else if status === 'refused'}
	<EmptyState art="search" title="This page is for partner agencies" description={AGENCY_REFUSED}>
		{#snippet actions()}<Button href="/app/home">Go to Home</Button>{/snippet}
	</EmptyState>
{:else if status === 'error'}
	<EmptyState art="error" title="The watch list couldn't be loaded" description="The server didn't answer. Nothing was changed.">
		{#snippet actions()}<Button onclick={load}>Try again</Button>{/snippet}
	</EmptyState>
{:else}
	<Alert>
		<InfoIcon />
		<AlertTitle>How to read this list</AlertTitle>
		<AlertDescription class="space-y-2">
			<p>{note}</p>
			<p>{accuracyCopy(accuracy)}</p>
		</AlertDescription>
	</Alert>

	<Tabs bind:value={tab} class="gap-6">
		<TabsList class="w-full sm:w-fit">
			<TabsTrigger value="watch">Watch list</TabsTrigger>
			<TabsTrigger value="overview">Overview</TabsTrigger>
			<TabsTrigger value="sellers">Sellers</TabsTrigger>
		</TabsList>

		<TabsContent value="watch" class="space-y-4">
			<h2 class="sr-only">Watch list</h2>
			<div class="flex flex-wrap items-center gap-3">
				<ToggleGroup type="single" variant="outline" bind:value={level} aria-label="Which listings to show" class="flex-wrap">
					{#each LEVELS as option (option.value)}
						<ToggleGroupItem value={option.value} aria-label="{option.label}, {watch[option.value]?.rows.length ?? 0} listings">
							{option.label} · {watch[option.value]?.rows.length ?? 0}
						</ToggleGroupItem>
					{/each}
				</ToggleGroup>
				<Select.Root type="single" bind:value={statusFilter}>
					<Select.Trigger id="status-filter" class="w-full sm:w-44"><span class="sr-only">Show by your status: </span>{statusName}</Select.Trigger>
					<Select.Content>
						{#each STATUS_FILTERS as option (option.value)}<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
				<div class="flex flex-wrap items-center gap-2 sm:ml-auto">
					<span class="text-muted-foreground text-sm" aria-live="polite">{fresh ? `${count(fresh)} new` : 'Nothing new'}</span>
					<Button variant="outline" size="sm" disabled={!fresh || marking} onclick={markAllSeen}>
						<CheckCheckIcon /> Mark all as seen
					</Button>
					<Button variant="outline" size="sm" href="/api/agency/watch.csv?level={level}" download>
						<DownloadIcon /> Download spreadsheet
					</Button>
				</div>
			</div>
			<p class="text-muted-foreground text-sm">{LEVELS.find((option) => option.value === level)?.meaning} Newest report first.</p>

			{#if !rows.length}
				{#if allRows.length}
					<EmptyState art="search" title="No listings with this status" description="None of the listings at this level has the status you picked.">
						{#snippet actions()}<Button variant="outline" onclick={() => (statusFilter = 'all')}>Show all statuses</Button>{/snippet}
					</EmptyState>
				{:else}
					<EmptyState
						art="reviews"
						title="No listings at this level"
						description="None of the Lazada listings DeFaketive has checked are at this level right now."
					/>
				{/if}
			{:else}
				<Card class="gap-0 divide-y py-0">
					{#each rows as row, index (row.link)}
						{@render listing(row, index)}
					{/each}
				</Card>
			{/if}
		</TabsContent>

		<TabsContent value="overview" class="space-y-6">
			<h2 class="sr-only">Overview</h2>
			{#if patterns}<AgencyOverview {patterns} />{/if}
		</TabsContent>

		<TabsContent value="sellers" class="space-y-4">
			<h2 class="sr-only">Sellers with more than one flagged listing</h2>
			{#if sellers}<AgencySellerList answer={sellers} />{/if}
		</TabsContent>
	</Tabs>
{/if}

{#snippet listing(row: AgencyRow, index: number)}
	<article class="flex gap-3 p-3 sm:gap-4 sm:p-4">
		<ProductImage src={row.img} name={row.name} compact class="size-16 shrink-0 rounded-lg sm:size-20" />
		<div class="min-w-0 flex-1 space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<h3 class="font-medium leading-snug"><a href={reportHref(row.link)} class="hover:underline">{row.name || 'Unnamed listing'}</a></h3>
				{#if row.new}<Badge variant="secondary">New</Badge>{/if}
			</div>
			<p class="text-muted-foreground text-sm">
				{row.kind} · Seller: {row.seller || 'not listed'} · {money(row.price)}
			</p>
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<VerdictBadge kind={row.level === 'reports' ? 'safety' : 'caution'} />
				<span>{row.summary}</span>
				<span class="text-muted-foreground">· {count(row.reviews_analyzed)} reviews read</span>
			</div>
			{#each row.quotes as quote, place (place)}
				<blockquote class="border-l-2 pl-3 text-sm">
					“<Highlighted pieces={segments(quote.text, quote.highlights)} />”{#if quote.hazard}<span class="text-muted-foreground">&nbsp;· {quote.hazard}</span>{/if}
				</blockquote>
			{/each}
			<AgencyCaseControls link={row.link} name={row.name} value={row.case} id="row-{level}-{index}" onsaved={(value) => saved(row.link, value)} />
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
				<span class="text-muted-foreground">
					Checked {dateText(row.checked_at) ?? 'on an unknown date'}{row.checked_with_current ? '' : ' · with an older version of the check'}
				</span>
				<div class="flex flex-wrap gap-2">
					<Button size="sm" variant="outline" href={evidenceHref(row.link)}><FileTextIcon /> Evidence sheet</Button>
					<Button size="sm" variant="ghost" href={reportHref(row.link)}>Open report</Button>
				</div>
			</div>
		</div>
	</article>
{/snippet}
