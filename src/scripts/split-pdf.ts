import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { checkPdfFile, friendlyPdfError } from './pdf-common';
import { parseRanges } from './pdf-ranges';
import { addResultRow, baseName, byId, setStatus, urlKeeper } from './ui';

const MAX_SPLIT_ALL_PAGES = 300;

type PdfLib = typeof import('pdf-lib');
type PdfDoc = import('pdf-lib').PDFDocument;

const zone = byId('file-input-zone');
const input = byId<HTMLInputElement>('file-input');
const editor = byId('editor');
const info = byId('file-info');
const modeExtract = byId<HTMLInputElement>('mode-extract');
const modeAll = byId<HTMLInputElement>('mode-all');
const rangeField = byId('range-field');
const rangeEl = byId<HTMLInputElement>('range');
const goBtn = byId<HTMLButtonElement>('split-btn');
const status = byId('status');
const results = byId<HTMLUListElement>('results');

const urls = urlKeeper();
let lib: PdfLib | null = null;
let doc: PdfDoc | null = null;
let name = 'document';
let loadId = 0;

const fail = (m: string) => setStatus(status, m, true);

function syncMode() {
	rangeField.classList.toggle('hidden', !modeExtract.checked);
}
modeExtract.addEventListener('change', syncMode);
modeAll.addEventListener('change', syncMode);

async function onFiles(chosen: File[]) {
	const file = chosen[0];
	const myLoad = ++loadId;
	urls.clear();
	results.replaceChildren();
	editor.classList.add('hidden');
	doc = null;
	setStatus(status, chosen.length > 1 ? 'Only the first PDF was used. Split one PDF at a time.' : '');

	const problem = await checkPdfFile(file);
	if (problem) return fail(problem);

	let pages: number;
	try {
		lib ??= await import('pdf-lib');
		const loaded = await lib.PDFDocument.load(await file.arrayBuffer());
		pages = loaded.getPageCount(); // damaged files can load but fail here
		if (pages < 1) throw new Error('empty');
		if (myLoad !== loadId) return;
		doc = loaded;
	} catch (err) {
		return fail(friendlyPdfError(err));
	}

	name = baseName(file.name, 'document');
	info.textContent = `${file.name}: ${pages} page${pages === 1 ? '' : 's'}, ${formatBytes(file.size)}`;
	rangeEl.placeholder = pages > 1 ? `for example 1-${Math.min(3, pages)}` : '1';
	editor.classList.remove('hidden');
	syncMode();
}

async function extract(source: PdfDoc, indexes: number[]): Promise<Uint8Array> {
	const out = await lib!.PDFDocument.create();
	const pages = await out.copyPages(source, indexes);
	pages.forEach((p) => out.addPage(p));
	return out.save();
}

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

goBtn.addEventListener('click', async () => {
	if (!doc || !lib) return;
	const source = doc;
	const count = source.getPageCount();
	urls.clear();
	results.replaceChildren();

	try {
		if (modeExtract.checked) {
			const indexes = parseRanges(rangeEl.value, count);
			goBtn.disabled = true;
			setStatus(status, 'Extracting pages…');
			const blob = pdfBlob(await extract(source, indexes));
			const filename = `${name}-extract.pdf`;
			addResultRow(results, filename, `${indexes.length} page${indexes.length === 1 ? '' : 's'}, ${formatBytes(blob.size)}`, false, {
				url: urls.make(blob),
				filename,
			});
			setStatus(status, 'Done.');
		} else {
			if (count > MAX_SPLIT_ALL_PAGES) {
				return fail(`Splitting every page works up to ${MAX_SPLIT_ALL_PAGES} pages. Use "Extract pages" for this file.`);
			}
			goBtn.disabled = true;
			const { zipSync } = await import('fflate');
			const files: Record<string, Uint8Array> = {};
			const pad = String(count).length;
			for (let i = 0; i < count; i++) {
				setStatus(status, `Splitting page ${i + 1} of ${count}…`);
				files[`${name}-page-${String(i + 1).padStart(pad, '0')}.pdf`] = await extract(source, [i]);
				if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0)); // let the phone redraw the screen
			}
			setStatus(status, 'Creating the ZIP file…');
			const zipped = zipSync(files, { level: 0 }); // PDFs are already compressed
			const blob = new Blob([zipped as BlobPart], { type: 'application/zip' });
			const filename = `${name}-pages.zip`;
			addResultRow(results, filename, `${count} separate PDFs, ${formatBytes(blob.size)}`, false, {
				url: urls.make(blob),
				filename,
			});
			setStatus(status, 'Done.');
		}
	} catch (err) {
		fail(err instanceof Error ? err.message : 'Something went wrong.');
	} finally {
		goBtn.disabled = false;
	}
});

syncMode();
bindDropzone(zone, input, (files) => void onFiles(files));
