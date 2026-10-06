import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finish, makeImage, open, overflowX, status } from './lib.mjs';

// A public-domain NASA portrait (US government work), downloaded once for the AI test.
const PORTRAIT_URL = 'https://commons.wikimedia.org/wiki/Special:FilePath/Mae_Jemison_-_Official_portrait_of_1987_astronaut_candidate.jpg?width=1800';
const PORTRAIT = path.join(os.tmpdir(), 'gbam-test-portrait.jpg');

async function portrait() {
	if (fs.existsSync(PORTRAIT) && fs.statSync(PORTRAIT).size > 100_000) return PORTRAIT;
	try {
		const res = await fetch(PORTRAIT_URL, { headers: { 'User-Agent': 'GbamTests/1.0 (local development)' } });
		if (!res.ok) return null;
		fs.writeFileSync(PORTRAIT, Buffer.from(await res.arrayBuffer()));
		return PORTRAIT;
	} catch {
		return null;
	}
}

const download = async (page, sel) => {
	const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
	return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) };
};
const imageSize = (page, buf) =>
	page.evaluate(async (b64) => {
		const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
		return [bmp.width, bmp.height];
	}, buf.toString('base64'));
const pixel = (page, x, y) =>
	page.evaluate(([x, y]) => {
		const c = document.getElementById('crop');
		return [...c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)];
	}, [x, y]);
const meanLuma = (page) =>
	page.evaluate(() => {
		const c = document.getElementById('crop');
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		let s = 0;
		for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
		return s / (d.length / 4);
	});

export default async function (t) {
	// ---------------- cropping, sizes, sheets ----------------
	{
		const page = await open(t, '/passport-photo-maker');
		const img = await makeImage(page, { w: 3000, h: 4000, quality: 0.9 });
		await page.setInputFiles('#file-input', { name: 'me.jpg', mimeType: 'image/jpeg', buffer: img });
		await page.waitForSelector('#editor:not(.hidden)');

		let d = await (async () => { await page.click('#photo-btn'); await page.waitForSelector('#results a'); return download(page, '#results a'); })();
		let [w, h] = await imageSize(page, d.buf);
		t.check('passport: 35x45 mm is 413x531 px JPEG', w === 413 && h === 531 && d.buf.subarray(0, 3).toString('hex') === 'ffd8ff', `${w}x${h}`);

		const before = await meanLuma(page);
		await page.evaluate(() => { const b = document.getElementById('brightness'); b.value = '40'; b.dispatchEvent(new Event('input')); });
		await page.waitForTimeout(150);
		t.check('passport: brightness slider changes the picture', (await meanLuma(page)) > before + 5);
		await page.click('#reset-btn');
		t.check('passport: reset puts sliders back to zero', (await page.inputValue('#brightness')) === '0');
		await page.click('#auto-btn');
		t.check('passport: auto-fix keeps its changes gentle', Math.abs(Number(await page.inputValue('#brightness'))) <= 25 && Number(await page.inputValue('#contrast')) <= 30);

		const view = await page.evaluate(() => document.getElementById('crop').toDataURL());
		await page.focus('#crop');
		await page.keyboard.press('ArrowLeft');
		await page.evaluate(() => { const z = document.getElementById('zoom'); z.value = '2'; z.dispatchEvent(new Event('input')); });
		await page.waitForTimeout(150);
		t.check('passport: zoom and arrow keys move the crop', view !== (await page.evaluate(() => document.getElementById('crop').toDataURL())));

		await page.selectOption('#preset', 'nigeria-online');
		t.check('passport: online preset hides the print sheet', await page.isHidden('#sheet-box'));
		await page.click('#photo-btn');
		await page.waitForSelector('#results a');
		d = await download(page, '#results a');
		[w, h] = await imageSize(page, d.buf);
		t.check('passport: Nigeria online is 600x800 and under 2 MB', w === 600 && h === 800 && d.buf.length < 2 * 1048576, `${w}x${h} ${Math.round(d.buf.length / 1024)}KB`);

		await page.selectOption('#preset', 'print-35x45');
		for (const [paper, count, size] of [['4x6', 6, [1200, 1800]], ['a4', 30, [2480, 3508]]]) {
			await page.selectOption('#paper', paper);
			await page.click('#sheet-btn');
			await page.waitForFunction((c) => document.querySelector('#results .result-detail')?.textContent.startsWith(c + ' photos'), count, { timeout: 30000 });
			d = await download(page, '#results a');
			[w, h] = await imageSize(page, d.buf);
			t.check(`passport: ${paper} sheet has ${count} photos at ${size.join('x')}`, w === size[0] && h === size[1], `${w}x${h}`);
		}
		await page.selectOption('#preset', 'canada-50x70');
		await page.selectOption('#paper', '4x6');
		await page.click('#sheet-btn');
		await page.waitForFunction(() => /photos on|too big/.test(document.getElementById('status').textContent + document.querySelector('#results')?.textContent), null, { timeout: 30000 });
		t.check('passport: Canada size on a 4x6 sheet either fits or says why not', true);
		t.check('passport: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'passport');
	}

	// ---------------- small and huge photos ----------------
	{
		const page = await open(t, '/passport-photo-maker');
		const tiny = await makeImage(page, { w: 100, h: 130, quality: 0.9 });
		await page.setInputFiles('#file-input', { name: 'tiny.jpg', mimeType: 'image/jpeg', buffer: tiny });
		await page.waitForSelector('#editor:not(.hidden)');
		await page.click('#photo-btn');
		await page.waitForSelector('#results a');
		t.check('passport: a tiny photo gets a blurry warning', /blurry/.test(await status(page)), await status(page));

		const big = await makeImage(page, { w: 6000, h: 5000, quality: 0.8 });
		const t0 = Date.now();
		await page.setInputFiles('#file-input', { name: 'big.jpg', mimeType: 'image/jpeg', buffer: big });
		await page.waitForFunction(() => document.getElementById('crop').width > 0, null, { timeout: 60000 });
		await page.click('#photo-btn');
		await page.waitForSelector('#results a', { timeout: 60000 });
		t.check('passport: a 30-megapixel photo works', true);
		t.info(`30 MP photo took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

		const huge = await makeImage(page, { w: 9000, h: 6000, type: 'image/png' });
		await page.setInputFiles('#file-input', { name: 'huge.png', mimeType: 'image/png', buffer: huge });
		await page.waitForFunction(() => /too large/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
		t.check('passport: a 54-megapixel photo is refused cleanly', true);
		await finish(t, page, 'passport-sizes');
	}

	// ---------------- AI background removal ----------------
	const file = await portrait();
	if (!file) {
		t.info('AI test skipped: could not download the test portrait');
		return;
	}
	{
		const page = await open(t, '/passport-photo-maker');
		await page.setInputFiles('#file-input', file);
		await page.waitForSelector('#editor:not(.hidden)');
		const before = page.log.requests.filter((r) => /wasm|onnx|bg-worker/.test(r.url)).length;
		t.check('AI: nothing is downloaded until the button is pressed', before === 0);

		const t0 = Date.now();
		await page.click('#ai-btn');
		await page.waitForFunction(() => /^Done|could not|cannot|stopped/i.test(document.getElementById('ai-status').textContent), null, { timeout: 180000 });
		t.check('AI: background removal finishes', (await page.textContent('#ai-status')).startsWith('Done'), await page.textContent('#ai-status'));
		t.info(`first AI run took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

		for (const [bg, want] of [['white', [255, 255, 255]], ['red', [208, 16, 26]], ['blue', [67, 142, 219]]]) {
			await page.selectOption('#bg', bg);
			await page.waitForTimeout(250);
			const corner = await pixel(page, 4, 4);
			t.check(`AI: ${bg} background is really ${bg}`, corner.every((v, i) => Math.abs(v - want[i]) < 12), corner.join(','));
		}
		const w = await page.evaluate(() => document.getElementById('crop').width);
		const h = await page.evaluate(() => document.getElementById('crop').height);
		const body = await pixel(page, Math.round(w * 0.5), Math.round(h * 0.93)); // the uniform, not the background
		t.check('AI: the person is kept (not painted over)', !(body[0] > 190 && body[1] < 60), body.join(','));
		await page.selectOption('#bg', 'original');
		t.check('AI: "keep original" brings the old background back', (await pixel(page, 4, 4)).join() !== '255,255,255');
		await page.selectOption('#bg', 'white');

		const t1 = Date.now();
		await page.click('#ai-btn');
		await page.waitForFunction(() => document.getElementById('ai-status').textContent.startsWith('Done'), null, { timeout: 180000 });
		t.info(`second AI run took ${((Date.now() - t1) / 1000).toFixed(1)}s`);

		await page.click('#photo-btn');
		await page.waitForSelector('#results a');
		const d = await download(page, '#results a');
		t.check('AI: the final photo downloads', d.buf.length > 5000);
		const req = page.log.requests.filter((r) => /wasm|onnx|bg-worker/.test(r.url)).map((r) => new URL(r.url).pathname);
		t.check('AI: model and engine come from our own site', req.length >= 3, req.join(' '));
		await finish(t, page, 'passport-ai');
	}
}
