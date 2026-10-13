// Checks the four verdict colours and the brand colour in src/routes/layout.css, so a change to them can be tested
// instead of judged by eye.
//
//   npm run check:colors
//
// For light and dark it reads the tokens and checks that
//   - each strong colour (icon, border, chart) reads 3:1 or better on the card and on its own tint,
//   - the normal text colour reads 7:1 or better on each tint (text on a tint is never coloured),
//   - the four colours stay clearly apart for normal vision and for protan, deutan and tritan colour blindness,
//   - the brand colour reads 4.5:1 or better as button text and as a link on every background it can sit on, its
//     focus ring reads 3:1 on a card, and it stays just as clearly apart from each of the four verdict colours.
// Exits with an error if anything falls short.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/routes/layout.css', import.meta.url), 'utf8');
const block = (selector) => {
	const start = css.indexOf(selector + ' {');
	return css.slice(start, css.indexOf('\n}', start));
};
const token = (source, name) => {
	const found = new RegExp(`--${name}:\\s*oklch\\(([^)]+)\\)`).exec(source);
	if (!found) throw new Error(`--${name} not found`);
	const [L, C, h = '0'] = found[1].split('/')[0].trim().split(/\s+/).map(Number);
	return [L, C, h];
};

const clamp = (x) => Math.min(1, Math.max(0, x));
function toLinear([L, C, h]) {
	const a = C * Math.cos((h * Math.PI) / 180);
	const b = C * Math.sin((h * Math.PI) / 180);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	].map(clamp);
}
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};
function toOklab([r, g, b]) {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}
const distance = (a, b) => Math.hypot(...toOklab(a).map((v, i) => v - toOklab(b)[i]));
// Machado et al. 2009, full severity, on linear sRGB.
const BLINDNESS = {
	'normal vision': null,
	protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
	deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
	tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
const simulate = (rgb, m) => (m ? m.map((row) => clamp(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])) : rgb);

const TONES = { safety: ['destructive', 'destructive-soft'], caution: ['warning', 'warning-soft'], clear: ['success', 'success-soft'], unknown: ['unknown', 'unknown-soft'] };
const MIN_STRONG = 3;
const MIN_TEXT = 7;
const MIN_BRAND_TEXT = 4.5;
const MIN_APART = 0.09;

let failed = 0;
for (const [mode, source] of [['light', block(':root')], ['dark', block('.dark')]]) {
	// A token that a mode does not set keeps its light value.
	const get = (name) => {
		try {
			return token(source, name);
		} catch {
			return token(block(':root'), name);
		}
	};
	const card = toLinear(get('card'));
	const text = toLinear(get('foreground'));
	console.log(`\n${mode}`);
	const strong = {};
	for (const [tone, [fillName, softName]] of Object.entries(TONES)) {
		const fill = toLinear(get(fillName));
		const soft = toLinear(get(softName));
		strong[tone] = fill;
		const onCard = contrast(fill, card);
		const onSoft = contrast(fill, soft);
		const textOnSoft = contrast(text, soft);
		const ok = onCard >= MIN_STRONG && onSoft >= MIN_STRONG && textOnSoft >= MIN_TEXT;
		if (!ok) failed += 1;
		console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${tone.padEnd(8)} on card ${onCard.toFixed(1)}:1   on its tint ${onSoft.toFixed(1)}:1   text on tint ${textOnSoft.toFixed(1)}:1`);
	}
	const names = Object.keys(strong);
	for (const [kind, matrix] of Object.entries(BLINDNESS)) {
		let closest = { d: Infinity, pair: '' };
		for (let i = 0; i < names.length; i++) {
			for (let j = i + 1; j < names.length; j++) {
				const d = distance(simulate(strong[names[i]], matrix), simulate(strong[names[j]], matrix));
				if (d < closest.d) closest = { d, pair: `${names[i]} / ${names[j]}` };
			}
		}
		const ok = closest.d >= MIN_APART;
		if (!ok) failed += 1;
		console.log(`  ${ok ? 'ok  ' : 'FAIL'} apart for ${kind.padEnd(13)} closest pair ${closest.pair} (${closest.d.toFixed(3)})`);
	}

	// The brand colour: readable as a button and as a link, a visible focus ring, and never mistaken for a verdict.
	const brand = toLinear(get('brand'));
	const onBrand = contrast(toLinear(get('brand-foreground')), brand);
	const grounds = { page: 'background', card: 'card', 'grey row': 'muted', ...Object.fromEntries(Object.entries(TONES).map(([tone, [, softName]]) => [`${tone} tint`, softName])) };
	let weakest = { c: Infinity, where: '' };
	for (const [where, name] of Object.entries(grounds)) {
		const c = contrast(brand, toLinear(get(name)));
		if (c < weakest.c) weakest = { c, where };
	}
	const ring = contrast(toLinear(get('ring')), card);
	const readable = onBrand >= MIN_BRAND_TEXT && weakest.c >= MIN_BRAND_TEXT && ring >= MIN_STRONG;
	if (!readable) failed += 1;
	console.log(`  ${readable ? 'ok  ' : 'FAIL'} brand    text on a button ${onBrand.toFixed(1)}:1   as a link, at its weakest (${weakest.where}) ${weakest.c.toFixed(1)}:1   focus ring on card ${ring.toFixed(1)}:1`);
	let nearest = { d: Infinity, what: '' };
	for (const [kind, matrix] of Object.entries(BLINDNESS)) {
		for (const tone of names) {
			const d = distance(simulate(brand, matrix), simulate(strong[tone], matrix));
			if (d < nearest.d) nearest = { d, what: `${tone}, ${kind}` };
		}
	}
	const apart = nearest.d >= MIN_APART;
	if (!apart) failed += 1;
	console.log(`  ${apart ? 'ok  ' : 'FAIL'} brand    apart from every verdict colour; nearest is ${nearest.what} (${nearest.d.toFixed(3)})`);
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll colour checks passed.');
process.exit(failed ? 1 : 0);
