// The shapes the Flask app sends. The server words every verdict and label
// (dashboard_utils.badge_view), so this app only lays them out.

export type Tone = 'high' | 'moderate' | 'low' | 'unknown';

export type VerdictState =
	| 'safety_warning'
	| 'possible_safety_issue'
	| 'possible_counterfeit_or_defect'
	| 'reviews_may_be_unreliable'
	| 'no_warning_signs'
	| 'insufficient_evidence'
	| 'not_analyzed';

export type Category = 'safety' | 'defect' | 'quality' | 'counterfeit' | 'not_as_described';

export interface Evidence {
	text: string;
	rating: number | null;
	hazard: string | null;
	/** [start, end] character ranges of the words that triggered the quote. */
	highlights: [number, number][];
}

export interface Badge {
	category: Category;
	label: string;
	helper: string;
	informs_only: boolean;
	mentions: number;
	reviews_analyzed: number;
	phrase: string;
	summary: string;
	evidence: Evidence[];
	more_evidence: number;
}

export interface LabelInfo {
	category: Category;
	label: string;
	helper: string;
	informs_only: boolean;
}

export interface SafetyCheckAccuracy {
	sentences_checked: number;
	reports_confirmed: number;
	reports_caught: number;
	flags_raised: number;
	flags_confirmed: number;
}

export interface BadgeView {
	available: boolean;
	state: VerdictState;
	tone: Tone;
	headline: string;
	detail: string;
	reviews_analyzed: number;
	counts: Partial<Record<Category, number>>;
	badges: Badge[];
	labels: LabelInfo[];
	limits_notice?: string | null;
	safety_check_accuracy?: SafetyCheckAccuracy;
}

export interface Term {
	span?: [number, number];
	ngram?: string;
	category?: string;
	negated?: boolean;
}

export interface Sentence {
	text_raw?: string;
	tags?: string[];
	extra_tags?: string[];
	terms?: Term[];
	extra_terms?: Term[];
}

export interface Review {
	author?: string;
	rating?: number;
	time?: string;
	date?: string;
	content?: string;
	is_duplicate?: boolean;
	included_in_analysis?: boolean;
	sentiment_analysis?: {
		label?: string;
		review_tags?: string[];
		review_extra_tags?: string[];
		sentences?: Sentence[];
	};
}

export interface SentimentSummary {
	sentiment_counts?: { positive?: number; uncertain?: number; neutral?: number; negative?: number };
	sentiment_shares?: Record<string, number>;
	duplicate_review_count?: number;
	coverage?: {
		reviews_listed?: number;
		reviews_available?: number;
		sampling?: string;
		star_quota?: number;
		weighted?: boolean;
	};
}

export interface Product {
	name?: string;
	link: string;
	price?: string;
	rating?: number;
	category?: string;
	platform?: string;
	img?: string;
	image?: string;
	image_url?: string;
	thumbnail?: string;
	analysis_date?: string;
	analyzed_at?: string;
	updated_at?: string;
	/** False when the saved report was made by an earlier version of the checker (server.py adds it). */
	checked_with_current?: boolean;
	reviews_collected?: number;
	comments?: Review[];
	sentiment_summary?: SentimentSummary;
	badge_view?: BadgeView;
}

export interface ActivityEntry {
	product: Product;
	openedAt: number;
}

export interface Library {
	activity: Record<string, ActivityEntry>;
	wishlist: string[];
	clearedAt: number;
}

export interface GuestStatus {
	limit: number;
	left: number;
}

export interface Me {
	user: { name: string; email: string; created_at?: string } | null;
	guest: GuestStatus | null;
}

export interface Job {
	id: string;
	state: 'running' | 'complete' | 'error';
	stage: number;
	stage_label: string;
	progress: number;
	message: string;
	/** A Chrome window has opened for a login or a check, and `message` says what to do in it. */
	needs_you?: boolean;
	/** On the public site: the window is on the team's scanning computer, so a team member has to act, not the visitor. */
	needs_team?: boolean;
	platform: string;
	query: string;
	created_at: string;
	product_count?: number;
}

export type Marketplace = 'shopee' | 'lazada' | 'temu';

// --- The agency view (agency_api.py) --------------------------------------------------------------------------------

/** "reports": the checker's serious level (red). "mentions": any other report whose reviews mention safety. */
export type AgencyLevel = 'reports' | 'mentions';

export interface AgencyMe {
	member: boolean;
	office: string | null;
	office_name: string | null;
	/** This account has closed the "Get started" guide once; until then it opens by itself. */
	guide_seen: boolean;
}

export interface AgencyRow {
	link: string;
	name: string;
	img: string;
	price: string;
	seller: string;
	kind: string;
	level: AgencyLevel;
	state: VerdictState;
	tone: Tone;
	headline: string;
	safety_mentions: number;
	summary: string;
	reviews_analyzed: number;
	quotes: Evidence[];
	ratings_listed: number;
	checked_at: string | null;
	checked_with_current: boolean;
	/** Not opened or marked as seen by this agency account yet. */
	new: boolean;
	/** This agency account's own status and note, or null when it gave neither. */
	case: AgencyCase | null;
}

/** Where a listing stands for one agency account. '' is "No status". */
export type AgencyStatus = '' | 'looking' | 'referred' | 'no_action';

export interface AgencyCase {
	status: AgencyStatus;
	note: string;
	updated_at: string;
}

export interface AgencyCharts {
	hazards: { hazard: string; quotes: number }[];
	years: { year: number; reviews: number }[];
	/** Safety reviews with no date, or one Lazada showed as "3 weeks ago". */
	recent_or_unknown: number;
	prices: { band: string; listings: number; reports: number; mentions: number }[];
	no_price: number;
}

export interface AgencySeller {
	seller: string;
	listings: number;
	reports: number;
	mentions: number;
	flagged: { link: string; name: string; kind: string; level: AgencyLevel; safety_mentions: number }[];
}

export interface AgencySellers {
	sellers: AgencySeller[];
	note: string;
	leads: string;
}

export interface AgencyWatch {
	level: AgencyLevel;
	rows: AgencyRow[];
	new: Record<AgencyLevel, number>;
	accuracy: SafetyCheckAccuracy;
	note: string;
}

export interface AgencyKind {
	kind: string;
	listings: number;
	reports: number;
	mentions: number;
	top_hazard: string | null;
}

export interface AgencyPatterns {
	kinds: AgencyKind[];
	charts: AgencyCharts;
	listings: number;
	note: string;
	scope: string;
}

export interface AgencyQuote {
	text: string;
	hazard: string | null;
	highlights: [number, number][];
	/** This agency account said this sentence is not a safety problem. The report does not change. */
	marked_not_safety: boolean;
}

export interface AgencyReview {
	rating: number | null;
	date: string | null;
	/** The date reads like "3 weeks ago": true when the reviews were collected, not now. */
	date_relative: boolean;
	variation: string;
	text: string;
	quotes: AgencyQuote[];
}

export interface AgencySheet {
	link: string;
	name: string;
	img: string;
	price: string;
	seller: string;
	kind: string;
	level: AgencyLevel | null;
	state: VerdictState;
	tone: Tone;
	headline: string;
	detail: string;
	summary: string;
	safety_mentions: number;
	reviews_analyzed: number;
	ratings_listed: number;
	star_quota: number | null;
	checked_at: string | null;
	checked_with_current: boolean;
	checker_version: string;
	reviews: AgencyReview[];
	accuracy: SafetyCheckAccuracy | null;
	note: string;
	case: AgencyCase | null;
}
