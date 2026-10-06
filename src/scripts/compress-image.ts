import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { decodeImage } from './image-load';
import { baseName, safeFilename } from './ui';

const MAX_FILES = 20;
const MAX_PIXELS = 60_000_000; // 60 megapixels; bigger can crash phones

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const zone = $<HTMLElement>('file-input-zone');
const input = $<HTMLInputElement>('file-input');
const quality = $<HTMLInputElement>('quality');
const qualityValue = $<HTMLElement>('quality-value');
const maxWidth = $<HTMLSelectElement>('max-width');
const format = $<HTMLSelectElement>('format');
const status = $<HTMLElement>('status');
const results = $<HTMLUListElement>('results');

let files: File[] = [];
let runId = 0; // lets a newer run cancel an older one
let objectUrls: string[] = [];

function setStatus(message: string, isError = false) {
	status.textContent = message;
	status.classList.toggle('error', isError);
}

async function compressOne(file: File, type: string, q: number, maxW: number) {
	const bitmap = await decodeImage(file, MAX_PIXELS);
	const originalW = bitmap.width;
	const originalH = bitmap.height;

	let w = originalW;
	let h = originalH;
	if (maxW > 0 && w > maxW) {
		h = Math.round((h * maxW) / w);
		w = maxW;
	}

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		throw new Error('Your browser could not create a drawing surface.');
	}
	if (type === 'image/jpeg') {
		ctx.fillStyle = '#ffffff'; // JPEG has no transparency
		ctx.fillRect(0, 0, w, h);
	}
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
	canvas.width = canvas.height = 0; // free memory (matters on Safari)

	if (!blob) throw new Error('Compression failed. Try a smaller image.');
	if (blob.type !== type) {
		throw new Error('Your browser cannot create this format. Choose JPEG instead.');
	}
	return { blob, resized: w !== originalW };
}

function outputName(name: string, type: string) {
	const base = baseName(name, 'image');
	return `${base}-compressed.${type === 'image/webp' ? 'webp' : 'jpg'}`;
}

function addRow(name: string, detail: string, failed: boolean, download?: { url: string; filename: string }) {
	const li = document.createElement('li');
	li.className = failed ? 'result failed' : 'result';

	const text = document.createElement('div');
	const title = document.createElement('p');
	title.className = 'result-name';
	title.textContent = name; // textContent, never innerHTML: file names are untrusted
	const info = document.createElement('p');
	info.className = 'result-detail';
	info.textContent = detail;
	text.append(title, info);
	li.append(text);

	if (download) {
		const a = document.createElement('a');
		a.className = 'btn';
		a.href = download.url;
		a.download = download.filename;
		a.textContent = 'Download';
		li.append(a);
	}
	results.append(li);
}

async function run() {
	const myRun = ++runId;
	objectUrls.forEach((u) => URL.revokeObjectURL(u));
	objectUrls = [];
	results.replaceChildren();
	if (files.length === 0) return;

	const type = format.value;
	const q = Number(quality.value) / 100;
	const maxW = Number(maxWidth.value);

	let totalBefore = 0;
	let totalAfter = 0;

	for (let i = 0; i < files.length; i++) {
		if (myRun !== runId) return; // settings changed; a newer run took over
		const file = files[i];
		setStatus(`Compressing ${i + 1} of ${files.length}…`);
		try {
			const { blob, resized } = await compressOne(file, type, q, maxW);
			if (myRun !== runId) return;

			// Never hand back a bigger file than the user started with.
			const keepOriginal = blob.size >= file.size && !resized;
			const finalBlob = keepOriginal ? file : blob;
			const url = URL.createObjectURL(finalBlob);
			objectUrls.push(url);

			totalBefore += file.size;
			totalAfter += finalBlob.size;
			const detail = keepOriginal
				? `${formatBytes(file.size)}. Already well compressed, so the original is kept.`
				: `${formatBytes(file.size)} → ${formatBytes(blob.size)} (${Math.max(0, Math.round((1 - blob.size / file.size) * 100))}% smaller)`;
			addRow(file.name, detail, false, {
				url,
				filename: keepOriginal ? safeFilename(file.name) || 'image' : outputName(file.name, type),
			});
		} catch (err) {
			addRow(file.name, err instanceof Error ? err.message : 'Something went wrong.', true);
		}
	}

	if (myRun !== runId) return;
	setStatus(
		totalBefore > 0
			? `Done. You saved ${formatBytes(Math.max(0, totalBefore - totalAfter))} in total.`
			: 'No files could be compressed.',
		totalBefore === 0,
	);
}

function onFiles(chosen: File[]) {
	if (chosen.length > MAX_FILES) {
		setStatus(`Only the first ${MAX_FILES} images were used.`, true);
		chosen = chosen.slice(0, MAX_FILES);
	}
	files = chosen;
	void run();
}

let timer: number | undefined;
function rerunSoon() {
	window.clearTimeout(timer);
	timer = window.setTimeout(() => void run(), 300);
}

quality.addEventListener('input', () => {
	qualityValue.textContent = quality.value;
	rerunSoon();
});
maxWidth.addEventListener('change', rerunSoon);
format.addEventListener('change', rerunSoon);

bindDropzone(zone, input, onFiles);
