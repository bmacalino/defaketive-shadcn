// A pretend Lazada review list, answering the requests extension/collect.js makes, the way the real list answers
// (as measured for the scanner, lazada_scraper.py): `filter` 0 is every review, 1-5 one star level, but 2 also
// holds the 1-star reviews; at most 50 a page; only the first 300 entries of a list; past them, success with no
// model. Reviews carry names and seller replies, which the collector must never keep.
const ORDER_IN_LIST = [5, 4, 3, 2, 1];

/**
 * written: written reviews per star (the rest of `scores` are ratings without text).
 * Options: blankEvery (every Nth review has no text), check (answer a check page from this request on),
 * brokenAt (answer an error page from this request on), rateCount (override the reported total).
 */
export function pretendFeed({ scores, written, blankEvery = 0, check = 0, brokenAt = 0, rateCount, average } = {}) {
	const byStar = {};
	let id = 1000000;
	for (const star of ORDER_IN_LIST) {
		byStar[star] = Array.from({ length: written[star] ?? 0 }, (_, n) => ({
			reviewRateId: id++,
			rating: star,
			reviewTime: n % 2 ? '31 May 2026' : '2 weeks ago',
			reviewContent: blankEvery && n % blankEvery === blankEvery - 1 ? '' : `  ${star}-star review number ${n}  `,
			skuInfo: 'Color:Black',
			likeCount: n % 4,
			buyerName: `Real Person ${n}`,
			replies: [{ reviewContent: 'Thank you po!' }]
		}));
	}
	const requests = [];
	const total = scores.reduce((a, b) => a + b, 0);
	const mean = total ? scores.reduce((sum, count, i) => sum + count * (5 - i), 0) / total : 0;

	async function fetchText(url) {
		const query = new URL(url).searchParams;
		const star = Number(query.get('filter'));
		const page = Number(query.get('pageNo'));
		const size = Number(query.get('pageSize'));
		requests.push({ star, page, size, itemId: query.get('itemId') });
		if (check && requests.length >= check) return '<html><body>_____tmd_____ please slide to verify</body></html>';
		if (brokenAt && requests.length >= brokenAt) return '<html>Service unavailable</html>';
		const list = star === 0 ? ORDER_IN_LIST.flatMap((s) => byStar[s]) : star === 2 ? [...byStar[2], ...byStar[1]] : byStar[star];
		const visible = list.slice(0, 300);
		const start = (page - 1) * size;
		if (start >= 300) return JSON.stringify({ success: true, model: null });
		const items = visible.slice(start, start + size);
		return JSON.stringify({
			success: true,
			model: {
				items,
				paging: { totalPages: Math.ceil(list.length / size), currentPage: page },
				ratings: { scores, rateCount: rateCount ?? total, average: average ?? Number(mean.toFixed(1)) }
			}
		});
	}
	return { fetchText, requests };
}
