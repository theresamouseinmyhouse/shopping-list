// crypto.randomUUID() only exists in a secure context (https or localhost). This
// app is reached over plain http on the LAN (e.g. http://<host>:2120), so
// use it when available and fall back to a getRandomValues-based v4 UUID otherwise.
export function uuid(): string {
	const c = globalThis.crypto;
	if (c?.randomUUID) return c.randomUUID();

	const b = new Uint8Array(16);
	if (c?.getRandomValues) c.getRandomValues(b);
	else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
	return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
		.slice(8, 10)
		.join('')}-${h.slice(10, 16).join('')}`;
}
