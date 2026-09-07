// Generates the PWA icons into static/. Flat brand square with a simple check glyph.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [17, 24, 39]; // #111827
const FG = [96, 165, 250]; // #60a5fa

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(buf) {
	let c = 0xffffffff;
	for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const t = Buffer.from(type, 'ascii');
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
	return Buffer.concat([len, t, data, crc]);
}
function png(size) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type: truecolor
	const stride = size * 3 + 1;
	const raw = Buffer.alloc(stride * size);
	// thick check mark within the middle 60%
	const inChk = (x, y) => {
		const u = x / size;
		const v = y / size;
		const w = 0.09;
		const d1 = Math.abs(v - 0.55 - (u - 0.3) * 0.9);
		const d2 = Math.abs(v - 0.62 + (u - 0.5) * 1.3);
		return (u > 0.28 && u < 0.5 && d1 < w) || (u >= 0.5 && u < 0.75 && d2 < w);
	};
	for (let y = 0; y < size; y++) {
		raw[y * stride] = 0;
		for (let x = 0; x < size; x++) {
			const o = y * stride + 1 + x * 3;
			const c = inChk(x, y) ? FG : BG;
			raw[o] = c[0];
			raw[o + 1] = c[1];
			raw[o + 2] = c[2];
		}
	}
	return Buffer.concat([
		sig,
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

mkdirSync('static', { recursive: true });
for (const size of [192, 512]) {
	writeFileSync(`static/icon-${size}.png`, png(size));
	console.log(`static/icon-${size}.png`);
}
writeFileSync(
	'static/favicon.svg',
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#111827"/><path d="M9 17l4 4 10-11" stroke="#60a5fa" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
);
console.log('static/favicon.svg');
