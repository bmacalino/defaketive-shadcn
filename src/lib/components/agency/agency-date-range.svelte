<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Popover, PopoverContent, PopoverTrigger } from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { IsMobile } from '#lib/hooks/is-mobile.svelte.js';
	import { dateText } from '#lib/product.js';
	import { cn } from '#lib/utils.js';

	// A date range in a calendar pop-up, for "Latest safety review". `from` and `to` are days ("2026-10-01"), '' when
	// open. Picking the second day closes it; "Clear" opens the range again. No day after today can be picked.
	let {
		from = $bindable(''),
		to = $bindable(''),
		id,
		class: className
	}: { from?: string; to?: string; id: string; class?: string } = $props();

	type Range = { start: DateValue | undefined; end: DateValue | undefined };
	const read = (day: string) => {
		try {
			return day ? parseDate(day) : undefined;
		} catch {
			return undefined;
		}
	};

	let open = $state(false);
	let value = $state<Range>({ start: undefined, end: undefined });
	// Follow from/to when they change outside (Clear filters, an address with ?from=&to=).
	$effect.pre(() => {
		value = { start: read(from), end: read(to) };
	});

	const phone = new IsMobile();
	const latest = today(getLocalTimeZone());
	const shown = $derived(
		from && to
			? `${dateText(from)} – ${dateText(to)}`
			: from
				? `Since ${dateText(from)}`
				: to
					? `Until ${dateText(to)}`
					: 'Any time'
	);

	function picked(next: Range) {
		if (!next.start || !next.end) return;
		from = next.start.toString();
		to = next.end.toString();
		open = false;
	}
	function clear() {
		from = '';
		to = '';
		value = { start: undefined, end: undefined };
		open = false;
	}
</script>

<Popover bind:open>
	<PopoverTrigger>
		{#snippet child({ props })}
			<Button {...props} {id} variant="outline" class={cn('w-full justify-start font-normal sm:w-52', !from && !to && 'text-muted-foreground', className)}>
				<CalendarIcon />
				<span class="truncate">{shown}</span>
			</Button>
		{/snippet}
	</PopoverTrigger>
	<PopoverContent class="w-auto p-0" align="start">
		<RangeCalendar
			bind:value
			onValueChange={picked}
			numberOfMonths={phone.current ? 1 : 2}
			maxValue={latest}
			placeholder={value.start ?? latest.subtract({ months: phone.current ? 0 : 1 })}
			locale="en-PH"
		/>
		<div class="flex items-center justify-between gap-2 border-t p-2">
			<p class="text-muted-foreground px-1 text-xs">Pick the first day, then the last.</p>
			<Button variant="ghost" size="sm" onclick={clear} disabled={!from && !to}>Clear</Button>
		</div>
	</PopoverContent>
</Popover>
