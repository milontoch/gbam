import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { decodeImage, precheckImage } from './image-load';
import { MARGINS, QUALITY, layoutPage, type Orientation, type PageSize } from './pdf-maker-core';
import { addResultRow, byId, safeFilename, setStatus, urlKeeper } from './ui';

const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;

const zone = byId('file-input-zone');
const input = byId<HTMLInputElement>('file-input');
const list = byId<HTMLUListElement>('file-list');
const options = byId('options');
const sizeEl = byId<HTMLSelectElement>('page-size');
const orientationEl = byId<HTMLSelectElement>('orientation');
const marginEl = byId<HTMLSelectElement>('margin');
const qualityEl = byId<HTMLSelectElement>('quality');
const nameEl = byId<HTMLInputElement>('pdf-name');
const orientationField = byId('orientation-field');
const marginField = byId('margin-field');
const makeBtn = byId<HTMLButtonElement>('make-btn');
const clearBtn = byId<HTMLButtonElement>('clear-btn');
const status = byId('status');
const results = byId<HTMLUListElement>('results');

const urls = urlKeeper();
let items: File[] = [];
let busy = false;

function render() {
	list.replaceChildren();
	items.forEach((file, i) => {
		const li = document.createElement('li');
		li.className = 'result';

		const text = document.createElement('div');
		const name = document.createElement('p');
		name.className = 'result-name';
		name.textContent = `${i + 1}. ${file.name}`;
		const size = document.createElement('p');
		size.className = 'result-detail';
		size.textContent = formatBytes(file.size);
		text.append(name, size);

		const actions = document.createElement('div');
		actions.className = 'row-actions';
		const mk = (label: string, aria: string, onClick: () => void, disabled = false) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'btn btn-secondary btn-small';
			b.textContent = label;
			b.setAttribute('aria-label', `${aria} ${file.name}`);
			b.disabled = disabled || busy;
			b.addEventListener('click', onClick);
			return b;
		};
		actions.append(
			mk('↑', 'Move up', () => move(i, -1), i === 0),
			mk('↓', 'Move down', () => move(i, 1), i === items.length - 1),
			mk('Remove', 'Remove', () => {
				items.splice(i, 1);
				changed();
			}),
		);
		li.append(text, actions);
		list.append(li);
	});
	makeBtn.disabled = items.length === 0 || busy;
	clearBtn.classList.toggle('hidden', items.length === 0);
	options.classList.toggle('hidden', items.length === 0);
	const fit = sizeEl.value === 'fit';
	orientationField.classList.toggle('hidden', fit);
	marginField.classList.toggle('hidden', fit);
}

function move(i: number, dir: -1 | 1) {
	const j = i + dir;
	if (j < 0 || j >= items.length) return;
	[items[i], items[j]] = [items[j], items[i]];
	changed();
}

function changed() {
	urls.clear();
	results.replaceChildren();
	setStatus(status, '');
	render();
}

function onFiles(chosen: File[]) {
	if (busy) return;
	const problems: string[] = [];
	let total = items.reduce((s, f) => s + f.size, 0);
	for (const file of chosen) {
		if (items.length >= MAX_FILES) {
			problems.push(`Only ${MAX_FILES} pictures can go into one PDF.`);
			break;
		}
		const problem = precheckImage(file);
		if (problem) {
			problems.push(`${file.name}: ${problem}`);
			continue;
		}
		if (total + file.size > MAX_TOTAL_BYTES) {
			problems.push('These pictures add up to more than 300 MB. Make the PDF in two parts.');
			break;
		}
		total += file.size;
		items.push(file);
	}
	changed();
	if (problems.length > 0) setStatus(status, problems.join(' '), true);
}

clearBtn.addEventListener('click', () => {
	items = [];
	changed();
});
sizeEl.addEventListener('change', render);

makeBtn.addEventListener('click', async () => {
	if (items.length === 0 || busy) return;
	busy = true;
	urls.clear();
	results.replaceChildren();
	render();
	setStatus(status, 'Loading the PDF tool…');

	try {
		const { PDFDocument } = await import('pdf-lib'); // loaded only now, so the page stays small
		const doc = await PDFDocument.create();
		const q = QUALITY[qualityEl.value as keyof typeof QUALITY] ?? QUALITY.high;
		const size = sizeEl.value as PageSize;
		const orientation = orientationEl.value as Orientation;
		const margin = MARGINS[marginEl.value as keyof typeof MARGINS] ?? 0;

		for (let i = 0; i < items.length; i++) {
			const file = items[i];
			setStatus(status, `Adding picture ${i + 1} of ${items.length}: ${file.name}`);
			let bitmap: ImageBitmap;
			try {
				bitmap = await decodeImage(file, MAX_PIXELS);
			} catch (err) {
				throw new Error(`${file.name}: ${err instanceof Error ? err.message : 'This picture could not be read.'}`);
			}
			const k = Math.min(1, q.cap / Math.max(bitmap.width, bitmap.height));
			const w = Math.max(1, Math.round(bitmap.width * k));
			const h = Math.max(1, Math.round(bitmap.height * k));
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Your browser could not create a drawing surface.');
			ctx.fillStyle = '#ffffff'; // transparent pictures sit on white paper
			ctx.fillRect(0, 0, w, h);
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bitmap, 0, 0, w, h);
			bitmap.close();
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q.jpeg));
			canvas.width = canvas.height = 0;
			if (!blob) throw new Error(`${file.name}: this picture could not be added. Try a smaller one.`);

			const image = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
			const place = layoutPage(w, h, size, orientation, margin);
			doc.addPage([place.pageW, place.pageH]).drawImage(image, { x: place.x, y: place.y, width: place.w, height: place.h });
		}

		doc.setProducer('HandyQuill');
		doc.setCreator('HandyQuill');
		setStatus(status, 'Saving…');
		const bytes = await doc.save({ useObjectStreams: true });
		const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
		const base = safeFilename(nameEl.value.trim().replace(/\.pdf$/i, '')) || 'images';
		const filename = `${base}.pdf`;
		addResultRow(results, filename, `${items.length} page${items.length === 1 ? '' : 's'}, ${formatBytes(blob.size)}`, false, {
			url: urls.make(blob),
			filename,
		});
		setStatus(status, 'Done. Open the PDF and look at it before you send it.');
	} catch (err) {
		setStatus(status, err instanceof Error ? err.message : 'Something went wrong.', true);
	} finally {
		busy = false;
		render();
	}
});

render();
bindDropzone(zone, input, onFiles);
