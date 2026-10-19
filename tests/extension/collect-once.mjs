// Prints what extension/collect.js gathers from a pretend review list, with the details lazada.js adds, as the
// JSON the site sends to /api/extension/check. tests/test_extension_api.py runs it, so the server's checks are
// tested against what the extension really produces.  Usage: node collect-once.mjs '<pretendFeed options JSON>'
import { pretendFeed } from './pretend-feed.mjs';

await import('../../extension/collect.js');
const options = JSON.parse(process.argv[2] || '{}');
const feed = pretendFeed(options);
const result = await globalThis.DefaketiveCollect.collect({
	url: 'https://www.lazada.com.ph/products/pdp-i5249925664-s31137449814.html',
	fetchText: feed.fetchText,
	sleep: async () => {}
});
const { status, ...collected } = result;
process.stdout.write(
	JSON.stringify({
		status,
		product: {
			link: 'https://www.lazada.com.ph/products/pdp-i5249925664-s31137449814.html',
			name: 'Pretend earbuds',
			price: '₱499.00',
			brand: '',
			seller: 'Pretend store',
			img: 'https://img.lazcdn.com/g/p/pretend.jpg',
			...collected
		}
	})
);
