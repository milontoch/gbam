// Images to PDF
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { layoutPage } from '../src/scripts/pdf-maker-core.ts';
import { finish, makeImage, open, overflowX } from './lib.mjs';

const A4 = [595.28, 841.89];
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const mb = (n) => (n / 1048576).toFixed(1);
const png = (name, buffer) => ({ name, mimeType: 'image/png', buffer });
const jpg = (name, buffer) => ({ name, mimeType: 'image/jpeg', buffer });

const sizes = async (buf) => (await PDFDocument.load(buf)).getPages().map((p) => p.getSize());

async function pictures(buf) {
	const doc = await PDFDocument.load(buf);
	const found = [];
	for (const [, obj] of doc.context.enumerateIndirectObjects()) {
		if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
			found.push({ bytes: obj.getContents(), w: obj.dict.get(PDFName.of('Width')).asNumber(), h: obj.dict.get(PDFName.of('Height')).asNumber() });
		}
	}
	return found;
}

// Average brightness, spread, and the colour of the top-left pixel of a JPEG.
const look = (page, bytes) =>
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
		return { mean: s / n, spread: Math.sqrt(Math.max(0, q / n - (s / n) ** 2)), corner: [d[0], d[1], d[2]] };
	}, Buffer.from(bytes).toString('base64'));

// Adds the hidden "which way up" note that phones write into photos (EXIF orientation).
function withOrientation(jpeg, value) {
	const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0, 0, 0, 0, 0]);
	const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
	const len = exif.length + 2;
	return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, len >> 8, len & 255]), exif, jpeg.subarray(2)]);
}

async function make(page, files, { settings = {}, name } = {}) {
	if (files) await page.setInputFiles('#file-input', files, { timeout: 120000 });
	await page.waitForSelector('#file-list li, #status.error', { timeout: 30000 });
	for (const [id, value] of Object.entries(settings)) await page.selectOption(`#${id}`, value);
	if (name !== undefined) await page.fill('#pdf-name', name);
	await page.click('#make-btn');
	await page.waitForFunction(() => !document.getElementById('make-btn').disabled && (document.querySelector('#results a') || document.getElementById('status').classList.contains('error')), null, { timeout: 120000 });
	const link = await page.$('#results a');
	if (!link) return { out: null, status: await page.textContent('#status') };
	const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
	return { out: fs.readFileSync(await dl.path()), name: dl.suggestedFilename(), detail: await page.textContent('#results .result-detail'), status: await page.textContent('#status') };
}

export default async function (t) {
	// ---------------- page layout maths ----------------
	let p = layoutPage(400, 600, 'a4', 'auto', 0);
	t.check('layout: a tall picture fills an A4 portrait page with no border', near(p.pageW, A4[0]) && near(p.pageH, A4[1]) && near(p.h, A4[1], 0.5) && p.x > 0);
	p = layoutPage(900, 600, 'a4', 'auto', 0);
	t.check('layout: a wide picture gets an A4 landscape page', near(p.pageW, A4[1]) && near(p.pageH, A4[0]));
	p = layoutPage(900, 600, 'a4', 'portrait', 36);
	t.check('layout: forcing portrait keeps a wide picture on a tall page, inside the border', near(p.pageW, A4[0]) && p.w <= A4[0] - 72 + 0.01 && p.x >= 36 - 0.01);
	p = layoutPage(500, 500, 'letter', 'auto', 18);
	t.check('layout: Letter is 612 x 792 and the picture is centred', p.pageW === 612 && p.pageH === 792 && near(p.x, (612 - p.w) / 2) && near(p.y, (792 - p.h) / 2));
	p = layoutPage(1000, 500, 'fit', 'auto', 36);
	t.check('layout: "fit to picture" has the same shape as the picture, no border', near(p.pageW / p.pageH, 2, 0.001) && near(Math.max(p.pageW, p.pageH), 842, 0.01) && p.x === 0 && p.y === 0);
	p = layoutPage(40, 40, 'a4', 'auto', 0);
	t.check('layout: a tiny picture is scaled to fit the page', p.w > 500);

	// ---------------- the tool ----------------
	const tall = await makeImage(await open(t, '/'), { w: 600, h: 900, quality: 0.9, noise: false });
	const page0 = await open(t, '/images-to-pdf');
	// a genuinely transparent PNG: a red circle on nothing
	const wide = Buffer.from(
		await page0.evaluate(async () => {
			const c = document.createElement('canvas');
			c.width = 900;
			c.height = 600;
			const x = c.getContext('2d');
			x.fillStyle = '#d00';
			x.beginPath();
			x.arc(450, 300, 200, 0, 7);
			x.fill();
			const b = await new Promise((r) => c.toBlob(r, 'image/png'));
			const buf = new Uint8Array(await b.arrayBuffer());
			let s = '';
			for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
			return btoa(s);
		}),
		'base64',
	);
	const noisyA = await makeImage(page0, { w: 3000, h: 2000, quality: 0.95, noise: true });
	await page0.context().close();

	{
		const page = await open(t, '/images-to-pdf');
		t.check('images-to-pdf: Make PDF is disabled until a picture is added', await page.isDisabled('#make-btn'));
		t.check('images-to-pdf: the options stay hidden until a picture is added', await page.isHidden('#options'));
		const r = await make(page, [jpg('tall.jpg', tall), png('wide.png', wide)]);
		t.check('images-to-pdf: two pictures become a two-page PDF', r.out && (await sizes(r.out)).length === 2, r.status);
		const s = r.out ? await sizes(r.out) : [];
		t.check('images-to-pdf: the tall picture gets a portrait A4 page and the wide one a landscape A4 page', s.length === 2 && near(s[0].width, A4[0]) && near(s[0].height, A4[1]) && near(s[1].width, A4[1]) && near(s[1].height, A4[0]), JSON.stringify(s));
		t.check('images-to-pdf: the file is named images.pdf and the message gives the page count', r.name === 'images.pdf' && /2 pages/.test(r.detail), `${r.name} | ${r.detail}`);
		const pics = r.out ? await pictures(r.out) : [];
		const first = pics.length ? await look(page, pics[0].bytes) : { spread: 0 };
		t.check('images-to-pdf: the pictures are really in the PDF (not blank)', pics.length === 2 && first.spread > 5, `spread ${Math.round(first.spread)}`);
		const second = pics.length ? await look(page, pics[1].bytes) : { corner: [0, 0, 0] };
		t.check('images-to-pdf: the transparent PNG corner is white paper, not black', second.corner.every((v) => v > 235), second.corner.join(','));

		// reorder: moving the first picture down puts the wide page first
		await page.click('#file-list li:nth-child(1) button[aria-label^="Move down"]');
		t.check('images-to-pdf: reordering updates the list', (await page.textContent('#file-list li:nth-child(1) .result-name')).includes('wide.png'));
		await page.click('#make-btn');
		await page.waitForSelector('#results a');
		const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#results a')]);
		const re = await sizes(fs.readFileSync(await dl.path()));
		t.check('images-to-pdf: the new order is the page order', near(re[0].width, A4[1]) && near(re[1].width, A4[0]), JSON.stringify(re));
		t.check('images-to-pdf: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'images-to-pdf');
	}

	// page settings
	{
		const page = await open(t, '/images-to-pdf');
		const fit = await make(page, [jpg('tall.jpg', tall)], { settings: { 'page-size': 'fit' } });
		const f = fit.out ? (await sizes(fit.out))[0] : { width: 0, height: 1 };
		t.check('settings: "fit to picture" gives a page with the picture\'s shape (2:3)', near(f.width / f.height, 600 / 900, 0.005) && near(Math.max(f.width, f.height), 842, 0.5), `${f.width.toFixed(1)} x ${f.height.toFixed(1)}`);
		t.check('settings: "fit to picture" hides the direction and border options', (await page.isHidden('#orientation-field')) && (await page.isHidden('#margin-field')));
		await page.context().close();

		const lt = await open(t, '/images-to-pdf');
		const letter = await make(lt, [jpg('tall.jpg', tall)], { settings: { 'page-size': 'letter' } });
		const l = letter.out ? (await sizes(letter.out))[0] : { width: 0, height: 0 };
		t.check('settings: Letter pages are 612 x 792', l.width === 612 && l.height === 792);
		await lt.context().close();

		const ls = await open(t, '/images-to-pdf');
		const forced = await make(ls, [jpg('tall.jpg', tall)], { settings: { orientation: 'landscape' } });
		const fo = forced.out ? (await sizes(forced.out))[0] : { width: 0, height: 0 };
		t.check('settings: forcing wide makes a landscape page even for a tall picture', near(fo.width, A4[1]) && near(fo.height, A4[0]));
		await ls.context().close();

		const nm = await open(t, '/images-to-pdf');
		const named = await make(nm, [jpg('tall.jpg', tall)], { name: 'My CV Photos.pdf' });
		t.check('settings: a chosen file name is used (".pdf" is not doubled)', named.name === 'My CV Photos.pdf', named.name);
		await nm.context().close();

		const un = await open(t, '/images-to-pdf');
		const unsafe = await make(un, [jpg('tall.jpg', tall)], { name: '../../etc/passwd' });
		t.check('settings: a file name with folder tricks is made safe', unsafe.name && !/[\\/]/.test(unsafe.name) && !unsafe.name.startsWith('.'), unsafe.name);
		await finish(t, un, 'images-to-pdf names');
	}

	// phone photos: the hidden rotation note must be honoured
	{
		const flat = await makeImage(await open(t, '/'), { w: 400, h: 200, quality: 0.9 });
		const rotated = withOrientation(flat, 6); // "turn 90 degrees clockwise", as a phone held upright writes it
		const page = await open(t, '/images-to-pdf');
		const r = await make(page, [jpg('phone.jpg', rotated)], { settings: { 'page-size': 'fit' } });
		const f = r.out ? (await sizes(r.out))[0] : { width: 1, height: 1 };
		t.check('phone photo: a picture stored sideways is turned upright (400x200 with a rotation note becomes tall)', f.height > f.width && near(f.width / f.height, 0.5, 0.01), `${f.width.toFixed(0)} x ${f.height.toFixed(0)}`);
		await finish(t, page, 'images-to-pdf rotation');
	}

	// quality setting really changes the size
	{
		const sizeAt = async (quality) => {
			const page = await open(t, '/images-to-pdf');
			const r = await make(page, [jpg('big.jpg', noisyA)], { settings: { quality } });
			await page.context().close();
			return r.out ? r.out.length : 0;
		};
		const high = await sizeAt('high');
		const small = await sizeAt('small');
		t.check('quality: "Smaller file" really is smaller than "High"', small > 0 && small < high * 0.6, `${mb(high)} MB vs ${mb(small)} MB`);
	}

	// bad input
	{
		const page = await open(t, '/images-to-pdf');
		await page.setInputFiles('#file-input', [
			{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('words') },
			{ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
			{ name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) },
		]);
		await page.waitForSelector('#status.error');
		const st = await page.textContent('#status');
		t.check('bad input: text, SVG and empty files are refused when added, each named', /notes\.txt.*not an image/.test(st) && /logo\.svg.*SVG/.test(st) && /empty\.jpg.*empty/.test(st), st);
		t.check('bad input: nothing bad is listed', (await page.$$('#file-list li')).length === 0 && (await page.isDisabled('#make-btn')));
		await page.setInputFiles('#file-input', jpg('tall.jpg', tall));
		await page.setInputFiles('#file-input', { name: 'IMG_1.HEIC', mimeType: '', buffer: Buffer.from('....ftypheic') });
		await page.click('#make-btn');
		await page.waitForFunction(() => document.getElementById('status').classList.contains('error'), null, { timeout: 30000 });
		t.check('bad input: an iPhone HEIC photo gets the explanation, naming the file, and no PDF', /IMG_1\.HEIC.*HEIC/.test(await page.textContent('#status')) && (await page.$$('#results a')).length === 0, await page.textContent('#status'));
		await page.click('#file-list li:nth-child(2) button[aria-label^="Remove"]');
		await page.setInputFiles('#file-input', jpg('broken.jpg', Buffer.from('this is not really a picture')));
		await page.click('#make-btn');
		await page.waitForFunction(() => /broken\.jpg/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
		t.check('bad input: a damaged picture is named and explained', /broken\.jpg.*could not be opened/.test(await page.textContent('#status')), await page.textContent('#status'));
		await page.click('#clear-btn');
		t.check('bad input: Clear all empties the list and hides the options', (await page.$$('#file-list li')).length === 0 && (await page.isHidden('#options')));
		await finish(t, page, 'images-to-pdf bad input');
	}

	// limits
	{
		const page = await open(t, '/images-to-pdf');
		const tiny = await makeImage(page, { w: 40, h: 40, type: 'image/png' });
		await page.setInputFiles('#file-input', Array.from({ length: 52 }, (_, i) => png(`p${i}.png`, tiny)));
		await page.waitForSelector('#file-list li');
		t.check('limits: no more than 50 pictures are accepted, with a message', (await page.$$('#file-list li')).length === 50 && /Only 50 pictures/.test(await page.textContent('#status')));
		const r = await make(page, null);
		t.check('limits: all 50 tiny pictures become a 50-page PDF', r.out && (await sizes(r.out)).length === 50, r.status);
		await page.click('#clear-btn');
		const big = path.join(os.tmpdir(), 'gbam-test-over40.jpg');
		fs.writeFileSync(big, '\xff\xd8\xff');
		fs.truncateSync(big, 41 * 1024 * 1024);
		await page.setInputFiles('#file-input', big);
		await page.waitForSelector('#status.error');
		t.check('limits: a picture over 40 MB is refused', /larger than 40 MB/.test(await page.textContent('#status')));
		await finish(t, page, 'images-to-pdf limits');
	}

	// a heavy job
	{
		const page = await open(t, '/images-to-pdf');
		// Big files are handed over by their place on disk. Sending 44 MB through the test tool's remote-control channel is slow and flaky.
		const files = Array.from({ length: 8 }, (_, i) => {
			const file = path.join(os.tmpdir(), `gbam-test-scan${i}.jpg`);
			fs.writeFileSync(file, noisyA);
			return file;
		});
		const t0 = Date.now();
		const r = await make(page, files, { settings: { quality: 'balanced' } });
		t.check('heavy: eight 6-megapixel photos become one PDF', r.out && (await sizes(r.out)).length === 8, r.status);
		t.info(`8 photos (${mb(noisyA.length * 8)} MB in) -> ${r.out ? mb(r.out.length) : '?'} MB PDF in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
		await finish(t, page, 'images-to-pdf heavy');
	}
}
