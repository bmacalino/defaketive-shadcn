// Shared by the agency view's pages (agency_api.py on the server).
import { api, json } from '#lib/api.js';
import { dateText } from '#lib/product.js';
import type { AgencyCase, AgencyRow, AgencyStatus } from '#lib/types.js';

/** Where a listing stands for one agency account. The same words as agency_api.STATUSES and the spreadsheet. */
export const STATUSES: { value: AgencyStatus; label: string }[] = [
	{ value: '', label: 'Not reviewed' },
	{ value: 'looking', label: 'Under review' },
	{ value: 'no_action', label: 'Closed, no action' }
];
export const statusLabel = (value?: AgencyStatus | null) => STATUSES.find((s) => s.value === (value ?? ''))?.label ?? 'Not reviewed';
export const MAX_NOTE = 2000;

/**
 * The colours the charts use. Red and orange are the verdict colours, so a bar means what its chip means; the rest
 * of a bar (listings with no safety reviews) is a quiet grey that works on both themes. Never the purple brand.
 */
export const LEVEL_SERIES = [
	{ key: 'reports', label: 'Safety reports', color: 'var(--destructive)' },
	{ key: 'mentions', label: 'Safety mentions', color: 'var(--warning)' },
	{ key: 'none', label: 'No safety reviews', color: 'color-mix(in oklch, var(--muted-foreground) 30%, transparent)' }
] as const;
/** The chip for a level, worded as the DTI view's filters and charts word it (the orange one is "Safety mentions",
 *  not the app's "Caution", so the label matches what was filtered). */
export const levelChip = (level: string | null | undefined) =>
	level === 'reports' ? ({ kind: 'safety', label: 'Safety reports' } as const) : ({ kind: 'caution', label: 'Safety mentions' } as const);

/** One quantity, no verdict: grey. */
export const PLAIN_SERIES = [{ key: 'value', label: 'Count', color: 'var(--muted-foreground)' }] as const;

/** Save this account's status and note for a listing. Both empty forgets it. */
export async function saveCase(link: string, status: AgencyStatus, note: string): Promise<AgencyCase | null> {
	return (await api<{ case: AgencyCase | null }>('/api/agency/case', json('PUT', { link, status, note }))).case;
}

// --- Which listings to show ---------------------------------------------------------------------------------------
// One set of filters for the watch list and the combined report (and its address), so both always show the same
// listings. An empty value means "any".

/** The same bands as agency_api.PRICE_BANDS. */
export const PRICE_BANDS = ['Under ₱200', '₱200–499', '₱500–999', '₱1,000 and up'] as const;
/**
 * The one "Label" menu: the two levels, or a flagged listing whose reviews also report a copy or a misleading listing
 * (agency_api.ALSO; their names are the report's own). `level` and `also` say what each keeps.
 */
export const LABELS = [
	{ value: 'all', label: 'All labels', level: null, also: null, meaning: "Every listing whose reviews mention a safety problem: red at the check's most serious level, orange below it." },
	{ value: 'reports', label: 'Safety reports', level: 'reports', also: null, meaning: "The check's most serious level: buyers report fire, smoke, shocks or burns, more than once or very clearly." },
	{ value: 'mentions', label: 'Safety mentions', level: 'mentions', also: null, meaning: 'Some reviews mention a safety problem, below that level. Worth a look, with more care.' },
	{ value: 'counterfeit', label: 'Possible fake', level: null, also: 'counterfeit', meaning: 'Listings with safety reviews whose reviews also say it may not be the original brand.' },
	{ value: 'not_as_described', label: 'Not as advertised', level: null, also: 'not_as_described', meaning: 'Listings with safety reviews whose reviews also say it differs from the listing.' }
] as const;
export type LabelKey = (typeof LABELS)[number]['value'];
export const labelOf = (value: string) => LABELS.find((item) => item.value === value) ?? LABELS[1];

export interface Filters {
	/** Which label: both levels, one level, or an other problem at either level. */
	label: LabelKey;
	/** Words in the listing's name or seller, all of them. */
	q: string;
	kind: string;
	price: string;
	/** '' any, 'none' no status, or a status. */
	status: string;
	/** Its latest safety review falls on or between these days ("2026-10-01"); '' leaves that end open. */
	from: string;
	to: string;
	/** One seller's listings (the Sellers tab), matched as it groups them: spaces tidied, case ignored. */
	seller: string;
}
// Safety reports first: the level that matters most, and the one the menu's count is about.
export const NO_FILTERS: Filters = { label: 'reports', q: '', kind: '', price: '', status: '', from: '', to: '', seller: '' };

export function filtersFrom(params: { get(name: string): string | null }): Filters {
	const day = (name: string) => {
		const value = params.get(name) ?? '';
		return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
	};
	// Addresses from before the one menu: ?level=mentions|all and ?also=<problem> still open the same list.
	const asked = params.get('label') ?? params.get('also') ?? params.get('level');
	return {
		label: LABELS.some((item) => item.value === asked) ? (asked as LabelKey) : 'reports',
		q: params.get('q') ?? '',
		kind: params.get('kind') ?? '',
		price: params.get('price') ?? '',
		status: params.get('status') ?? '',
		from: day('from'),
		to: day('to'),
		seller: params.get('seller') ?? ''
	};
}

/** The filters as address parameters, leaving out what is at its default. */
export function filtersQuery(filters: Filters): URLSearchParams {
	const params = new URLSearchParams();
	for (const key of Object.keys(NO_FILTERS) as (keyof Filters)[]) {
		const value = filters[key];
		if (value && value !== NO_FILTERS[key]) params.set(key, value);
	}
	return params;
}

/** True when anything narrows the list beyond the label (the label and the order do not count). */
export const narrowed = (filters: Filters) =>
	Boolean(filters.q || filters.kind || filters.price || filters.status || filters.from || filters.to || filters.seller);

const tidy = (text: string) => text.split(/\s+/).filter(Boolean).join(' ').toLowerCase();

/** Both levels' rows in, the ones the filters keep out. */
export function filterRows(rows: AgencyRow[], filters: Filters): AgencyRow[] {
	const words = tidy(filters.q).split(' ').filter(Boolean);
	const seller = tidy(filters.seller);
	const { level, also } = labelOf(filters.label);
	return rows.filter((row) => {
		if (level && row.level !== level) return false;
		if (also && !row.also.some((item) => item.category === also)) return false;
		if (filters.kind && row.kind !== filters.kind) return false;
		if (filters.price && row.price_band !== filters.price) return false;
		if (filters.status && (row.case?.status || 'none') !== filters.status) return false;
		// The day of its latest safety review within the range; a listing with no dated one drops out of any range.
		if ((filters.from || filters.to) && !row.latest_report) return false;
		if (filters.from && row.latest_report! < filters.from) return false;
		if (filters.to && row.latest_report! > filters.to) return false;
		if (seller && tidy(row.seller) !== seller) return false;
		const text = tidy(`${row.name} ${row.seller}`);
		return words.every((word) => text.includes(word));
	});
}

/** Newest complaint first (the server orders each level so; done again because the levels can be mixed). */
export function sortRows(rows: AgencyRow[]): AgencyRow[] {
	return [...rows].sort(
		(a, b) =>
			Number(a.latest_report_age === null) - Number(b.latest_report_age === null) ||
			(a.latest_report_age ?? 0) - (b.latest_report_age ?? 0) ||
			b.safety_mentions - a.safety_mentions ||
			a.name.localeCompare(b.name)
	);
}

/** "latest safety review from Oct 1 to Oct 22, 2026" (or "since" / "until"), for the report's cover. */
export function rangeWords(filters: Pick<Filters, 'from' | 'to'>): string {
	if (filters.from && filters.to) return `latest safety review from ${dateText(filters.from)} to ${dateText(filters.to)}`;
	if (filters.from) return `latest safety review since ${dateText(filters.from)}`;
	if (filters.to) return `latest safety review until ${dateText(filters.to)}`;
	return '';
}

/** "Oct 14, 2026", or "about Oct 1, 2026" for a day counted back from Lazada's "3 weeks ago". */
export function latestReportText(row: Pick<AgencyRow, 'latest_report' | 'latest_report_approx'>): string | null {
	if (!row.latest_report) return null;
	const day = dateText(row.latest_report) ?? row.latest_report;
	return row.latest_report_approx ? `about ${day}` : day;
}

/**
 * Paper is white: print in the light theme, then put the person's theme back. Call in onMount; it returns the
 * clean-up. Used by the evidence sheet and the combined report.
 */
export function printInLightTheme(): () => void {
	const root = document.documentElement;
	let dark = false;
	let scheme = '';
	const before = () => {
		dark = root.classList.contains('dark');
		scheme = root.style.colorScheme;
		root.classList.remove('dark');
		root.style.colorScheme = 'light';
	};
	const after = () => {
		if (dark) root.classList.add('dark');
		root.style.colorScheme = scheme;
		dark = false;
	};
	addEventListener('beforeprint', before);
	addEventListener('afterprint', after);
	return () => {
		removeEventListener('beforeprint', before);
		removeEventListener('afterprint', after);
	};
}
