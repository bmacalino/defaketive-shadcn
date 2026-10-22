<script lang="ts">
	import StoreIcon from '@lucide/svelte/icons/store';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import VerdictBadge from '#lib/components/app/verdict-badge.svelte';
	import { Card } from '#lib/components/ui/card/index.js';
	import { evidenceHref } from '#lib/nav.js';
	import type { AgencySellers } from '#lib/types.js';

	// Sellers with two or more listings whose buyers report or mention safety problems, each with those listings.
	// The server groups them by the name Lazada shows; the note says that is not a checked identity.
	let { answer }: { answer: AgencySellers } = $props();

	const count = (value: number) => value.toLocaleString();
	const plural = (value: number, one: string, many = `${one}s`) => `${count(value)} ${value === 1 ? one : many}`;
</script>

<p class="text-muted-foreground text-sm">{answer.note}</p>

{#if !answer.sellers.length}
	<EmptyState art="search" title="No seller has more than one flagged listing" description="Every flagged listing is from a different seller, or has no seller name." />
{:else}
	<ul class="grid gap-4 md:grid-cols-2" aria-label="Sellers with more than one flagged listing">
		{#each answer.sellers as seller (seller.seller)}
			<li>
				<Card class="h-full gap-3 p-4" data-print="keep">
					<header class="flex items-start gap-3">
						<span class="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg" aria-hidden="true"><StoreIcon class="size-4" /></span>
						<div class="min-w-0 space-y-0.5">
							<h3 class="font-semibold leading-snug break-words">{seller.seller}</h3>
							<p class="text-muted-foreground text-sm">
								{count(seller.reports + seller.mentions)} flagged of {plural(seller.listings, 'listing')} checked
							</p>
						</div>
					</header>
					<p class="flex flex-wrap gap-2 text-sm">
						{#if seller.reports}<span class="flex items-center gap-1.5"><VerdictBadge kind="safety" /> {count(seller.reports)}</span>{/if}
						{#if seller.mentions}<span class="flex items-center gap-1.5"><VerdictBadge kind="caution" /> {count(seller.mentions)}</span>{/if}
					</p>
					<ul class="divide-y border-t text-sm">
						{#each seller.flagged as listing (listing.link)}
							<li class="flex items-start justify-between gap-3 py-2">
								<a href={evidenceHref(listing.link)} class="line-clamp-2 min-w-0 hover:underline">{listing.name || 'Unnamed listing'}</a>
								<span class="text-muted-foreground flex shrink-0 items-center gap-1.5 text-right text-xs">
									<i class="size-2 rounded-full" style="background: {listing.level === 'reports' ? 'var(--destructive)' : 'var(--warning)'}" aria-hidden="true"></i>
									<span class="sr-only">{listing.level === 'reports' ? 'Safety reports' : 'Safety mentions'}, </span>
									{plural(listing.safety_mentions, 'safety review')}
								</span>
							</li>
						{/each}
					</ul>
				</Card>
			</li>
		{/each}
	</ul>
{/if}
