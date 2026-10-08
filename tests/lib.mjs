// Shared helpers for the browser tests. Run everything with: npm run test:e2e
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE_URL || 'http://localhost:4399';
export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch() {
	// On GitHub's servers Chrome needs --no-sandbox; on your own computer the normal sandbox is kept.
	return chromium.launch({ executablePath: CHROME, args: process.env.CI ? ['--no-sandbox'] : [] });
}

export class Report {
	constructor() {
		this.passed = 0;
		this.failed = 0;
		this.failures = [];
	}
	check(label, ok, extra = '') {
		if (ok) this.passed++;
		else {
			this.failed++;
			this.failures.push(label);
		}
		console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  [' + String(extra).slice(0, 160) + ']' : ''}`);
	}
	info(text) {
		console.log(`INFO  ${text}`);
	}
}

// Opens a page in its own fresh browser context and records errors and network traffic.
export async function open(t, path, opts = {}) {
	const context = await t.browser.newContext({
		viewport: { width: opts.width ?? 375, height: opts.height ?? 800 },
		deviceScaleFactor: opts.dpr ?? 1,
		acceptDownloads: true,
	});
	// The only outside host the site may ever contact is Cloudflare's cookie-free analytics.
	// Tests block it, so they never send fake visits, and every other outside request still fails the test.
	await context.route(/cloudflareinsights\.com/, (r) => r.abort());
	const page = await context.newPage();
	page.log = { errors: [], requests: [] };
	page.on('pageerror', (e) => page.log.errors.push(e.message));
	// A blocked analytics request is expected in tests, so its console message is not a real error.
	page.on('console', (m) => m.type() === 'error' && !/cloudflareinsights\.com/.test(m.location().url || '') && page.log.errors.push(m.text()));
	page.on('request', (r) => page.log.requests.push({ url: r.url(), method: r.method() }));
	await page.goto(BASE + path, { waitUntil: opts.waitUntil ?? 'load' });
	return page;
}

// Called when a test is finished with a page. Enforces the privacy promises on every page we test.
export async function finish(t, page, label) {
	const { requests, errors } = page.log;
	const analytics = /^https:\/\/(static\.)?cloudflareinsights\.com\//;
	const leaving = requests.filter((r) => !r.url.startsWith(BASE) && !/^(blob|data):/.test(r.url) && !analytics.test(r.url));
	t.check(`${label}: no request leaves the site`, leaving.length === 0, leaving.map((r) => r.url).join(' '));
	const writes = requests.filter((r) => !['GET', 'HEAD'].includes(r.method) && !/^(blob|data):/.test(r.url) && !analytics.test(r.url));
	t.check(`${label}: nothing is uploaded (GET only)`, writes.length === 0, writes.map((r) => r.method + ' ' + r.url).join(' '));
	const cookies = await page.context().cookies();
	t.check(`${label}: no cookies set`, cookies.length === 0, cookies.map((c) => c.name).join(','));
	const stored = await page.evaluate(() => localStorage.length + sessionStorage.length).catch(() => 0);
	t.check(`${label}: nothing kept in browser storage`, stored === 0, String(stored));
	t.check(`${label}: no JavaScript errors`, errors.length === 0, errors.join(' | '));
	await page.context().close();
}

export const status = (page, sel = '#status') => page.textContent(sel);
export const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

// Makes an image inside the browser and returns it as a Node Buffer.
export async function makeImage(page, { w, h, type = 'image/jpeg', quality = 0.9, noise = false }) {
	const b64 = await page.evaluate(
		async ({ w, h, type, quality, noise }) => {
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			const x = c.getContext('2d');
			x.fillStyle = '#3b82a6';
			x.fillRect(0, 0, w, h);
			x.fillStyle = '#e8c9a0';
			x.beginPath();
			x.ellipse(w / 2, h * 0.4, w * 0.2, h * 0.28, 0, 0, 7);
			x.fill();
			if (noise) {
				const img = x.getImageData(0, 0, w, h);
				for (let off = 0; off < img.data.length; off += 65536) crypto.getRandomValues(img.data.subarray(off, Math.min(off + 65536, img.data.length)));
				x.putImageData(img, 0, 0);
			}
			const blob = await new Promise((r) => c.toBlob(r, type, quality));
			c.width = c.height = 0;
			const buf = new Uint8Array(await blob.arrayBuffer());
			let s = '';
			for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
			return btoa(s);
		},
		{ w, h, type, quality, noise },
	);
	return Buffer.from(b64, 'base64');
}
