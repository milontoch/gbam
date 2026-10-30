// Rotate PDF Pages
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { normalizeAngle, turn, describeTurn, isSideways } from '../src/scripts/rotate-core.ts';
import { finish, open, overflowX } from './lib.mjs';

const pdfFile = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });

async function textOf(buf) {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = pdfjs.getDocument({ data: new Uint8Array(buf), standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/', verbosity: 0 });
	const pdf = await task.promise;
	const pages = [];
	for (let i = 1; i <= pdf.numPages; i++) pages.push((await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ').trim());
	await task.destroy();
	return pages;
}

// Pages: 1 tall, 2 WIDE, 3 tall, 4 WIDE, 5 tall but already turned 90 (so it looks wide on screen).
async function mixedPdf(count = 5) {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let i = 1; i <= count; i++) {
		const wide = count === 5 ? i === 2 || i === 4 : false;
		const page = doc.addPage(wide ? [400, 300] : [300, 400]);
		page.drawRectangle({ x: 20, y: 20, width: 80, height: 40, color: rgb(0.2, 0.3, 0.6) });
		page.drawText(`Page ${i}`, { x: 30, y: wide ? 200 : 300, font, size: 36 });
		if (count === 5 && i === 5) page.setRotation(degrees(90));
	}
	return Buffer.from(await doc.save());
}

const angles = async (buf) => (await PDFDocument.load(buf)).getPages().map((p) => p.getRotation().angle);

// Number of cards whose small picture has been drawn (it contains dark ink).
const drawnCards = (page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('.page-card canvas')].filter((c) => {
			try {
				const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
				for (let i = 0; i < d.length; i += 16) if (d[i] < 120 && d[i + 3] > 0) return true;
			} catch {}
			return false;
		}).length,
	);
const cardShape = (page, n) => page.evaluate((n) => { const c = document.querySelector(`.page-card:nth-child(${n}) canvas`); return { w: c.width, h: c.height }; }, n);
const previewHasInk = (page) =>
	page.evaluate(() => {
		const c = document.getElementById('preview-canvas');
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		for (let i = 0; i < d.length; i += 16) if (d[i] < 120 && d[i + 3] > 0) return true;
		return false;
	});

async function load(t, file, opts) {
	const page = await open(t, '/rotate-pdf', opts);
	await page.setInputFiles('#file-input', file);
	await page.waitForSelector('#editor:not(.hidden), #status.error', { timeout: 60000 });
	return page;
}
async function save(page) {
	await page.click('#save-btn');
	await page.waitForSelector('#results a', { timeout: 60000 });
	const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#results a')]);
	return { buf: fs.readFileSync(await dl.path()), name: dl.suggestedFilename(), detail: await page.textContent('#results .result-detail') };
}

export default async function (t) {
	// ---------------- rotation rules ----------------
	t.check('rules: angles wrap around and never go negative', normalizeAngle(-90) === 270 && normalizeAngle(450) === 90 && normalizeAngle(360) === 0 && normalizeAngle(0) === 0);
	t.check('rules: four right turns come back to the start', [0, 90, 180, 270].every((a) => turn(turn(turn(turn(a, 90), 90), 90), 90) === a));
	t.check('rules: a left turn undoes a right turn', turn(turn(0, 90), -90) === 0 && turn(0, -90) === 270 && turn(90, 180) === 270);
	t.check('rules: the words used on the page', describeTurn(90) === 'turned right' && describeTurn(180) === 'upside down' && describeTurn(270) === 'turned left' && describeTurn(0) === '' && describeTurn(-90) === 'turned left');
	t.check('rules: wide means wider than tall', isSideways(400, 300) && !isSideways(300, 400) && !isSideways(300, 300));

	const original = await mixedPdf();
	t.check('fixture: the test PDF really has five pages with searchable text', (await textOf(original)).join('|') === 'Page 1|Page 2|Page 3|Page 4|Page 5');
	t.check('fixture: page 5 starts already turned 90', (await angles(original)).join() === '0,0,0,0,90');

	// ---------------- loading and previews ----------------
	{
		const page = await load(t, pdfFile('mixed.pdf', original));
		t.check('load: shows the file name and 5 pages', /mixed\.pdf: 5 pages/.test(await page.textContent('#file-info')));
		await page.waitForFunction(() => document.querySelectorAll('.page-card').length === 5);
		await page.locator('.page-card:last-child').scrollIntoViewIfNeeded();
		await page.waitForFunction(() => [...document.querySelectorAll('.page-card canvas')].length === 5);
		await page.waitForTimeout(1500);
		t.check('load: every page has a real picture (text and shapes drawn, not blank)', (await drawnCards(page)) === 5, String(await drawnCards(page)));
		t.check('load: the big preview starts on page 1 and has its picture', /Page 1 of 5/.test(await page.textContent('#preview-label')) && (await previewHasInk(page)));
		t.check('load: previous is disabled on page 1', await page.isDisabled('#preview-prev'));
		await page.click('.page-card:nth-child(3) .thumb');
		await page.waitForFunction(() => /Page 3 of 5/.test(document.getElementById('preview-label').textContent));
		await page.waitForTimeout(500);
		t.check('preview: tapping a page shows that page bigger', (await previewHasInk(page)));
		await page.click('#preview-next');
		t.check('preview: next goes to page 4', /Page 4 of 5/.test(await page.textContent('#preview-label')));
		await page.click('#preview-next');
		t.check('preview: next is disabled on the last page', /Page 5 of 5/.test(await page.textContent('#preview-label')) && (await page.isDisabled('#preview-next')));
		t.check('load: a page that was already turned 90 looks wide, like page 2 and 4', (await cardShape(page, 5)).w > (await cardShape(page, 5)).h && (await cardShape(page, 2)).w > (await cardShape(page, 2)).h && (await cardShape(page, 1)).w < (await cardShape(page, 1)).h);
		t.check('load: nothing to save yet', await page.isDisabled('#save-btn'));
		t.check('load: the bulk turn buttons wait for ticked pages', (await page.isDisabled('#turn-right')) && (await page.isDisabled('#turn-left')) && (await page.isDisabled('#turn-180')));
		t.check('load: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'rotate-pdf load');
	}

	// ---------------- the main job: tick the wide pages, turn them, save ----------------
	{
		const page = await load(t, pdfFile('mixed.pdf', original));
		await page.waitForFunction(() => !document.getElementById('select-sideways').disabled, null, { timeout: 30000 });
		await page.click('#select-sideways');
		const ticked = await page.$$eval('.page-card input[type=checkbox]', (els) => els.map((e) => e.checked));
		t.check('wide pages: "Tick wide pages" ticks exactly pages 2, 4 and 5', ticked.join() === 'false,true,false,true,true', ticked.join());
		t.check('wide pages: it says how many it ticked', /3 wide pages ticked/.test(await page.textContent('#status')));
		t.check('wide pages: the count shows', /3 pages ticked/.test(await page.textContent('#selection-info')));

		await page.click('#turn-right');
		t.check('turn: ticked pages are marked as turned right', (await page.textContent('.page-card:nth-child(2) .rot-badge')).includes('turned right') && (await page.isHidden('.page-card:nth-child(1) .rot-badge')));
		// The small pictures are drawn only when scrolled near, so look at them the way a person would. Pictures drawn after the
		// turn must already show the turned page.
		await page.locator('.page-card:last-child').scrollIntoViewIfNeeded();
		await page.waitForFunction(() => document.querySelectorAll('.page-card:nth-child(5) canvas')[0].width !== 300 || document.querySelectorAll('.page-card:nth-child(5) canvas')[0].height !== 150, null, { timeout: 15000 });
		await page.waitForTimeout(800);
		const shapes = [await cardShape(page, 1), await cardShape(page, 2), await cardShape(page, 4), await cardShape(page, 5)];
		t.check('turn: the pictures really turn (page 2 and 4 now tall; page 5 is now upside down but tall; page 1 untouched)', shapes[1].w < shapes[1].h && shapes[2].w < shapes[2].h && shapes[3].w < shapes[3].h && shapes[0].w < shapes[0].h, JSON.stringify(shapes));
		t.check('turn: the save button counts the turned pages', /3 pages turned/.test(await page.textContent('#save-btn')));
		const r = await save(page);
		t.check('save: pages 2 and 4 are turned 90, page 5 is 180 (90 + 90), others untouched', (await angles(r.buf)).join() === '0,90,0,90,180', (await angles(r.buf)).join());
		t.check('save: the text is untouched and still searchable on every page', (await textOf(r.buf)).join('|') === 'Page 1|Page 2|Page 3|Page 4|Page 5');
		t.check('save: the file is about the same size (nothing was re-compressed)', Math.abs(r.buf.length - original.length) < original.length * 0.2 + 600, `${original.length} -> ${r.buf.length} bytes`);
		t.check('save: the file is named after the original', r.name === 'mixed-rotated.pdf' && /3 pages turned/.test(r.detail), `${r.name} | ${r.detail}`);
		await page.click('.page-card:nth-child(1) .row-actions button:nth-child(2)');
		t.check('save: a new change clears the old download so it cannot be mistaken for current', (await page.$$('#results a')).length === 0);
		await finish(t, page, 'rotate-pdf save');
	}

	// ---------------- single pages, undo, and the preview buttons ----------------
	{
		const page = await load(t, pdfFile('mixed.pdf', original));
		const right = (n) => page.click(`.page-card:nth-child(${n}) .row-actions button:nth-child(2)`);
		const left = (n) => page.click(`.page-card:nth-child(${n}) .row-actions button:nth-child(1)`);
		await right(1);
		await right(1);
		await left(3);
		t.check('single: page 1 twice right is upside down, page 3 once left is turned left', (await page.textContent('.page-card:nth-child(1) .rot-badge')).includes('upside down') && (await page.textContent('.page-card:nth-child(3) .rot-badge')).includes('turned left'));
		await page.click('.page-card:nth-child(1) .thumb');
		await page.click('#preview-right'); // the big-preview button turns the page being previewed
		t.check('single: the big preview button turns the same page (180 + 90 = turned left)', (await page.textContent('.page-card:nth-child(1) .rot-badge')).includes('turned left') && /turned left/.test(await page.textContent('#preview-label')));
		const r = await save(page);
		t.check('single: saved angles are 270, 0, 270, 0, 90', (await angles(r.buf)).join() === '270,0,270,0,90', (await angles(r.buf)).join());
		await page.click('#reset-all');
		t.check('undo: "Undo all turns" clears every turn and disables Save', (await page.isDisabled('#save-btn')) && (await page.$$eval('.rot-badge:not(.hidden)', (e) => e.length)) === 0 && (await page.$$('#results a')).length === 0);
		for (let k = 0; k < 4; k++) await right(2);
		t.check('undo: four right turns on a page equal no change, so there is nothing to save', await page.isDisabled('#save-btn'));
		await page.click('.page-card:nth-child(5) .row-actions button:nth-child(1)'); // page 5 already 90: turning left makes it 0
		const r2 = await save(page);
		t.check('existing rotation: turning left a page that was already turned 90 brings it back to 0', (await angles(r2.buf)).join() === '0,0,0,0,0', (await angles(r2.buf)).join());
		await finish(t, page, 'rotate-pdf single');
	}

	// ---------------- tick all / none, turn 180 ----------------
	{
		const page = await load(t, pdfFile('mixed.pdf', original));
		await page.click('#turn-180').catch(() => {});
		await page.click('#select-all');
		t.check('tick all: all five are ticked', /5 pages ticked/.test(await page.textContent('#selection-info')));
		await page.click('#turn-180');
		const r = await save(page);
		t.check('turn 180: every page is turned 180 (page 5: 90 + 180 = 270)', (await angles(r.buf)).join() === '180,180,180,180,270', (await angles(r.buf)).join());
		await page.click('#select-none');
		t.check('tick none: nothing is ticked and the bulk buttons wait again', /No pages ticked/.test(await page.textContent('#selection-info')) && (await page.isDisabled('#turn-right')));
		await page.click('#select-all');
		await page.click('#select-none');
		await page.evaluate(() => document.getElementById('turn-left').removeAttribute('disabled'));
		await page.click('#turn-left');
		t.check('tick none: using a bulk button with nothing ticked explains what to do', /Tick the pages/.test(await page.textContent('#status')));
		await finish(t, page, 'rotate-pdf bulk');
	}

	// ---------------- bad input ----------------
	{
		const locked = await (async () => {
			const d = await PDFDocument.create();
			d.addPage([200, 200]);
			d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }));
			return Buffer.from(await d.save({ useObjectStreams: false }));
		})();
		for (const [label, file, expect] of [
			['a text file renamed .pdf', pdfFile('fake.pdf', Buffer.from('words, not a pdf')), /does not look like a PDF/],
			['an empty file', pdfFile('empty.pdf', Buffer.alloc(0)), /empty/],
			['a damaged PDF', pdfFile('broken.pdf', Buffer.from('%PDF-1.4\n garbage garbage')), /could not be read/],
			['a password-protected PDF', pdfFile('locked.pdf', locked), /password-protected|could not be read/],
		]) {
			const page = await load(t, file);
			const msg = await page.textContent('#status');
			t.check(`bad input: ${label} gets a clear message and no editor`, expect.test(msg) && (await page.isHidden('#editor')), msg);
			await finish(t, page, `rotate-pdf bad (${label})`);
		}
		const big = path.join(os.tmpdir(), 'gbam-test-rotate-over100.pdf');
		fs.writeFileSync(big, '%PDF-1.4\n');
		fs.truncateSync(big, 101 * 1024 * 1024);
		const bigPage = await load(t, big);
		t.check('bad input: a PDF over 100 MB is refused', /larger than 100/.test(await bigPage.textContent('#status')));
		await bigPage.context().close();

		const d = await PDFDocument.create();
		for (let i = 0; i < 301; i++) d.addPage([100, 100]);
		const tooMany = await load(t, pdfFile('301.pdf', Buffer.from(await d.save())));
		t.check('bad input: 301 pages is refused with a pointer to Split PDF', /301 pages/.test(await tooMany.textContent('#status')) && /Split PDF/.test(await tooMany.textContent('#status')) && (await tooMany.isHidden('#editor')));
		await tooMany.context().close();
	}

	// ---------------- a long document: pictures are drawn only when needed ----------------
	{
		const d = await PDFDocument.create();
		const font = await d.embedFont(StandardFonts.Helvetica);
		for (let i = 1; i <= 120; i++) d.addPage([300, 400]).drawText(`Page ${i}`, { x: 30, y: 300, font, size: 36 });
		const long = Buffer.from(await d.save());
		const t0 = Date.now();
		const page = await load(t, pdfFile('long.pdf', long));
		await page.waitForFunction(() => document.querySelectorAll('.page-card').length === 120);
		await page.locator('.page-card:first-child').scrollIntoViewIfNeeded(); // look at the first pages, as a person would
		await page.waitForTimeout(2000);
		const early = await drawnCards(page);
		t.check('long document: 120 pages listed, but only the visible ones are drawn at first (kept light for phones)', early > 0 && early < 40, `${early} drawn of 120`);
		t.info(`120-page PDF opened in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${early} thumbnails drawn at first`);
		await page.click('#select-all');
		await page.click('#turn-right');
		const r = await save(page);
		const a = await angles(r.buf);
		t.check('long document: turning all 120 pages and saving works', a.length === 120 && a.every((x) => x === 90));
		await finish(t, page, 'rotate-pdf long');
	}
}
