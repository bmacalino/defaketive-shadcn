// Shared by the agency view's pages (agency_api.py on the server).
import { api, json } from '#lib/api.js';
import type { AgencyCase, AgencyStatus } from '#lib/types.js';

/** Where a listing stands for one agency account. The same words as agency_api.STATUSES and the spreadsheet. */
export const STATUSES: { value: AgencyStatus; label: string }[] = [
	{ value: '', label: 'No status' },
	{ value: 'looking', label: 'Looking into it' },
	{ value: 'referred', label: 'Referred' },
	{ value: 'no_action', label: 'No action' }
];
export const statusLabel = (value?: AgencyStatus | null) => STATUSES.find((s) => s.value === (value ?? ''))?.label ?? 'No status';
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
/** One quantity, no verdict: grey. */
export const PLAIN_SERIES = [{ key: 'value', label: 'Count', color: 'var(--muted-foreground)' }] as const;

/** Save this account's status and note for a listing. Both empty forgets it. */
export async function saveCase(link: string, status: AgencyStatus, note: string): Promise<AgencyCase | null> {
	return (await api<{ case: AgencyCase | null }>('/api/agency/case', json('PUT', { link, status, note }))).case;
}
