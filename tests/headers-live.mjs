// Checks that the deployed site really sends the security headers.
//   node tests/headers-live.mjs https://gbam.pages.dev
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
	console.error('Usage: node tests/headers-live.mjs https://your-site');
	process.exit(2);
}

const must = {
	'content-security-policy': /default-src 'self'.*script-src 'self' 'wasm-unsafe-eval'.*frame-ancestors 'none'/,
	'x-content-type-options': /nosniff/,
	'referrer-policy': /strict-origin-when-cross-origin/,
	'permissions-policy': /camera=\(\)/,
	'cross-origin-opener-policy': /same-origin/,
	'x-frame-options': /DENY/,
	'strict-transport-security': /max-age=\d{7,}/,
};

let failed = 0;
const check = (label, ok, extra = '') => {
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  [' + extra + ']' : ''}`);
};

for (const path of ['/', '/compress-image', '/privacy', '/models/modnet-uint8.onnx']) {
	const res = await fetch(base + path);
	check(`${path} answers 200`, res.status === 200, String(res.status));
	for (const [name, re] of Object.entries(must)) check(`${path}: ${name}`, re.test(res.headers.get(name) || ''), res.headers.get(name)?.slice(0, 60) || 'missing');
}
const assets = [...(await (await fetch(base + '/compress-image')).text()).matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)].map((m) => m[1]);
for (const a of assets.slice(0, 3)) {
	const res = await fetch(base + a);
	check(`${a}: cached for a year`, /max-age=31536000/.test(res.headers.get('cache-control') || ''), res.headers.get('cache-control') || 'missing');
}
const wasm = await fetch(base + '/compress-image').then(() => null);
void wasm;
const http = await fetch(base.replace('https://', 'http://') + '/', { redirect: 'manual' }).catch(() => null);
if (http) check('plain http redirects to https', [301, 302, 307, 308].includes(http.status) && (http.headers.get('location') || '').startsWith('https://'), String(http.status));
console.log(failed ? `\n${failed} problem(s)` : '\nAll good');
process.exit(failed ? 1 : 0);
