// How the DeFaketive extension reads a Lazada product's reviews.
//
// The same review list, read the same way, as DeFaketive's own scanner reads it
// (backend/lazada-scraper/src/lazada_scraper.py, "feed" mode), so a report made from the extension's reviews is
// the report a scan would make:
//   - the list the product page itself loads (my.lazada.com.ph/pdp/review/getReviewList), asked from inside the
//     product page, with the shopper's own Lazada session, as the page asks it;
//   - the star counts from its first page, then up to 60 written reviews from each star level, in the order
//     3, 2, 4, 1, 5; 50 per request; the list gives at most its first 300 entries ("feed_limit");
//   - the 2-star list also holds 1-star reviews, which are skipped there; reviews with no text are skipped;
//   - one request at a time, a second apart.
// If Lazada answers with its check page instead of reviews, collection stops and the shopper is told; nothing is
// done to get past a check. Reviewers' names and sellers' replies are never read.
//
// This file only defines DefaketiveCollect. lazada-page.js runs it inside the product page; the tests run it in Node
// with a pretend review list (tests/extension/collect.test.mjs).
globalThis.DefaketiveCollect = (() => {
	const FEED = 'https://my.lazada.com.ph/pdp/review/getReviewList';
	const ORDER = [3, 2, 4, 1, 5];
	const QUOTA = 60;
	const PAGE_SIZE = 50;
	const DEPTH = 300;
	const PAUSE_MS = 1000;
	// What Lazada sends in place of reviews when it wants a check (FEED_VERIFICATION_MARKERS in the scanner).
	const CHECK_MARKERS = ['_____tmd_____', '"action":"captcha"', 'rgv587_flag'];

	const itemId = (url) => (String(url || '').match(/-i(\d{5,})(?:-s\d+)?\.html/) || [])[1] || '';
	const clean = (text) =>
		String(text ?? '')
			.replace(/ /g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	const whole = (value) => {
		const parsed = Math.trunc(Number.parseFloat(value));
		return Number.isFinite(parsed) ? parsed : 0;
	};
	const feedUrl = (id, star, page) =>
		`${FEED}?itemId=${id}&pageSize=${PAGE_SIZE}&filter=${star}&sort=0&pageNo=${page}`;

	/** One page of the list: {model}, or {problem: 'check' | 'unavailable'}. */
	async function readPage(fetchText, id, star, page) {
		let text;
		try {
			text = String(await fetchText(feedUrl(id, star, page)));
		} catch {
			return { problem: 'unavailable' };
		}
		let body = null;
		try {
			body = JSON.parse(text);
		} catch {
			/* not JSON: a check page, or an error page */
		}
		const model = body && typeof body === 'object' ? body.model : null;
		if (model && typeof model === 'object' && Array.isArray(model.items)) return { model };
		// The answer to a page past the entries the list gives.
		if (body && body.success === true && model == null) return { model: { items: [], paging: {}, beyondDepth: true } };
		if (CHECK_MARKERS.some((marker) => text.includes(marker))) return { problem: 'check' };
		return { problem: 'unavailable' };
	}

	/** The five star counts, 5 stars first as the list gives them, or null if they don't add up. */
	function starCounts(ratings) {
		const scores = ratings && Array.isArray(ratings.scores) ? ratings.scores : null;
		if (!scores || scores.length !== 5) return null;
		const counts = scores.map((value) => Number(value));
		if (counts.some((count) => !Number.isInteger(count) || count < 0)) return null;
		const reported = whole(ratings.rateCount);
		const sum = counts.reduce((a, b) => a + b, 0);
		if (reported && Math.abs(sum - reported) > 0.05 * reported) return null;
		return counts;
	}

	/** One entry of the list, as DeFaketive keeps it. No name, no seller reply. */
	function review(item, star) {
		return {
			comment_id: String(item.reviewRateId ?? ''),
			rating: whole(item.rating),
			source_rating_filter: star,
			time: clean(item.reviewTime),
			content: clean(item.reviewContent),
			variation: clean(item.skuInfo),
			like_count: whole(item.likeCount)
		};
	}

	/** Up to 60 written reviews of one star level, and why collection of that level stopped. */
	async function collectLevel({ fetchText, sleep, id, star, onCount }) {
		const collected = [];
		const seen = new Set();
		let stop = '';
		let page = 0;
		while (!stop) {
			if (page) await sleep(PAUSE_MS);
			page += 1;
			const { model, problem } = await readPage(fetchText, id, star, page);
			if (problem) return { problem };
			if (model.beyondDepth) {
				// On a first page there is no list at all, which is a failure.
				if (page === 1) return { problem: 'unavailable' };
				stop = 'feed_limit';
				break;
			}
			for (const item of model.items) {
				if (!item || typeof item !== 'object') continue;
				const entry = review(item, star);
				if (entry.rating !== star || !entry.content || !/^\d+$/.test(entry.comment_id)) continue;
				if (seen.has(entry.comment_id)) continue;
				seen.add(entry.comment_id);
				collected.push(entry);
				if (collected.length >= QUOTA) {
					stop = 'target_reached';
					break;
				}
			}
			onCount?.(collected.length);
			const totalPages = whole(model.paging?.totalPages);
			if (!stop && (!model.items.length || (totalPages && page >= totalPages))) stop = 'feed_ended';
			else if (!stop && page * PAGE_SIZE >= DEPTH) stop = 'feed_limit';
		}
		return { reviews: collected, stop };
	}

	/**
	 * Every review DeFaketive needs from a product page.
	 *   fetchText(url) -> the answer's text (the page's own fetch, with the shopper's session)
	 *   sleep(ms), onStep({step, star?, collected?}) for the progress panel
	 * Returns {status: 'ok', ratings, levels, reviews} or {status: 'not_a_product' | 'check' | 'unavailable' |
	 * 'no_ratings' | 'no_written_reviews'}.
	 */
	async function collect({ url, fetchText, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), onStep = () => {} }) {
		const id = itemId(url);
		if (!id) return { status: 'not_a_product' };
		onStep({ step: 'ratings' });
		const first = await readPage(fetchText, id, 0, 1);
		if (first.problem) return { status: first.problem };
		if (first.model.beyondDepth) return { status: 'unavailable' };
		const ratings = first.model.ratings || {};
		const counts = starCounts(ratings);
		if (!counts) return { status: 'unavailable' };
		const listed = { 1: counts[4], 2: counts[3], 3: counts[2], 4: counts[1], 5: counts[0] };
		if (!counts.some(Boolean)) return { status: 'no_ratings' };

		const levels = {};
		const reviews = [];
		let done = 0;
		for (const star of ORDER) {
			if (!listed[star]) {
				levels[star] = { stop_reason: 'none_listed' };
				done += 1;
				continue;
			}
			onStep({ step: 'level', star, done, collected: reviews.length });
			await sleep(PAUSE_MS);
			const result = await collectLevel({
				fetchText,
				sleep,
				id,
				star,
				onCount: (count) => onStep({ step: 'level', star, done, collected: reviews.length + count })
			});
			if (result.problem) return { status: result.problem };
			levels[star] = { stop_reason: result.stop };
			reviews.push(...result.reviews);
			done += 1;
		}
		if (!reviews.length) return { status: 'no_written_reviews' };
		const average = Number.parseFloat(ratings.average);
		return {
			status: 'ok',
			ratings: { scores: counts, average: Number.isFinite(average) ? average : 0 },
			levels,
			reviews
		};
	}

	return { collect, itemId, clean, feedUrl, ORDER, QUOTA, PAGE_SIZE, DEPTH, PAUSE_MS };
})();
