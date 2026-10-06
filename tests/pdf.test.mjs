import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { finish, makeImage, open, overflowX, status } from './lib.mjs';

const mkPdf = async (n, label) => {
	const d = await PDFDocument.create();
	for (let i = 0; i < n; i++) d.addPage([300, 300]).drawText(`${label} p${i + 1}`, { x: 20, y: 150 });
	return Buffer.from(await d.save());
};
const pages = async (buf) => (await PDFDocument.load(buf)).getPageCount();
const download = async (page, sel) => {
	const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
	return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) };
};
const pdf = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });

// A PDF that claims to be encrypted, like a password-protected file.
async function lockedPdf() {
	const d = await PDFDocument.create();
	d.addPage([200, 200]);
	d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }));
	return Buffer.from(await d.save({ useObjectStreams: false }));
}

export default async function (t) {
	// ---------------- Merge ----------------
	{
		const page = await open(t, '/merge-pdf');
		t.check('merge: button disabled until two files', await page.isDisabled('#merge-btn'));
		await page.setInputFiles('#file-input', [
			pdf('a.pdf', await mkPdf(3, 'A')),
			pdf('b.pdf', await mkPdf(5, 'B')),
			pdf('fake.pdf', Buffer.from('hello not a pdf')),
			pdf('empty.pdf', Buffer.alloc(0)),
		]);
		await page.waitForSelector('#file-list li');
		t.check('merge: only the 2 real PDFs are listed', (await page.$$('#file-list li')).length === 2);
		const st = await status(page);
		t.check('merge: fake and empty files are named in the message', st.includes('fake.pdf') && st.includes('empty.pdf'), st);
		await page.click('#file-list li:nth-child(1) button[aria-label^="Move down"]');
		t.check('merge: reorder with the down button', (await page.textContent('#file-list li:nth-child(1) .result-name')).includes('b.pdf'));
		await page.click('#merge-btn');
		await page.waitForSelector('#results a', { timeout: 30000 });
		const d = await download(page, '#results a');
		t.check('merge: result has 8 pages', (await pages(d.buf)) === 8);

		await page.setInputFiles('#file-input', pdf('locked.pdf', await lockedPdf()));
		await page.click('#merge-btn');
		await page.waitForFunction(() => document.getElementById('status').classList.contains('error'), null, { timeout: 15000 });
		t.check('merge: password-protected PDF explained', /password-protected/.test(await status(page)), await status(page));
		await page.click('#clear-btn');
		await page.setInputFiles('#file-input', [pdf('x.pdf', await mkPdf(1, 'x')), pdf('corrupt.pdf', Buffer.from('%PDF-1.4\n garbage garbage'))]);
		await page.click('#merge-btn');
		await page.waitForFunction(() => document.getElementById('status').classList.contains('error'), null, { timeout: 15000 });
		t.check('merge: damaged PDF explained and named', /corrupt\.pdf.*could not be read/.test(await status(page)), await status(page));
		t.check('merge: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'merge');
	}

	// limits and large files
	{
		const page = await open(t, '/merge-pdf');
		const one = await mkPdf(1, 'x');
		await page.setInputFiles('#file-input', Array.from({ length: 32 }, (_, i) => pdf(`f${i}.pdf`, one)));
		await page.waitForSelector('#file-list li');
		t.check('merge: at most 30 files are accepted', (await page.$$('#file-list li')).length === 30 && /Only 30/.test(await status(page)));

		const big = path.join(os.tmpdir(), 'gbam-test-big.pdf');
		fs.writeFileSync(big, '%PDF-1.4\n');
		fs.truncateSync(big, 101 * 1024 * 1024);
		await page.click('#clear-btn');
		await page.setInputFiles('#file-input', big);
		await page.waitForFunction(() => document.getElementById('status').textContent.includes('larger than 100'), null, { timeout: 30000 });
		t.check('merge: file over 100 MB refused', true);
		await finish(t, page, 'merge-limits');
	}
	{
		// a scanned-document-sized PDF: three pages that each hold a big noisy photo
		const helper = await open(t, '/');
		const jpg = await makeImage(helper, { w: 3500, h: 2500, quality: 0.9, noise: true });
		await helper.context().close();
		const doc = await PDFDocument.create();
		const img = await doc.embedJpg(jpg);
		for (let i = 0; i < 3; i++) doc.addPage([600, 800]).drawImage(img, { x: 0, y: 0, width: 600, height: 428 });
		const heavy = Buffer.from(await doc.save());
		t.info(`heavy test PDF: ${(heavy.length / 1048576).toFixed(1)} MB (3 pages)`);

		const page = await open(t, '/merge-pdf');
		await page.setInputFiles('#file-input', [pdf('h1.pdf', heavy), pdf('h2.pdf', heavy), pdf('h3.pdf', heavy)]);
		const t0 = Date.now();
		await page.click('#merge-btn');
		await page.waitForSelector('#results a', { timeout: 120000 });
		t.check('merge: three heavy PDFs merge', true);
		t.info(`merging ${((heavy.length * 3) / 1048576).toFixed(0)} MB took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
		await finish(t, page, 'merge-heavy');
	}

	// ---------------- Split ----------------
	{
		const page = await open(t, '/split-pdf');
		await page.setInputFiles('#file-input', pdf('five.pdf', await mkPdf(5, 'S')));
		await page.waitForSelector('#editor:not(.hidden)');
		t.check('split: shows page count', (await page.textContent('#file-info')).includes('5 pages'));
		await page.fill('#range', '1-2, 5');
		await page.click('#split-btn');
		await page.waitForSelector('#results a');
		let d = await download(page, '#results a');
		t.check('split: extract 1-2, 5 gives 3 pages', (await pages(d.buf)) === 3 && d.name === 'five-extract.pdf');
		for (const [text, re, label] of [['9', /does not exist/, 'page beyond the end'], ['', /Enter the pages/, 'empty'], ['abc', /not a valid/, 'letters'], ['3-1', /first page must come before/, 'backwards range'], ['0', /does not exist/, 'page zero']]) {
			await page.fill('#range', text);
			await page.click('#split-btn');
			t.check(`split: ${label} explained`, re.test(await status(page)), await status(page));
		}
		await page.check('#mode-all');
		await page.click('#split-btn');
		await page.waitForSelector('#results a');
		d = await download(page, '#results a');
		const zip = path.join(os.tmpdir(), 'gbam-split.zip');
		fs.writeFileSync(zip, d.buf);
		const listing = execSync(`unzip -l "${zip}"`).toString();
		t.check('split: ZIP holds 5 PDFs', (listing.match(/\.pdf/g) || []).length === 5);
		const dir = path.join(os.tmpdir(), 'gbam-split-out');
		execSync(`rm -rf "${dir}" && mkdir "${dir}" && unzip -q "${zip}" -d "${dir}"`);
		t.check('split: each PDF in the ZIP is valid with 1 page', (await pages(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0])))) === 1);

		await page.setInputFiles('#file-input', pdf('locked.pdf', await lockedPdf()));
		await page.waitForFunction(() => document.getElementById('status').classList.contains('error'), null, { timeout: 15000 });
		t.check('split: password-protected PDF explained', /password-protected/.test(await status(page)), await status(page));
		await page.setInputFiles('#file-input', pdf('corrupt.pdf', Buffer.from('%PDF-1.4\n garbage')));
		await page.waitForFunction(() => /could not be read/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
		t.check('split: damaged PDF explained', true);
		await page.setInputFiles('#file-input', pdf('nope.pdf', Buffer.from('plain text')));
		await page.waitForFunction(() => /does not look like a PDF/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
		t.check('split: non-PDF refused', true);
		t.check('split: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'split');
	}
	{
		const page = await open(t, '/split-pdf');
		await page.setInputFiles('#file-input', pdf('300.pdf', await mkPdf(300, 'L')));
		await page.waitForFunction(() => document.getElementById('file-info').textContent.includes('300 pages'), null, { timeout: 30000 });
		await page.check('#mode-all');
		const t0 = Date.now();
		await page.click('#split-btn');
		await page.waitForSelector('#results a', { timeout: 180000 });
		t.check('split: 300 pages into a ZIP', true);
		t.info(`300-page split took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
		await page.setInputFiles('#file-input', pdf('301.pdf', await mkPdf(301, 'L')));
		await page.waitForFunction(() => document.getElementById('file-info').textContent.includes('301 pages'), null, { timeout: 30000 });
		await page.click('#split-btn');
		t.check('split: 301 pages in ZIP mode refused with a hint', /up to 300 pages/.test(await status(page)), await status(page));
		await finish(t, page, 'split-large');
	}
}
