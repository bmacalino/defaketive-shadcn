<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { onMount } from 'svelte';
	import AgencySheetView from '#lib/components/agency/agency-sheet.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ReportSkeleton from '#lib/components/app/report-skeleton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import {
		labelOf,
		rangeWords,
		filterRows,
		filtersFrom,
		filtersQuery,
		latestReportText,
		printInLightTheme,
		sortRows,
		statusLabel
	} from '#lib/agency.js';
	import { api, ApiError, json } from '#lib/api.js';
	import { accuracyCopy, dateText, money } from '#lib/product.js';
	import { agency, AGENCY_REFUSED } from '#lib/stores/agency.svelte.js';
	import type { AgencyRow, AgencySheet, AgencyStatus, AgencyWatch, SafetyCheckAccuracy } from '#lib/types.js';

	// Several evidence sheets in one printable report: a cover saying what is in it and how to read it, a summary
	// table, then each listing's sheet on its own page. Which listings: the watch list's filters, read from the
	// address (the watch list's "Printable report"), or one seller's at both levels (the Sellers tab). The listing
	// set is chosen with the same filter as the watch list, so both always agree. Nothing is marked as seen.
	const MAX = 60;
	const params = page.url.searchParams;
	const filters = filtersFrom(params);
	const madeOn = dateText(new Date().toISOString());

	let status = $state<'loading' | 'ready' | 'refused' | 'empty' | 'many' | 'error'>('loading');
	let rows = $state<AgencyRow[]>([]);
	let sheets = $state<AgencySheet[]>([]);
	let note = $state('');
	let accuracy = $state<SafetyCheckAccuracy | null>(null);

	async function load() {
		status = 'loading';
		try {
			const [reports, mentions] = await Promise.all([
				api<AgencyWatch>('/api/agency/watch?level=reports'),
				api<AgencyWatch>('/api/agency/watch?level=mentions')
			]);
			note = reports.note;
			accuracy = reports.accuracy;
			rows = sortRows(filterRows([...reports.rows, ...mentions.rows], filters));
			if (!rows.length) {
				status = 'empty';
				return;
			}
			if (rows.length > MAX) {
				status = 'many';
				return;
			}
			sheets = (await api<{ sheets: AgencySheet[] }>('/api/agency/sheets', json('POST', { links: rows.map((row) => row.link) }))).sheets;
			status = 'ready';
		} catch (error) {
			status = error instanceof ApiError && (error.status === 401 || error.status === 403) ? 'refused' : 'error';
		}
	}
	load();
	onMount(printInLightTheme);

	// The label's name; "All labels" reads as both levels.
	const levelName = filters.label === 'all' ? 'Safety reports and safety mentions' : labelOf(filters.label).label;
	const title = filters.seller ? `Listings from ${filters.seller}` : levelName;
	// What is in the report, in words, for the cover (and so a printout explains itself).
	const included = [
		filters.seller ? `${levelName.toLowerCase()} from the seller "${filters.seller}"` : levelName.toLowerCase(),
		filters.kind && `kind of product: ${filters.kind}`,
		filters.price && `price: ${filters.price}`,
		filters.q && `matching "${filters.q}"`,
		filters.status && `case status: ${statusLabel((filters.status === 'none' ? '' : filters.status) as AgencyStatus)}`,
		rangeWords(filters)
	].filter(Boolean);
	const order = 'newest complaint';
	const backHref = filters.seller ? '/app/agency?tab=sellers' : `/app/agency?${filtersQuery(filters).toString()}`;
	const count = (value: number) => value.toLocaleString();
</script>

<svelte:head><title>Printable report · {title} · DeFaketive</title></svelte:head>

<div data-print="hide" class="flex flex-wrap items-center gap-2">
	<Button variant="ghost" href={backHref} class="-ml-2"><ArrowLeftIcon /> Back to {agency.title}</Button>
	{#if status === 'ready'}
		<Button class="ml-auto" onclick={() => print()}><PrinterIcon /> Print or save as PDF</Button>
	{/if}
</div>

{#if status === 'loading'}
	<ReportSkeleton />
{:else if status === 'refused'}
	<EmptyState art="search" title="This page is for partner agencies" description={AGENCY_REFUSED}>
		{#snippet actions()}<Button href="/app/home">Go to Home</Button>{/snippet}
	</EmptyState>
{:else if status === 'empty'}
	<EmptyState art="search" title="Nothing to put in a report" description="No listings match what was asked for.">
		{#snippet actions()}<Button href={backHref}>Back to the watch list</Button>{/snippet}
	</EmptyState>
{:else if status === 'many'}
	<EmptyState
		art="search"
		title="Too many listings for one report"
		description={`${count(rows.length)} listings match. A report can hold up to ${MAX}: narrow the filters on the watch list, by kind, price or seller.`}
	>
		{#snippet actions()}<Button href={backHref}>Back to the watch list</Button>{/snippet}
	</EmptyState>
{:else if status === 'error'}
	<EmptyState art="error" title="The report couldn't be made" description="The server didn't answer. Nothing was changed.">
		{#snippet actions()}<Button onclick={load}>Try again</Button>{/snippet}
	</EmptyState>
{:else}
	<section class="space-y-5" aria-labelledby="report-title">
		<header class="space-y-1">
			<p class="text-muted-foreground text-sm">DeFaketive report · prepared for the {agency.officeName || 'partner agency'} · {madeOn}</p>
			<h1 id="report-title" class="text-3xl font-semibold tracking-tight">{title}</h1>
			<p class="text-muted-foreground">
				{count(sheets.length)} Lazada listing{sheets.length === 1 ? '' : 's'}: {included.join('; ')}. Sorted by {order}.
			</p>
		</header>

		<div class="space-y-2 rounded-lg border p-4 text-sm" data-print="keep">
			<h2 class="font-semibold">How to read this report</h2>
			<p>{note}</p>
			<p>{accuracyCopy(accuracy)}</p>
			<p class="text-muted-foreground">DeFaketive is a student capstone project. This report is not an official finding of the DTI or of Lazada.</p>
		</div>

		<Card class="py-0">
			<Table.Root>
				<Table.Caption class="sr-only">The listings in this report</Table.Caption>
				<Table.Header>
					<Table.Row>
						<Table.Head class="pl-4">#</Table.Head>
						<Table.Head>Listing</Table.Head>
						<Table.Head>Kind</Table.Head>
						<Table.Head>Seller</Table.Head>
						<Table.Head class="text-right">Price</Table.Head>
						<Table.Head class="text-right">Safety reviews</Table.Head>
						<Table.Head class="pr-4">Latest safety review</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each sheets as sheet, index (sheet.link)}
						{@const row = rows.find((item) => item.link === sheet.link)}
						<Table.Row>
							<Table.Cell class="pl-4 tabular-nums">{index + 1}</Table.Cell>
							<Table.Cell class="max-w-72 whitespace-normal"><a class="hover:underline" href="#s{index}-title">{sheet.name || 'Unnamed listing'}</a></Table.Cell>
							<Table.Cell>{sheet.kind}</Table.Cell>
							<Table.Cell class="whitespace-normal">{sheet.seller || 'Not listed'}</Table.Cell>
							<Table.Cell class="text-right">{money(sheet.price)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{count(sheet.safety_mentions)}</Table.Cell>
							<Table.Cell class="pr-4">{(row && latestReportText(row)) ?? 'No date'}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card>
	</section>

	{#each sheets as sheet, index (sheet.link)}
		<div data-print="page" class="border-t pt-8">
			<AgencySheetView {sheet} id="s{index}" nested reading={false} kicker="Listing {index + 1} of {sheets.length}" />
		</div>
	{/each}
{/if}
