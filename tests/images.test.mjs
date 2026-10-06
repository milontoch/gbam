import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finish, makeImage, open, overflowX, status } from './lib.mjs';

const tmp = (name, size, head = '') => {
	const p = path.join(os.tmpdir(), 'gbam-test-' + name);
	fs.writeFileSync(p, head);
	fs.truncateSync(p, size);
	return p;
};
const download = async (page, sel) => {
	const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
	return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) };
};
const imageSize = (page, buf) =>
	page.evaluate(async (b64) => {
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		const bmp = await createImageBitmap(new Blob([bytes]));
		return [bmp.width, bmp.height];
	}, buf.toString('base64'));

export default async function (t) {
	// ---------------- Compress image ----------------
	{
		const page = await open(t, '/compress-image');
		const photo = await makeImage(page, { w: 3000, h: 2000, quality: 0.97, noise: false });
		const png = await makeImage(page, { w: 600, h: 400, type: 'image/png' });
		const files = [
			{ name: 'big photo.jpg', mimeType: 'image/jpeg', buffer: photo },
			{ name: 'logo.png', mimeType: 'image/png', buffer: png },
			{ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really an image') },
			{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
			{ name: '<img src=x onerror=window.__xss=1>.jpg', mimeType: 'image/jpeg', buffer: photo },
		];
		await page.setInputFiles('#file-input', files);
		await page.waitForFunction(() => /^(Done|No files)/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
		const rows = await page.$$eval('#results li', (ls) => ls.map((l) => l.innerText));
		t.check('compress: photo gets smaller', /smaller/.test(rows[0]), rows[0].replace(/\n/g, ' '));
		t.check('compress: broken file explained', /could not be opened/.test(rows[2]));
		t.check('compress: text file explained', /not an image/.test(rows[3]));
		t.check('compress: file names are shown as text, never run as HTML', !(await page.evaluate(() => window.__xss)) && (await page.$$('#results img')).length === 0);
		await page.evaluate(() => {
			const q = document.getElementById('quality');
			q.value = '30';
			q.dispatchEvent(new Event('input'));
		});
		await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Done'), null, { timeout: 60000 });
		const d = await download(page, '#results li:first-child a');
		t.check('compress: download is a real JPEG', d.buf.subarray(0, 3).toString('hex') === 'ffd8ff' && d.name === 'big photo-compressed.jpg', d.name);
		t.check('compress: no sideways scroll with results', !(await overflowX(page)));
		await finish(t, page, 'compress');
	}

	// large and hostile files
	{
		const page = await open(t, '/compress-image');
		const heavy = await makeImage(page, { w: 6000, h: 4500, quality: 0.9, noise: true });
		t.info(`large test photo: ${(heavy.length / 1048576).toFixed(1)} MB`);
		const t0 = Date.now();
		await page.setInputFiles('#file-input', { name: 'heavy.jpg', mimeType: 'image/jpeg', buffer: heavy });
		await page.waitForFunction(() => /^(Done|No files)/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
		const row = (await page.textContent('#results')).replace(/\s+/g, ' ');
		t.check('compress: a 27-megapixel photo is handled', /smaller|kept/.test(row), row.slice(0, 120));
		t.info(`27 MP photo took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

		await page.setInputFiles('#file-input', tmp('over40.jpg', 41 * 1024 * 1024, '\xff\xd8\xff'));
		await page.waitForFunction(() => document.getElementById('results').textContent.includes('larger than 40'), null, { timeout: 30000 });
		t.check('compress: file over 40 MB is refused politely', true);

		const huge = await makeImage(page, { w: 10000, h: 7000, type: 'image/png' });
		await page.setInputFiles('#file-input', { name: 'huge.png', mimeType: 'image/png', buffer: huge });
		await page.waitForFunction(() => document.getElementById('results').textContent.includes('too large'), null, { timeout: 60000 });
		t.check('compress: 70-megapixel image is refused instead of crashing', true);

		const many = Array.from({ length: 25 }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: Buffer.from(huge.subarray(0, 0)) }));
		const tiny = await makeImage(page, { w: 50, h: 50, type: 'image/png' });
		await page.setInputFiles('#file-input', many.map((f, i) => ({ ...f, buffer: tiny })));
		await page.waitForFunction(() => /^(Done|No files)/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
		t.check('compress: more than 20 files are cut to 20', (await page.$$('#results li')).length === 20, String((await page.$$('#results li')).length));
		await finish(t, page, 'compress-large');
	}

	// ---------------- Resize image ----------------
	{
		const page = await open(t, '/resize-image');
		const img = await makeImage(page, { w: 2000, h: 1000, type: 'image/png' });
		await page.setInputFiles('#file-input', { name: 'wide.png', mimeType: 'image/png', buffer: img });
		await page.waitForSelector('#editor:not(.hidden)');
		await page.fill('#width', '500');
		t.check('resize: proportions lock height to 250', (await page.inputValue('#height')) === '250');
		await page.selectOption('#format', 'image/jpeg');
		await page.click('#resize-btn');
		await page.waitForSelector('#results a');
		const d = await download(page, '#results a');
		const [w, h] = await imageSize(page, d.buf);
		t.check('resize: output really is 500x250', w === 500 && h === 250 && d.name === 'wide-500x250.jpg', `${w}x${h} ${d.name}`);
		await page.fill('#width', '9000');
		await page.click('#resize-btn');
		t.check('resize: over 8000 px refused', /at most 8000/.test(await status(page)));
		await page.uncheck('#lock');
		await page.fill('#width', '8000');
		await page.fill('#height', '8000');
		await page.click('#resize-btn');
		t.check('resize: over 16 megapixels refused', /too big/.test(await status(page)));
		await page.fill('#width', '-5');
		await page.click('#resize-btn');
		t.check('resize: negative size refused', /greater than 0|at most/.test(await status(page)) || (await page.$$('#results a')).length === 0);
		await page.fill('#width', '1e3');
		await page.fill('#height', '0');
		await page.click('#resize-btn');
		t.check('resize: zero height refused', /greater than 0/.test(await status(page)));
		await page.setInputFiles('#file-input', tmp('over40-resize.jpg', 41 * 1024 * 1024, '\xff\xd8\xff'));
		await page.waitForFunction(() => document.getElementById('status').textContent.includes('larger than 40'), null, { timeout: 30000 });
		t.check('resize: file over 40 MB refused', true);
		t.check('resize: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'resize');
	}

	// ---------------- Other formats and bad files, all image tools ----------------
	const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
	const bmp = (() => {
		const w = 40, h = 40, row = w * 3, size = 54 + row * h, b = Buffer.alloc(size);
		b.write('BM'); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22);
		b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
		for (let i = 54; i < size; i += 3) { b[i] = 200; b[i + 1] = 80; b[i + 2] = 20; }
		return b;
	})();
	for (const tool of ['/compress-image', '/resize-image', '/passport-photo-maker']) {
		const page = await open(t, tool);
		const out = () => (tool === '/compress-image' ? page.textContent('#results') : status(page));
		const ok = tool === '/compress-image' ? '#results li' : '#editor:not(.hidden)';
		t.check(`${tool}: file picker accepts any image and HEIC`, (await page.getAttribute('#file-input', 'accept')) === 'image/*,.heic,.heif');
		await page.setInputFiles('#file-input', { name: 'a.gif', mimeType: 'image/gif', buffer: gif });
		await page.waitForSelector(ok, { timeout: 20000 });
		t.check(`${tool}: GIF accepted`, !/could not be opened/.test(await out()));
		await page.reload();
		await page.setInputFiles('#file-input', { name: 'b.bmp', mimeType: 'image/bmp', buffer: bmp });
		await page.waitForSelector(ok, { timeout: 20000 });
		t.check(`${tool}: BMP accepted`, !/could not be opened/.test(await out()));
		for (const [label, file, expect] of [
			['HEIC (blank type, as Windows reports it)', { name: 'IMG_1.HEIC', mimeType: '', buffer: Buffer.from('....ftypheic') }, /HEIC.*Most Compatible/s],
			['PDF', { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }, /not an image/],
			['SVG', { name: 'a.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') }, /SVG/],
			['empty file', { name: 'e.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) }, /empty/],
			['disguised file (.jpg that is text)', { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('just text') }, /could not be opened/],
		]) {
			await page.reload();
			await page.setInputFiles('#file-input', file);
			await page.waitForFunction((sel) => { const r = document.querySelector(sel); return r && r.textContent.trim().length > 0; }, tool === '/compress-image' ? '#results' : '#status', { timeout: 20000 });
			t.check(`${tool}: ${label} gets a clear message`, expect.test(await out()), (await out()).slice(0, 80));
		}
		await finish(t, page, tool + ' formats');
	}
}
