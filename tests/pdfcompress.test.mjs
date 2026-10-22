import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import { finish, makeImage, open, overflowX } from './lib.mjs';

const mb = (n) => (n / 1048576).toFixed(1);
const pdfFile = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });
const pages = async (buf) => (await PDFDocument.load(buf)).getPageCount();

// Reads the text out of a PDF the way a search engine or a screen reader would.
async function textOf(buf) {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = pdfjs.getDocument({
		data: new Uint8Array(buf),
		standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
		isEvalSupported: false,
		verbosity: 0,
	});
	const pdf = await task.promise;
	let out = '';
	for (let i = 1; i <= pdf.numPages; i++) out += (await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + ' ';
	await task.destroy();
	return out.trim();
}

// The JPEG pictures stored inside a PDF.
async function jpegsIn(buf) {
	const doc = await PDFDocument.load(buf);
	const found = [];
	for (const [, obj] of doc.context.enumerateIndirectObjects()) {
		if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') && obj.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode')) found.push(obj.getContents());
	}
	return found;
}

// Mean brightness and spread of a picture: a blank page has a spread of 0.
const stats = (page, bytes) =>
	page.evaluate(async (b64) => {
		const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }));
		const c = document.createElement('canvas');
		c.width = 64;
		c.height = 64;
		const x = c.getContext('2d');
		x.drawImage(bmp, 0, 0, 64, 64);
		const d = x.getImageData(0, 0, 64, 64).data;
		let s = 0, q = 0;
		for (let i = 0; i < d.length; i += 4) {
			const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
			s += l;
			q += l * l;
		}
		const n = d.length / 4;
		return { mean: s / n, spread: Math.sqrt(Math.max(0, q / n - (s / n) ** 2)) };
	}, Buffer.from(bytes).toString('base64'));

async function scanLike(t, count, w, h) {
	const helper = await open(t, '/');
	const jpg = await makeImage(helper, { w, h, quality: 0.9, noise: true });
	await helper.context().close();
	const doc = await PDFDocument.create();
	for (let i = 0; i < count; i++) {
		const img = await doc.embedJpg(jpg); // each call stores its own copy, like separate scanned pages
		doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: Math.round((595 * h) / w) });
	}
	return Buffer.from(await doc.save());
}

async function textAndPicture(t) {
	const helper = await open(t, '/');
	const jpg = await makeImage(helper, { w: 3000, h: 2000, quality: 0.9, noise: true });
	await helper.context().close();
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const img = await doc.embedJpg(jpg);
	const p = doc.addPage([595, 842]);
	p.drawText('Certificate of Merit 12345', { x: 40, y: 780, font, size: 20 });
	p.drawImage(img, { x: 40, y: 300, width: 500, height: 333 });
	return Buffer.from(await doc.save());
}

async function textOnly() {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let i = 1; i <= 3; i++) doc.addPage([595, 842]).drawText(`Plain text page ${i}. No pictures here.`, { x: 40, y: 780, font, size: 14 });
	return Buffer.from(await doc.save());
}

async function lockedPdf() {
	const d = await PDFDocument.create();
	d.addPage([200, 200]);
	d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }));
	return Buffer.from(await d.save({ useObjectStreams: false }));
}

// Opens the tool, loads a file, optionally picks settings, presses Compress and waits until it stops.
async function runTool(t, file, { max = false, level, target, route = '/compress-pdf' } = {}) {
	const page = await open(t, route);
	await page.setInputFiles('#file-input', file);
	await page.waitForSelector('#editor:not(.hidden), #status.error', { timeout: 90000 }); // generous: live networks vary
	if (await page.isHidden('#editor')) return { page, ok: false };
	if (max) await page.check('#method-max');
	if (level !== undefined) await page.selectOption('#level', String(level));
	if (target) await page.fill('#target-kb', String(target));
	const t0 = Date.now();
	await page.click('#go-btn');
	await page.waitForFunction(
		() => !document.getElementById('go-btn').disabled && (document.querySelector('#results a') || document.getElementById('status').classList.contains('error') || /Cancelled/.test(document.getElementById('status').textContent)),
		null,
		{ timeout: 240000 },
	);
	const seconds = (Date.now() - t0) / 1000;
	const link = await page.$('#results a');
	let out = null;
	if (link) {
		const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
		out = fs.readFileSync(await dl.path());
	}
	return { page, ok: true, out, seconds, detail: link ? await page.textContent('#results .result-detail') : '', status: await page.textContent('#status') };
}

export default async function (t) {
	const scan = await scanLike(t, 3, 3500, 2500);
	t.info(`scan-like test PDF: ${mb(scan.length)} MB, 3 pages of pictures`);

	// ---- Keep text, on a scanned-style document ----
	{
		const r = await runTool(t, pdfFile('scan.pdf', scan), { level: 1 });
		t.check('keep: a scanned-style PDF becomes much smaller', r.out && r.out.length < scan.length * 0.5, r.out ? `${mb(scan.length)} -> ${mb(r.out.length)} MB` : r.status);
		t.check('keep: it still has 3 pages', r.out && (await pages(r.out)) === 3);
		t.check('keep: the message says how many pictures were shrunk', /3 of 3 pictures shrunk/.test(r.detail), r.detail);
		t.info(`keep-text on ${mb(scan.length)} MB took ${r.seconds.toFixed(1)}s`);
		t.check('keep: no sideways scroll', !(await overflowX(r.page)));
		await finish(t, r.page, 'compress-pdf keep');

		// Proof that the shrunken file is a real, drawable PDF: push it through the other mode, which must render every page.
		const check = await runTool(t, pdfFile('shrunk.pdf', r.out), { max: true, level: 1 });
		const imgs = check.out ? await jpegsIn(check.out) : [];
		const s = imgs.length ? await stats(check.page, imgs[0]) : { spread: 0 };
		t.check('keep: the shrunken PDF still draws its pictures (not blank)', imgs.length === 3 && s.spread > 20, `spread ${Math.round(s.spread)}`);
		await check.page.context().close();
	}

	// ---- Text must survive "keep" and vanish in "maximum" ----
	{
		const mixed = await textAndPicture(t);
		t.check('fixture: the mixed PDF really has searchable text', (await textOf(mixed)).includes('Certificate of Merit'));
		const keep = await runTool(t, pdfFile('mixed.pdf', mixed), { level: 1 });
		t.check('keep: the picture shrinks', keep.out && keep.out.length < mixed.length * 0.6, keep.out ? `${mb(mixed.length)} -> ${mb(keep.out.length)} MB` : keep.status);
		t.check('keep: the text is still there and searchable', keep.out && (await textOf(keep.out)).includes('Certificate of Merit 12345'));
		await keep.page.context().close();

		const max = await runTool(t, pdfFile('mixed.pdf', mixed), { max: true, level: 1 });
		t.check('maximum: the file gets smaller', max.out && max.out.length < mixed.length * 0.6, max.out ? `${mb(mixed.length)} -> ${mb(max.out.length)} MB` : max.status);
		t.check('maximum: the page count is unchanged', max.out && (await pages(max.out)) === 1);
		t.check('maximum: text is now a picture (as the page says)', max.out && (await textOf(max.out)) === '');
		t.check('maximum: the message warns that text cannot be selected', /text cannot be selected/.test(max.detail), max.detail);
		const imgs = max.out ? await jpegsIn(max.out) : [];
		const s = imgs.length ? await stats(max.page, imgs[0]) : { spread: 0 };
		t.check('maximum: the page was really drawn (not blank)', s.spread > 15, `spread ${Math.round(s.spread)}`);
		await finish(t, max.page, 'compress-pdf maximum');
	}

	// ---- A PDF that cannot be made smaller must be left alone ----
	{
		const plain = await textOnly();
		const keep = await runTool(t, pdfFile('plain.pdf', plain), {});
		t.check('plain text PDF: no download offered in keep mode', !keep.out, keep.status);
		t.check('plain text PDF: it says there are no large pictures', /no large pictures/.test(keep.status), keep.status);
		t.check('plain text PDF: it offers maximum compression instead', await keep.page.isVisible('#next-btn'));
		await keep.page.context().close();

		const max = await runTool(t, pdfFile('plain.pdf', plain), { max: true });
		t.check('plain text PDF: maximum would make it bigger, so it refuses', !max.out && /could not be made clearly smaller/.test(max.status), max.status);
		await max.page.context().close();
	}

	// ---- Size target ----
	{
		const reachable = Math.round(scan.length / 1024 / 6);
		const r = await runTool(t, pdfFile('scan.pdf', scan), { level: 0, target: reachable });
		t.check(`target: gets under ${reachable} KB by trying stronger settings`, r.out && r.out.length <= reachable * 1024, r.out ? `${Math.round(r.out.length / 1024)} KB` : r.status);
		await r.page.context().close();

		const impossible = await runTool(t, pdfFile('scan.pdf', scan), { level: 0, target: 15 });
		t.check('target: an impossible size gives the smallest result and says so', impossible.out && /not under/.test(impossible.status), impossible.status);
		await impossible.page.context().close();
	}

	// ---- Bad input ----
	for (const [label, file, expect] of [
		['password-protected PDF', pdfFile('locked.pdf', await lockedPdf()), /password-protected|could not be read/],
		['damaged PDF', pdfFile('corrupt.pdf', Buffer.from('%PDF-1.4\n garbage garbage')), /could not be read|no large pictures|could not be made/],
		['text file renamed to .pdf', pdfFile('fake.pdf', Buffer.from('just some words')), /does not look like a PDF/],
		['empty file', pdfFile('empty.pdf', Buffer.alloc(0)), /empty/],
	]) {
		for (const max of [false, true]) {
			const r = await runTool(t, file, { max });
			const msg = await r.page.textContent('#status');
			t.check(`bad input (${max ? 'maximum' : 'keep'}): ${label} gets a clear message and no download`, !r.out && expect.test(msg), msg);
			await r.page.context().close();
		}
	}
	{
		const big = path.join(os.tmpdir(), 'gbam-test-over100.pdf');
		fs.writeFileSync(big, '%PDF-1.4\n');
		fs.truncateSync(big, 101 * 1024 * 1024);
		const page = await open(t, '/compress-pdf');
		await page.setInputFiles('#file-input', big);
		await page.waitForFunction(() => /larger than 100/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
		t.check('bad input: a file over 100 MB is refused', true);
		await finish(t, page, 'compress-pdf limits');
	}

	// ---- Cancel ----
	{
		const long = await scanLike(t, 60, 800, 1100);
		t.info(`long test PDF: ${mb(long.length)} MB, 60 pages`);
		const longPath = path.join(os.tmpdir(), 'gbam-test-long.pdf'); // too big to pass directly to the test browser
		fs.writeFileSync(longPath, long);
		const page = await open(t, '/compress-pdf');
		await page.setInputFiles('#file-input', longPath);
		await page.waitForSelector('#editor:not(.hidden)');
		await page.check('#method-max');
		await page.click('#go-btn');
		await page.waitForFunction(() => /Page \d+ of 60/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
		await page.click('#cancel-btn');
		await page.waitForFunction(() => /Cancelled/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
		t.check('cancel: stops a long job and says the original is unchanged', true);
		t.check('cancel: the Compress button works again', !(await page.isDisabled('#go-btn')));
		t.check('cancel: no result was offered', (await page.$$('#results a')).length === 0);
		await finish(t, page, 'compress-pdf cancel');
	}
}
