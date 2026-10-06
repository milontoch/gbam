import { computeMask, isSupported as aiSupported, type Status } from './bg-removal';
import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { decodeImage } from './image-load';
import { adjustImage, autoAdjust, isNeutral, type Adjust } from './image-enhance';
import { addResultRow, baseName, byId, h, setStatus, urlKeeper } from './ui';

const MAX_PIXELS = 40_000_000;
const WORK_MAX_SIDE = 2400; // plenty for a passport photo, and keeps phone memory use low
const DPI = 300;
const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI);

interface Preset {
	w: number; // output size in pixels
	h: number;
	sheet: boolean; // can be laid out on a print sheet
	maxBytes?: number; // upload limit to respect (digital presets)
}

const PRESETS: Record<string, Preset> = {
	'print-35x45': { w: mmToPx(35), h: mmToPx(45), sheet: true },
	'nigeria-online': { w: 600, h: 800, sheet: false, maxBytes: 2 * 1024 * 1024 },
	'us-2x2': { w: mmToPx(50.8), h: mmToPx(50.8), sheet: true },
	'canada-50x70': { w: mmToPx(50), h: mmToPx(70), sheet: true },
};

const PAPERS: Record<string, { w: number; h: number; name: string }> = {
	'4x6': { w: 1200, h: 1800, name: '4x6 in' }, // 4 x 6 inches at 300 dpi
	a4: { w: mmToPx(210), h: mmToPx(297), name: 'A4' },
};

const BACKGROUNDS: Record<string, string> = { white: '#ffffff', red: '#d0101a', blue: '#438edb' };

const zone = byId('file-input-zone');
const input = byId<HTMLInputElement>('file-input');
const editor = byId('editor');
const presetEl = byId<HTMLSelectElement>('preset');
const canvas = byId<HTMLCanvasElement>('crop');
const zoomEl = byId<HTMLInputElement>('zoom');
const paperEl = byId<HTMLSelectElement>('paper');
const sheetBox = byId('sheet-box');
const photoBtn = byId<HTMLButtonElement>('photo-btn');
const sheetBtn = byId<HTMLButtonElement>('sheet-btn');
const status = byId('status');
const results = byId<HTMLUListElement>('results');

const aiBtn = byId<HTMLButtonElement>('ai-btn');
const aiStatus = byId('ai-status');
const aiProgress = byId<HTMLProgressElement>('ai-progress');
const bgEl = byId<HTMLSelectElement>('bg');
const brightEl = byId<HTMLInputElement>('brightness');
const contrastEl = byId<HTMLInputElement>('contrast');
const sharpEl = byId<HTMLInputElement>('sharpness');
const autoBtn = byId<HTMLButtonElement>('auto-btn');
const resetBtn = byId<HTMLButtonElement>('reset-btn');

const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const urls = urlKeeper();

let work: HTMLCanvasElement | null = null; // the photo, flattened and limited to WORK_MAX_SIDE
let person: HTMLCanvasElement | null = null; // the photo with the background cut away (transparent)
let flat: HTMLCanvasElement | null = null; // the person placed on the chosen background colour
let fileName = 'photo';
let cx = 0; // centre of the crop, in work-image pixels
let cy = 0;
let generation = 0; // bumps when a new photo is chosen, so slow results for an old photo are dropped
let frame = 0;

const preset = () => PRESETS[presetEl.value] ?? PRESETS['print-35x45'];
const fail = (m: string) => setStatus(status, m, true);
const source = () => flat ?? work!;
const adjustment = (): Adjust => ({
	brightness: Number(brightEl.value),
	contrast: Number(contrastEl.value),
	sharpness: Number(sharpEl.value),
});

// ---------- the crop box ----------
function sizeCanvas() {
	const p = preset();
	const cssW = Math.min(canvas.parentElement?.clientWidth || 300, 320);
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	canvas.style.width = `${cssW}px`;
	canvas.style.height = `${Math.round((cssW * p.h) / p.w)}px`;
	canvas.width = Math.round(cssW * dpr);
	canvas.height = Math.round(((cssW * p.h) / p.w) * dpr);
}

// The part of the photo that is inside the frame, in work-image pixels.
function region() {
	const src = source();
	const cover = Math.max(canvas.width / src.width, canvas.height / src.height);
	const scale = cover * Number(zoomEl.value);
	const sw = canvas.width / scale;
	const sh = canvas.height / scale;
	cx = Math.min(Math.max(cx, sw / 2), src.width - sw / 2);
	cy = Math.min(Math.max(cy, sh / 2), src.height - sh / 2);
	return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh, scale };
}

function paint(target: CanvasRenderingContext2D, w: number, h: number, withAdjust: boolean) {
	const { sx, sy, sw, sh } = region();
	target.fillStyle = '#fff';
	target.fillRect(0, 0, w, h);
	target.imageSmoothingQuality = 'high';
	target.drawImage(source(), sx, sy, sw, sh, 0, 0, w, h);
	const a = adjustment();
	if (withAdjust && !isNeutral(a)) {
		const img = target.getImageData(0, 0, w, h);
		adjustImage(img, a);
		target.putImageData(img, 0, 0);
	}
}

function draw() {
	if (work) paint(ctx, canvas.width, canvas.height, true);
}

// Redraw at most once per screen refresh, so dragging and sliders stay smooth on cheap phones.
function scheduleDraw() {
	if (frame) return;
	frame = requestAnimationFrame(() => {
		frame = 0;
		draw();
	});
}

function resetView() {
	if (!work) return;
	sizeCanvas();
	zoomEl.value = '1';
	cx = work.width / 2;
	cy = work.height * 0.45; // faces sit a little above the middle of most photos
	draw();
}

// ---------- loading a photo ----------
function clearAi() {
	person = null;
	flat = null;
	bgEl.value = 'original';
	bgEl.disabled = true;
	aiStatus.textContent = '';
	aiProgress.classList.add('hidden');
	aiBtn.textContent = 'Remove background (AI)';
	aiBtn.disabled = false;
}

function resetAdjust() {
	brightEl.value = contrastEl.value = sharpEl.value = '0';
	showAdjustValues();
}

function showAdjustValues() {
	byId('brightness-value').textContent = brightEl.value;
	byId('contrast-value').textContent = contrastEl.value;
	byId('sharpness-value').textContent = sharpEl.value;
}

async function onFiles(chosen: File[]) {
	const file = chosen[0];
	generation++;
	urls.clear();
	results.replaceChildren();
	setStatus(status, chosen.length > 1 ? 'Only the first photo was used.' : '');

	let bitmap: ImageBitmap;
	try {
		bitmap = await decodeImage(file, MAX_PIXELS);
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'This image could not be read.');
	}

	const k = Math.min(1, WORK_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const w = document.createElement('canvas');
	w.width = Math.max(1, Math.round(bitmap.width * k));
	w.height = Math.max(1, Math.round(bitmap.height * k));
	const wctx = w.getContext('2d')!;
	wctx.fillStyle = '#fff'; // transparent photos start on white
	wctx.fillRect(0, 0, w.width, w.height);
	wctx.imageSmoothingQuality = 'high';
	wctx.drawImage(bitmap, 0, 0, w.width, w.height);
	bitmap.close();

	work = w;
	fileName = baseName(file.name, 'photo');
	clearAi();
	resetAdjust();
	editor.classList.remove('hidden');
	syncPreset();
}

function syncPreset() {
	sheetBox.classList.toggle('hidden', !preset().sheet);
	resetView();
}

// ---------- AI background removal ----------
function compose() {
	if (!work || !person || bgEl.value === 'original') {
		flat = null;
		return;
	}
	const f = document.createElement('canvas');
	f.width = work.width;
	f.height = work.height;
	const c = f.getContext('2d')!;
	c.fillStyle = BACKGROUNDS[bgEl.value] ?? '#ffffff';
	c.fillRect(0, 0, f.width, f.height);
	c.drawImage(person, 0, 0);
	flat = f;
}

function showAiStatus(s: Status) {
	aiStatus.textContent = s.text;
	if (s.fraction !== undefined) {
		aiProgress.classList.remove('hidden');
		aiProgress.value = Math.round(s.fraction * 100);
	} else {
		aiProgress.classList.add('hidden');
	}
}

aiBtn.addEventListener('click', async () => {
	if (!work) return;
	if (!aiSupported()) {
		aiStatus.textContent = 'This browser cannot run the AI tool. Try the latest Chrome, Firefox or Safari.';
		return;
	}
	const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
	const slow = conn?.saveData || /(^|-)(2g|3g)$/.test(conn?.effectiveType ?? '');
	if (slow && !person && !window.confirm('The first time, this downloads about 9 MB. Continue?')) return;

	const myGen = generation;
	const target = work;
	aiBtn.disabled = true;
	showAiStatus({ text: 'Getting ready…' });
	try {
		const mask = await computeMask(target, showAiStatus);
		if (myGen !== generation) return;
		const p = document.createElement('canvas');
		p.width = target.width;
		p.height = target.height;
		const pc = p.getContext('2d')!;
		pc.drawImage(target, 0, 0);
		pc.globalCompositeOperation = 'destination-in'; // keep the photo only where the mask says "person"
		pc.drawImage(mask, 0, 0);
		person = p;
		bgEl.disabled = false;
		bgEl.value = 'white';
		compose();
		draw();
		aiBtn.textContent = 'Remove background again';
		showAiStatus({ text: 'Done. Check the edges around your hair and shoulders, then choose a colour.' });
	} catch (err) {
		if (myGen !== generation) return;
		showAiStatus({ text: err instanceof Error ? err.message : 'The background could not be removed.' });
	} finally {
		if (myGen === generation) aiBtn.disabled = false;
	}
});

bgEl.addEventListener('change', () => {
	compose();
	draw();
});

// ---------- brightness, contrast, sharpness ----------
for (const el of [brightEl, contrastEl, sharpEl]) {
	el.addEventListener('input', () => {
		showAdjustValues();
		scheduleDraw();
	});
}

resetBtn.addEventListener('click', () => {
	resetAdjust();
	draw();
});

autoBtn.addEventListener('click', () => {
	if (!work) return;
	// Measure the photo as it is now, without any adjustment applied.
	const probe = document.createElement('canvas');
	probe.width = 160;
	probe.height = Math.round((160 * canvas.height) / canvas.width);
	const pctx = probe.getContext('2d', { willReadFrequently: true })!;
	const { sx, sy, sw, sh } = region();
	pctx.drawImage(source(), sx, sy, sw, sh, 0, 0, probe.width, probe.height);
	const a = autoAdjust(pctx.getImageData(0, 0, probe.width, probe.height));
	brightEl.value = String(a.brightness);
	contrastEl.value = String(a.contrast);
	sharpEl.value = String(a.sharpness);
	showAdjustValues();
	draw();
});

// ---------- positioning: drag, zoom, keyboard ----------
let drag: { x: number; y: number } | null = null;

canvas.addEventListener('pointerdown', (e) => {
	drag = { x: e.clientX, y: e.clientY };
	canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
	if (!drag || !work) return;
	const { scale } = region();
	const k = canvas.width / canvas.getBoundingClientRect().width; // screen px -> canvas px
	cx -= ((e.clientX - drag.x) * k) / scale;
	cy -= ((e.clientY - drag.y) * k) / scale;
	drag = { x: e.clientX, y: e.clientY };
	scheduleDraw();
});
const endDrag = () => (drag = null);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('keydown', (e) => {
	if (!work) return;
	const { sw, sh } = region();
	const step = 0.04;
	const moves: Record<string, [number, number]> = {
		ArrowLeft: [-sw * step, 0],
		ArrowRight: [sw * step, 0],
		ArrowUp: [0, -sh * step],
		ArrowDown: [0, sh * step],
	};
	const m = moves[e.key];
	if (!m) return;
	e.preventDefault();
	cx += m[0];
	cy += m[1];
	scheduleDraw();
});

zoomEl.addEventListener('input', scheduleDraw);
presetEl.addEventListener('change', syncPreset);

// ---------- output ----------
function renderPhoto(): HTMLCanvasElement {
	const p = preset();
	const out = document.createElement('canvas');
	out.width = p.w;
	out.height = p.h;
	paint(out.getContext('2d', { willReadFrequently: true })!, p.w, p.h, true);
	return out;
}

const toJpeg = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q));

photoBtn.addEventListener('click', async () => {
	if (!work) return;
	const myGen = generation;
	const p = preset();
	urls.clear();
	results.replaceChildren();
	setStatus(status, 'Creating your photo…');
	try {
		const { sw } = region();
		const out = renderPhoto();
		let blob = await toJpeg(out, 0.95);
		// Digital uploads have a size limit: lower the quality step by step until it fits.
		for (let q = 0.9; blob && p.maxBytes && blob.size > p.maxBytes && q > 0.3; q -= 0.1) blob = await toJpeg(out, q);
		out.width = out.height = 0;
		if (myGen !== generation) return;
		if (!blob) throw new Error('Could not create the photo. Try a smaller image.');
		if (p.maxBytes && blob.size > p.maxBytes) throw new Error('Could not get the photo under the upload limit.');

		const filename = `${fileName}-passport-${p.w}x${p.h}.jpg`;
		addResultRow(results, filename, `${p.w} × ${p.h} px, ${formatBytes(blob.size)}`, false, { url: urls.make(blob), filename });
		const lowRes = sw < p.w * 0.8;
		setStatus(
			status,
			lowRes ? 'Done. This photo is small, so the result may look slightly blurry. A sharper original would be better.' : 'Done.',
		);
	} catch (err) {
		fail(err instanceof Error ? err.message : 'Something went wrong.');
	}
});

// Fits as many photos as possible on the paper.
function layout(paperW: number, paperH: number, pw: number, ph: number) {
	const margin = mmToPx(5);
	const gap = mmToPx(2);
	const cols = Math.floor((paperW - 2 * margin + gap) / (pw + gap));
	const rows = Math.floor((paperH - 2 * margin + gap) / (ph + gap));
	return { cols: Math.max(0, cols), rows: Math.max(0, rows), gap };
}

sheetBtn.addEventListener('click', async () => {
	if (!work) return;
	const myGen = generation;
	const p = preset();
	const paper = PAPERS[paperEl.value] ?? PAPERS['4x6'];
	const portrait = layout(paper.w, paper.h, p.w, p.h);
	const landscape = layout(paper.h, paper.w, p.w, p.h);
	const useLandscape = landscape.cols * landscape.rows > portrait.cols * portrait.rows;
	const W = useLandscape ? paper.h : paper.w;
	const H = useLandscape ? paper.w : paper.h;
	const { cols, rows, gap } = useLandscape ? landscape : portrait;
	if (cols < 1 || rows < 1) return fail('This photo is too big for that paper. Choose A4.');

	urls.clear();
	results.replaceChildren();
	setStatus(status, 'Creating the print sheet…');
	try {
		const photo = renderPhoto();
		const sheet = document.createElement('canvas');
		sheet.width = W;
		sheet.height = H;
		const c = sheet.getContext('2d')!;
		c.fillStyle = '#fff';
		c.fillRect(0, 0, W, H);
		const gridW = cols * p.w + (cols - 1) * gap;
		const gridH = rows * p.h + (rows - 1) * gap;
		const x0 = Math.round((W - gridW) / 2);
		const y0 = Math.round((H - gridH) / 2);
		c.strokeStyle = '#cbd5e1'; // thin cutting guide
		c.lineWidth = 1;
		for (let r = 0; r < rows; r++) {
			for (let k = 0; k < cols; k++) {
				const x = x0 + k * (p.w + gap);
				const y = y0 + r * (p.h + gap);
				c.drawImage(photo, x, y);
				c.strokeRect(x - 0.5, y - 0.5, p.w + 1, p.h + 1);
			}
		}
		photo.width = photo.height = 0;
		const blob = await toJpeg(sheet, 0.95);
		sheet.width = sheet.height = 0;
		if (myGen !== generation) return;
		if (!blob) throw new Error('Could not create the sheet. Try a smaller image.');

		const filename = `${fileName}-passport-sheet-${paper.name.replace(/\s/g, '')}.jpg`;
		const url = urls.make(blob);
		const row = addResultRow(results, filename, `${cols * rows} photos on ${paper.name} paper, ${formatBytes(blob.size)}`, false, {
			url,
			filename,
		});
		const img = h('img', 'preview');
		img.src = url;
		img.alt = 'Preview of the print sheet';
		row.append(img);
		setStatus(status, `Done. Print this at a photo shop or at home on ${paper.name} paper at 100% size (no "fit to page").`);
	} catch (err) {
		fail(err instanceof Error ? err.message : 'Something went wrong.');
	}
});

showAdjustValues();
bindDropzone(zone, input, (files) => void onFiles(files));
