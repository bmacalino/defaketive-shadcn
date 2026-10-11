/** Where a product's report lives. The listing link goes in the address so a report can be reloaded or shared. */
export const reportHref = (link: string) => `/app/report?link=${encodeURIComponent(link)}`;

/** The same report on the guest screen: no menu, no account features, just the report. */
export const guestReportHref = (link: string) => `/scan/report?link=${encodeURIComponent(link)}`;

/** The right one of the two for whoever is looking. */
export const reportHrefFor = (link: string, guest: boolean) => (guest ? guestReportHref(link) : reportHref(link));

/**
 * The app (everything under /app) is for signed-in people. A guest who asks for one of its pages is sent to
 * the public screen that does the same job, or to the landing page to sign in when there is none.
 */
export function guestDestination(url: {
	pathname: string;
	searchParams: { get(name: string): string | null };
}): { href: string; signIn: boolean } {
	const section = url.pathname.split('/')[2] ?? '';
	const link = url.searchParams.get('link');
	const query = url.searchParams.get('q');
	if (section === 'report' && link) return { href: guestReportHref(link), signIn: false };
	if (section === 'analyze') return { href: query ? `/scan?q=${encodeURIComponent(query)}` : '/scan', signIn: false };
	if (section === 'about') return { href: '/#about', signIn: false };
	if (section === 'faq') return { href: '/#faq', signIn: false };
	return { href: '/', signIn: true };
}

/** The pages of the signed-in workspace, in the order the sidebar shows them. */
export const WORKSPACE_PAGES = [
	{ href: '/app/home', label: 'Home', icon: 'house' },
	{ href: '/app/analyze', label: 'Check a product', icon: 'scan-search' },
	{ href: '/app/products', label: 'Products', icon: 'package-search' },
	{ href: '/app/history', label: 'History', icon: 'history' },
	{ href: '/app/wishlist', label: 'Wishlist', icon: 'heart' }
] as const;
