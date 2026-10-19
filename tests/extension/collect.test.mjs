// extension/collect.js: it reads the review list the way the scanner does. Run with: npm run test:extension
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pretendFeed } from './pretend-feed.mjs';

await import('../../extension/collect.js');
const { collect } = globalThis.DefaketiveCollect;

const URL_ = 'https://www.lazada.com.ph/products/pdp-i5249925664-s31137449814.html?spm=a2o4l';
const run = (feed, extra = {}) => {
	const pauses = [];
	const steps = [];
	return collect({ url: URL_, fetchText: feed.fetchText, sleep: async (ms) => pauses.push(ms), onStep: (s) => steps.push(s), ...extra }).then(
		(result) => ({ result, pauses, steps })
	);
};

test('collects each star level in the scanner order, up to 60, and records why each stopped', async () => {
	// scores are 5 stars first; written = reviews with text per star.
	const feed = pretendFeed({ scores: [400, 20, 10, 5, 3], written: { 5: 150, 4: 15, 3: 8, 2: 4, 1: 3 } });
	const { result, pauses } = await run(feed);
	assert.equal(result.status, 'ok');
	assert.deepEqual(result.ratings.scores, [400, 20, 10, 5, 3]);
	assert.deepEqual(result.levels, {
		1: { stop_reason: 'feed_ended' },
		2: { stop_reason: 'feed_ended' },
		3: { stop_reason: 'feed_ended' },
		4: { stop_reason: 'feed_ended' },
		5: { stop_reason: 'target_reached' }
	});
	const perStar = Object.fromEntries([1, 2, 3, 4, 5].map((s) => [s, result.reviews.filter((r) => r.rating === s).length]));
	assert.deepEqual(perStar, { 1: 3, 2: 4, 3: 8, 4: 15, 5: 60 });
	// First the counts (every review, page 1), then 3, 2, 4, 1, 5; 50 a page; the 5-star level needs two pages.
	assert.deepEqual(
		feed.requests.map((r) => [r.star, r.page]),
		[[0, 1], [3, 1], [2, 1], [4, 1], [1, 1], [5, 1], [5, 2]]
	);
	assert.ok(feed.requests.every((r) => r.size === 50 && r.itemId === '5249925664'));
	// One request at a time, a second apart.
	assert.equal(pauses.length, feed.requests.length - 1);
	assert.ok(pauses.every((ms) => ms === 1000));
});

test('keeps no names or seller replies, and tidies the text', async () => {
	const feed = pretendFeed({ scores: [5, 0, 0, 0, 0], written: { 5: 5 } });
	const { result } = await run(feed);
	const review = result.reviews[0];
	assert.deepEqual(Object.keys(review).sort(), ['comment_id', 'content', 'like_count', 'rating', 'source_rating_filter', 'time', 'variation']);
	assert.equal(review.content, '5-star review number 0');
	assert.equal(JSON.stringify(result).includes('Real Person'), false);
	assert.equal(JSON.stringify(result).includes('Thank you po'), false);
	assert.deepEqual(result.levels[4], { stop_reason: 'none_listed' });
});

test('skips 1-star reviews in the 2-star list and reviews without text', async () => {
	const feed = pretendFeed({ scores: [0, 0, 0, 30, 30], written: { 2: 30, 1: 30 }, blankEvery: 3 });
	const { result } = await run(feed);
	assert.equal(result.reviews.filter((r) => r.rating === 2).length, 20);
	assert.ok(result.reviews.every((r) => r.content && r.rating === r.source_rating_filter));
});

test("stops at the list's depth of 300", async () => {
	// 400 one-star reviews: the 2-star list holds 2-star then 1-star ones, and is cut at 300.
	const feed = pretendFeed({ scores: [0, 0, 0, 40, 400], written: { 2: 0, 1: 400 } });
	const { result } = await run(feed);
	assert.equal(result.status, 'ok');
	assert.deepEqual(result.levels[2], { stop_reason: 'feed_limit' });
	assert.deepEqual(result.levels[1], { stop_reason: 'target_reached' });
	assert.equal(feed.requests.filter((r) => r.star === 2).length, 6);
});

test("stops for a check, and does nothing to get past it", async () => {
	const feed = pretendFeed({ scores: [100, 0, 10, 0, 0], written: { 5: 100, 3: 10 }, check: 3 });
	const { result } = await run(feed);
	assert.deepEqual(result, { status: 'check' });
	assert.equal(feed.requests.length, 3);
});

test('an error page, a missing list or counts that do not add up are "unavailable"', async () => {
	assert.equal((await run(pretendFeed({ scores: [5, 0, 0, 0, 0], written: { 5: 5 }, brokenAt: 1 }))).result.status, 'unavailable');
	assert.equal((await run(pretendFeed({ scores: [5, 0, 0, 0, 0], written: { 5: 5 }, brokenAt: 2 }))).result.status, 'unavailable');
	assert.equal((await run(pretendFeed({ scores: [50, 0, 0, 0, 0], written: { 5: 5 }, rateCount: 80 }))).result.status, 'unavailable');
});

test('nothing to check', async () => {
	assert.equal((await run(pretendFeed({ scores: [0, 0, 0, 0, 0], written: {} }))).result.status, 'no_ratings');
	assert.equal((await run(pretendFeed({ scores: [12, 3, 0, 0, 0], written: {} }))).result.status, 'no_written_reviews');
	const notProduct = await collect({ url: 'https://www.lazada.com.ph/catalog/?q=earbuds', fetchText: async () => '' });
	assert.equal(notProduct.status, 'not_a_product');
});

test('reports progress for the panel', async () => {
	const feed = pretendFeed({ scores: [70, 0, 5, 0, 0], written: { 5: 70, 3: 5 } });
	const { steps } = await run(feed);
	assert.equal(steps[0].step, 'ratings');
	assert.ok(steps.some((s) => s.step === 'level' && s.star === 5 && s.collected === 65));
});
