import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { addResultRow, baseName, byId, h, setStatus, urlKeeper } from './ui';

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
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

const ctx = canvas.getContext('2d')!;
const urls = urlKeeper();

let bitmap: ImageBitmap | null = null;
let fileName = 'photo';
let cx = 0; // centre of the crop, in source-image pixels
let cy = 0;
let generation = 0; // bumps when a new photo is chosen, so slow results for an old photo are dropped

const preset = () => PRESETS[presetEl.value] ?? PRESETS['print-35x45'];
const fail = (m: string) => setStatus(status, m, true);

// Size the on-screen crop box to the chosen photo shape.
function sizeCanvas() {
	const p = preset();
	const cssW = Math.min(canvas.parentElement?.clientWidth || 300, 320);
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	canvas.style.width = `${cssW}px`;
	canvas.style.height = `${Math.round((cssW * p.h) / p.w)}px`;
	canvas.width = Math.round(cssW * dpr);
	canvas.height = Math.round(((cssW * p.h) / p.w) * dpr);
}

// The part of the photo that is inside the frame, in source pixels.
function region() {
	const b = bitmap!;
	const cover = Math.max(canvas.width / b.width, canvas.height / b.height);
	const scale = cover * Number(zoomEl.value);
	const sw = canvas.width / scale;
	const sh = canvas.height / scale;
	cx = Math.min(Math.max(cx, sw / 2), b.width - sw / 2);
	cy = Math.min(Math.max(cy, sh / 2), b.height - sh / 2);
	return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh, scale };
}

function draw() {
	if (!bitmap) return;
	const { sx, sy, sw, sh } = region();
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

function resetView() {
	if (!bitmap) return;
	sizeCanvas();
	zoomEl.value = '1';
	cx = bitmap.width / 2;
	cy = bitmap.height * 0.45; // faces sit a little above the middle of most photos
	draw();
}

async function onFiles(chosen: File[]) {
	const file = chosen[0];
	generation++;
	urls.clear();
	results.replaceChildren();
	setStatus(status, chosen.length > 1 ? 'Only the first photo was used.' : '');

	if (!ACCEPTED.includes(file.type)) return fail('This file type is not supported. Use JPG, PNG or WebP.');
	if (file.size > MAX_BYTES) return fail(`This file is larger than ${formatBytes(MAX_BYTES)}.`);

	let next: ImageBitmap;
	try {
		next = await createImageBitmap(file);
	} catch {
		return fail('This image could not be read. It may be damaged.');
	}
	if (next.width * next.height > MAX_PIXELS) {
		next.close();
		return fail('This image is too large to handle safely. Use a smaller photo.');
	}
	bitmap?.close();
	bitmap = next;
	fileName = baseName(file.name, 'photo');
	editor.classList.remove('hidden');
	syncPreset();
}

function syncPreset() {
	sheetBox.classList.toggle('hidden', !preset().sheet);
	resetView();
}

// ---------- positioning: drag, zoom, keyboard ----------
let drag: { x: number; y: number } | null = null;

canvas.addEventListener('pointerdown', (e) => {
	drag = { x: e.clientX, y: e.clientY };
	canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
	if (!drag || !bitmap) return;
	const { scale } = region();
	const k = canvas.width / canvas.getBoundingClientRect().width; // screen px -> canvas px
	cx -= ((e.clientX - drag.x) * k) / scale;
	cy -= ((e.clientY - drag.y) * k) / scale;
	drag = { x: e.clientX, y: e.clientY };
	draw();
});
const endDrag = () => (drag = null);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('keydown', (e) => {
	if (!bitmap) return;
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
	draw();
});

zoomEl.addEventListener('input', draw);
presetEl.addEventListener('change', syncPreset);

// ---------- output ----------
function renderPhoto(): HTMLCanvasElement {
	const p = preset();
	const { sx, sy, sw, sh } = region();
	const out = document.createElement('canvas');
	out.width = p.w;
	out.height = p.h;
	const c = out.getContext('2d')!;
	c.fillStyle = '#fff';
	c.fillRect(0, 0, p.w, p.h);
	c.imageSmoothingQuality = 'high';
	c.drawImage(bitmap!, sx, sy, sw, sh, 0, 0, p.w, p.h);
	return out;
}

const toJpeg = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q));

photoBtn.addEventListener('click', async () => {
	if (!bitmap) return;
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

// Fits as many photos as possible on the paper, trying both paper directions.
function layout(paperW: number, paperH: number, pw: number, ph: number) {
	const margin = mmToPx(5);
	const gap = mmToPx(2);
	const cols = Math.floor((paperW - 2 * margin + gap) / (pw + gap));
	const rows = Math.floor((paperH - 2 * margin + gap) / (ph + gap));
	return { cols: Math.max(0, cols), rows: Math.max(0, rows), gap };
}

sheetBtn.addEventListener('click', async () => {
	if (!bitmap) return;
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

bindDropzone(zone, input, (files) => void onFiles(files));
