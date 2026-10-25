<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import InfoIcon from '@lucide/svelte/icons/info';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import AgencyCaseControls from '#lib/components/agency/agency-case.svelte';
	import AgencyDateRange from '#lib/components/agency/agency-date-range.svelte';
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
	import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '#lib/components/ui/input-group/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '#lib/components/ui/sheet/index.js';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '#lib/components/ui/tabs/index.js';
	import {
		filterRows,
		filtersFrom,
		filtersQuery,
		latestReportText,
		narrowed,
		NO_FILTERS,
		LABELS,
		labelOf,
		levelChip,
		PRICE_BANDS,
		sortRows,
		STATUSES,
		type Filters,
		type LabelKey
	} from '#lib/agency.js';
	import { api, ApiError, json } from '#lib/api.js';
	import { agencyReportHref, evidenceHref } from '#lib/nav.js';
	import { accuracyCopy, money, segments } from '#lib/product.js';
	import { agency, AGENCY_REFUSED } from '#lib/stores/agency.svelte.js';
	import type { AgencyCase, AgencyLevel, AgencyPatterns, AgencyRow, AgencySellers, AgencyWatch } from '#lib/types.js';

	// The saved reports arranged for a partner agency (agency_api.py). The server decides who may see them and
	// words every verdict; this page only lays them out. Everything here says what buyers report, never that a
	// product is unsafe or that a seller broke a rule.
	const TABS = ['watch', 'overview', 'sellers'];

	// The tab and the watch list's filters live in the address, so a reload, Back or a shared link keeps them.
	// ?tab=kinds was the first version's name for the Overview.
	const asked = page.url.searchParams.get('tab');
	const initial = filtersFrom(page.url.searchParams);
	let tab = $state(asked === 'kinds' ? 'overview' : TABS.includes(asked ?? '') ? asked! : 'watch');
	let label = $state<LabelKey>(initial.label);
	let q = $state(initial.q);
	let kind = $state(initial.kind);
	let price = $state(initial.price);
	let statusFilter = $state(initial.status);
	let from = $state(initial.from);
	let to = $state(initial.to);
	let filtersOpen = $state(false);
	const filters = $derived<Filters>({
		...NO_FILTERS,
		label,
		q: q.trim(),
		kind,
		price,
		status: statusFilter,
		from,
		to
	});

	// Written to the address whenever they change. It compares with the browser's own address: a shallow
	// replaceState leaves page.url as it was, and reading page.url here would run for ever (the Products-page trap).
	$effect(() => {
		const params = filtersQuery(filters);
		if (tab !== 'watch') params.set('tab', tab);
		const wanted = params.toString();
		untrack(() => {
			const url = new URL(location.href);
			if (url.search.replace(/^\?/, '') === wanted) return;
			url.search = wanted;
			replaceState(url, page.state);
		});
	});

	// The menus cannot hold an empty value (it reads as "nothing chosen"), so "any" is "all" in a menu only.
	const ANY = 'all';
	const fromMenu = (value: string) => (value === ANY ? '' : value);
	const STATUS_FILTERS = [{ value: ANY, label: 'Any status' }, ...STATUSES.map((s) => ({ value: s.value || 'none', label: s.label }))];
	const PRICE_FILTERS = [{ value: ANY, label: 'Any price' }, ...PRICE_BANDS.map((band) => ({ value: band, label: band }))];

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

	// Both levels together; the Label menu picks among them.
	const pool = $derived([...(watch.reports?.rows ?? []), ...(watch.mentions?.rows ?? [])]);
	const labelRows = $derived(filterRows(pool, { ...NO_FILTERS, label }));
	const rows = $derived(sortRows(filterRows(pool, filters)));
	const fresh = $derived(rows.filter((row) => row.new).length);
	const note = $derived(watch.reports?.note ?? '');
	const accuracy = $derived(watch.reports?.accuracy ?? null);
	// Each label with how many listings it holds.
	const LABEL_FILTERS = $derived(
		LABELS.map((item) => ({ value: item.value, label: `${item.label} · ${filterRows(pool, { ...NO_FILTERS, label: item.value }).length}` }))
	);
	// The kinds under this label, plus the one chosen (so a kind from the Overview never vanishes from its own menu).
	const KIND_FILTERS = $derived([
		{ value: ANY, label: 'Any kind' },
		...[...new Set([...labelRows.map((row) => row.kind), ...(kind ? [kind] : [])])]
			.sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
			.map((value) => ({ value, label: value }))
	]);
	const menuLabel = (options: { value: string; label: string }[], value: string) =>
		options.find((option) => option.value === (value || ANY))?.label ?? options[0].label;
	const activeFilters = $derived(
		[kind, price, statusFilter, from || to].filter(Boolean).length + (label !== NO_FILTERS.label ? 1 : 0)
	);
	// The spreadsheet of this label: its level, or both levels with only the other problem kept.
	const csvHref = $derived.by(() => {
		const chosen = labelOf(label);
		const params = new URLSearchParams({ level: chosen.level ?? 'all' });
		if (chosen.also) params.set('also', chosen.also);
		return `/api/agency/watch.csv?${params}`;
	});

	/** Everything in the filter row back to the start, the label too (Safety reports). */
	function clearFilters() {
		label = NO_FILTERS.label;
		q = '';
		kind = '';
		price = '';
		statusFilter = '';
		from = '';
		to = '';
	}

	/** From the Overview: the watch list for one kind or price band (all labels), or one other problem. */
	async function showGroup(group: { kind?: string; price?: string; also?: string }) {
		clearFilters();
		label = (group.also as LabelKey) || 'all';
		kind = group.kind ?? '';
		price = group.price ?? '';
		tab = 'watch';
		await tick();
		document.getElementById('watch-heading')?.focus();
	}

	/** Marks what the list shows now as seen. */
	async function markAllSeen() {
		marking = true;
		const links = rows.filter((row) => row.new).map((row) => row.link);
		try {
			const answer = await api<{ marked: number; new: Record<AgencyLevel, number> }>('/api/agency/seen', json('POST', { links }));
			for (const list of [watch.reports, watch.mentions]) {
				if (!list) continue;
				list.rows = list.rows.map((row) => (links.includes(row.link) ? { ...row, new: false } : row));
				list.new = answer.new;
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
	// The combined report of what the list shows now (the same filters, read by the report page).
	const reportLink = $derived(`/app/agency/report?${filtersQuery(filters).toString()}`);
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

{#snippet filterControls(suffix: string)}
	<div class="grid gap-1.5">
		<Label for="label-filter{suffix}">Label</Label>
		<Select.Root type="single" value={label} onValueChange={(value) => (label = (value || 'reports') as LabelKey)}>
			<Select.Trigger id="label-filter{suffix}" class="w-full sm:w-44">{menuLabel(LABEL_FILTERS, label)}</Select.Trigger>
			<Select.Content>
				{#each LABEL_FILTERS as option (option.value)}<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="grid gap-1.5">
		<Label for="kind-filter{suffix}">Kind of product</Label>
		<Select.Root type="single" value={kind || ANY} onValueChange={(value) => (kind = fromMenu(value))}>
			<Select.Trigger id="kind-filter{suffix}" class="w-full sm:w-36">{menuLabel(KIND_FILTERS, kind)}</Select.Trigger>
			<Select.Content>
				{#each KIND_FILTERS as option (option.value)}<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="grid gap-1.5">
		<Label for="price-filter{suffix}">Price</Label>
		<Select.Root type="single" value={price || ANY} onValueChange={(value) => (price = fromMenu(value))}>
			<Select.Trigger id="price-filter{suffix}" class="w-full sm:w-32">{menuLabel(PRICE_FILTERS, price)}</Select.Trigger>
			<Select.Content>
				{#each PRICE_FILTERS as option (option.value)}<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="grid gap-1.5">
		<Label for="date-filter{suffix}">Latest safety review</Label>
		<AgencyDateRange id="date-filter{suffix}" bind:from bind:to />
	</div>
	<div class="grid gap-1.5">
		<Label for="status-filter{suffix}">Case status</Label>
		<Select.Root type="single" value={statusFilter || ANY} onValueChange={(value) => (statusFilter = fromMenu(value))}>
			<Select.Trigger id="status-filter{suffix}" class="w-full sm:w-36">{menuLabel(STATUS_FILTERS, statusFilter)}</Select.Trigger>
			<Select.Content>
				{#each STATUS_FILTERS as option (option.value)}<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>{/each}
			</Select.Content>
		</Select.Root>
	</div>
{/snippet}

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
			<h2 id="watch-heading" tabindex="-1" class="sr-only">Watch list</h2>
			<div class="grid max-w-xl gap-1.5">
				<Label for="watch-search">Search by listing or seller</Label>
				<InputGroup class="h-10">
					<InputGroupAddon><SearchIcon /></InputGroupAddon>
					<InputGroupInput id="watch-search" enterkeyhint="search" placeholder="For example: charger, HGH shop" autocomplete="off" bind:value={q} />
					{#if q}
						<InputGroupAddon align="inline-end">
							<InputGroupButton size="icon-xs" aria-label="Clear the search" onclick={() => (q = '')}><XIcon /></InputGroupButton>
						</InputGroupAddon>
					{/if}
				</InputGroup>
			</div>
			<!-- Wide screens: the filters sit in a row. Phones: one Filters button opens them from the bottom. -->
			<div class="hidden flex-wrap items-end gap-3 sm:flex" role="group" aria-label="Filter the watch list">
				{@render filterControls('')}
			</div>
			<div class="flex flex-wrap items-center gap-2 sm:hidden">
				<Button variant="outline" onclick={() => (filtersOpen = true)}>
					<SlidersHorizontalIcon /> Filters
					{#if activeFilters}<Badge variant="secondary">{activeFilters}</Badge>{/if}
				</Button>
			</div>
			<Sheet bind:open={filtersOpen}>
				<SheetContent side="bottom" class="max-h-[85svh] rounded-t-xl">
					<SheetHeader>
						<SheetTitle>Filter the watch list</SheetTitle>
						<SheetDescription>Choose what to show. The newest complaint comes first.</SheetDescription>
					</SheetHeader>
					<div class="grid gap-4 px-4">{@render filterControls('-sheet')}</div>
					<SheetFooter>
						<Button onclick={() => (filtersOpen = false)}>Show {rows.length} listing{rows.length === 1 ? '' : 's'}</Button>
						{#if activeFilters}<Button variant="ghost" onclick={clearFilters}>Reset</Button>{/if}
					</SheetFooter>
				</SheetContent>
			</Sheet>

			<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
				<p class="text-muted-foreground text-sm" aria-live="polite">
					{narrowed(filters) ? `Showing ${count(rows.length)} of ${count(labelRows.length)}.` : `${count(labelRows.length)} listings.`}
					{labelOf(label).meaning}
				</p>
				<div class="flex flex-wrap items-center gap-2 sm:ml-auto">
					<span class="text-muted-foreground text-sm" aria-live="polite">{fresh ? `${count(fresh)} new` : 'Nothing new'}</span>
					<Button variant="outline" size="sm" disabled={!fresh || marking} onclick={markAllSeen}>
						<CheckCheckIcon /> Mark all as seen
					</Button>
					{#if narrowed(filters) || label !== NO_FILTERS.label}
						<Button variant="ghost" size="sm" onclick={clearFilters}><XIcon /> Clear filters</Button>
					{/if}
					{#if rows.length}
						<Button variant="outline" size="sm" href={reportLink}><PrinterIcon /> Printable report</Button>
					{/if}
					<Button variant="outline" size="sm" href={csvHref} download>
						<DownloadIcon /> Download spreadsheet
					</Button>
				</div>
			</div>

			{#if !rows.length}
				{#if labelRows.length}
					<EmptyState art="search" title="No listings match" description="Nothing with this label matches the search and filters you chose.">
						{#snippet actions()}<Button variant="outline" onclick={clearFilters}>Clear filters</Button>{/snippet}
					</EmptyState>
				{:else}
					<EmptyState
						art="reviews"
						title="No listings with this label"
						description="None of the Lazada listings DeFaketive has checked have this label right now."
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
			{#if patterns}<AgencyOverview {patterns} onselect={showGroup} />{/if}
		</TabsContent>

		<TabsContent value="sellers" class="space-y-4">
			<h2 class="sr-only">Sellers with more than one flagged listing</h2>
			{#if sellers}<AgencySellerList answer={sellers} />{/if}
		</TabsContent>
	</Tabs>
{/if}

{#snippet listing(row: AgencyRow, index: number)}
	<!-- Only what decides whether to open it: the long wording, every quote and the report's dates are on the
	     evidence sheet. -->
	{@const latest = latestReportText(row)}
	{@const quote = row.quotes[0]}
	<article class="flex gap-3 p-3 sm:gap-4 sm:p-4">
		<ProductImage src={row.img} name={row.name} compact class="size-14 shrink-0 rounded-lg sm:size-16" />
		<div class="min-w-0 flex-1 space-y-1.5">
			<div class="flex items-start gap-2">
				<h3 class="line-clamp-2 min-w-0 font-medium leading-snug sm:line-clamp-1" title={row.name}>
					<a href={agencyReportHref(row.link)} class="hover:underline">{row.name || 'Unnamed listing'}</a>
				</h3>
				{#if row.new}<Badge variant="secondary" class="shrink-0">New</Badge>{/if}
			</div>
			<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
				<VerdictBadge kind={levelChip(row.level).kind} label={levelChip(row.level).label} />
				{#if row.also.length}
					<span class="sr-only">Also reported:</span>
					{#each row.also as item (item.category)}
						<Badge variant="outline" class="text-muted-foreground font-normal" title="{item.reviews} review{item.reviews === 1 ? '' : 's'} say so">{item.label}</Badge>
					{/each}
				{/if}
				<span>{count(row.safety_mentions)} safety review{row.safety_mentions === 1 ? '' : 's'}{latest ? ` · latest ${latest}` : ''}</span>
			</p>
			<p class="text-muted-foreground text-sm">{row.kind} · {row.seller || 'No seller name'} · {money(row.price)}</p>
			{#if quote}
				<blockquote class="text-muted-foreground line-clamp-2 border-l-2 pl-3 text-sm">
					“<Highlighted pieces={segments(quote.text, quote.highlights)} />”
				</blockquote>
			{/if}
			<div class="flex flex-wrap items-center gap-2 pt-1">
				<AgencyCaseControls link={row.link} name={row.name} value={row.case} id="row-{index}" showNote={false} onsaved={(value) => saved(row.link, value)} />
				<Button size="sm" variant="outline" href={evidenceHref(row.link)}><FileTextIcon /> Evidence sheet</Button>
				<Button size="sm" variant="ghost" href={agencyReportHref(row.link)}>Open report</Button>
			</div>
			{#if row.case?.note}
				<p class="text-muted-foreground line-clamp-1 text-sm"><span class="text-foreground font-medium">Your note:</span> {row.case.note}</p>
			{/if}
			{#if !row.checked_with_current}<p class="text-muted-foreground text-xs">Made with an older version of the check.</p>{/if}
		</div>
	</article>
{/snippet}
