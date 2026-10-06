import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { addResultRow, baseName, byId, setStatus, urlKeeper } from './ui';

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_SIDE = 8000;
const MAX_OUTPUT_PIXELS = 16_000_000; // older iPhones fail silently above ~16.7 megapixels
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

const zone = byId('file-input-zone');
const input = byId<HTMLInputElement>('file-input');
const editor = byId('editor');
const info = byId('original-info');
const widthEl = byId<HTMLInputElement>('width');
const heightEl = byId<HTMLInputElement>('height');
const lockEl = byId<HTMLInputElement>('lock');
const formatEl = byId<HTMLSelectElement>('format');
const qualityEl = byId<HTMLInputElement>('quality');
const qualityValue = byId('quality-value');
const qualityField = byId('quality-field');
const goBtn = byId<HTMLButtonElement>('resize-btn');
const status = byId('status');
const results = byId<HTMLUListElement>('results');

const urls = urlKeeper();
let bitmap: ImageBitmap | null = null;
let source: File | null = null;

function whole(value: string): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n) : NaN;
}

async function onFiles(chosen: File[]) {
	const file = chosen[0];
	urls.clear();
	results.replaceChildren();
	setStatus(status, chosen.length > 1 ? 'Only the first image was used. Resize one image at a time.' : '');

	if (!ACCEPTED.includes(file.type)) return fail('This file type is not supported. Use JPG, PNG or WebP.');
	if (file.size > MAX_BYTES) return fail(`This file is larger than ${formatBytes(MAX_BYTES)}.`);

	let next: ImageBitmap;
	try {
		next = await createImageBitmap(file);
	} catch {
		return fail('This image could not be read. It may be damaged.');
	}
	bitmap?.close();
	bitmap = next;
	source = file;

	info.textContent = `${file.name}: ${bitmap.width} × ${bitmap.height} px, ${formatBytes(file.size)}`;
	widthEl.value = String(bitmap.width);
	heightEl.value = String(bitmap.height);
	editor.classList.remove('hidden');
}

function fail(message: string) {
	setStatus(status, message, true);
}

// Keep width and height in proportion while "lock" is ticked.
widthEl.addEventListener('input', () => {
	if (!bitmap || !lockEl.checked) return;
	const w = whole(widthEl.value);
	heightEl.value = w > 0 ? String(Math.max(1, Math.round((w * bitmap.height) / bitmap.width))) : '';
});
heightEl.addEventListener('input', () => {
	if (!bitmap || !lockEl.checked) return;
	const h = whole(heightEl.value);
	widthEl.value = h > 0 ? String(Math.max(1, Math.round((h * bitmap.width) / bitmap.height))) : '';
});

function syncQuality() {
	qualityField.classList.toggle('hidden', formatEl.value === 'image/png');
	qualityValue.textContent = qualityEl.value;
}
formatEl.addEventListener('change', syncQuality);
qualityEl.addEventListener('input', syncQuality);

goBtn.addEventListener('click', async () => {
	if (!bitmap || !source) return;
	const w = whole(widthEl.value);
	const h = whole(heightEl.value);
	if (!(w > 0) || !(h > 0)) return fail('Enter a width and height greater than 0.');
	if (w > MAX_SIDE || h > MAX_SIDE) return fail(`Width and height can be at most ${MAX_SIDE} px.`);
	if (w * h > MAX_OUTPUT_PIXELS) {
		return fail('That size is too big for phones to create safely. Try a smaller width or height.');
	}

	const type = formatEl.value;
	urls.clear();
	results.replaceChildren();
	setStatus(status, 'Resizing…');
	goBtn.disabled = true;

	try {
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Your browser could not create a drawing surface.');
		if (type === 'image/jpeg') {
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, w, h);
		}
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0, w, h);

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, type, type === 'image/png' ? undefined : Number(qualityEl.value) / 100),
		);
		canvas.width = canvas.height = 0;
		if (!blob || blob.type !== type) throw new Error('Your browser cannot create this format. Choose JPEG instead.');

		const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
		const filename = `${baseName(source.name, 'image')}-${w}x${h}.${ext}`;
		const url = urls.make(blob);
		const enlarged = w > bitmap.width || h > bitmap.height;
		const row = addResultRow(
			results,
			filename,
			`${w} × ${h} px, ${formatBytes(blob.size)}${enlarged ? '. Note: enlarging a photo makes it look blurry.' : ''}`,
			false,
			{ url, filename },
		);
		const img = document.createElement('img');
		img.className = 'preview';
		img.src = url;
		img.alt = 'Preview of the resized image';
		row.append(img);
		setStatus(status, 'Done.');
	} catch (err) {
		fail(err instanceof Error ? err.message : 'Something went wrong.');
	} finally {
		goBtn.disabled = false;
	}
});

syncQuality();
bindDropzone(zone, input, (files) => void onFiles(files));
