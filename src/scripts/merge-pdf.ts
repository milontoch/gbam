import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { checkPdfFile, friendlyPdfError } from './pdf-common';
import { addResultRow, byId, setStatus, urlKeeper } from './ui';

const MAX_FILES = 30;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

const zone = byId('file-input-zone');
const input = byId<HTMLInputElement>('file-input');
const list = byId<HTMLUListElement>('file-list');
const mergeBtn = byId<HTMLButtonElement>('merge-btn');
const clearBtn = byId<HTMLButtonElement>('clear-btn');
const status = byId('status');
const results = byId<HTMLUListElement>('results');

const urls = urlKeeper();
let items: File[] = [];

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
			b.disabled = disabled;
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
	mergeBtn.disabled = items.length < 2;
	clearBtn.classList.toggle('hidden', items.length === 0);
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
	setStatus(status, items.length === 1 ? 'Add at least one more PDF to merge.' : '');
	render();
}

async function onFiles(chosen: File[]) {
	const problems: string[] = [];
	for (const file of chosen) {
		if (items.length >= MAX_FILES) {
			problems.push(`Only ${MAX_FILES} files can be merged at once.`);
			break;
		}
		const problem = await checkPdfFile(file);
		if (problem) {
			problems.push(`${file.name}: ${problem}`);
			continue;
		}
		items.push(file);
	}
	changed();
	if (problems.length > 0) setStatus(status, problems.join(' '), true);
}

clearBtn.addEventListener('click', () => {
	items = [];
	changed();
});

mergeBtn.addEventListener('click', async () => {
	if (items.length < 2) return;
	if (items.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES) {
		return setStatus(status, 'These files add up to more than 300 MB. Merge fewer files at a time.', true);
	}

	urls.clear();
	results.replaceChildren();
	mergeBtn.disabled = true;
	setStatus(status, 'Loading the PDF tool…');

	try {
		// Loaded only now, so the page itself stays small and fast.
		const { PDFDocument } = await import('pdf-lib');
		const merged = await PDFDocument.create();
		let pageTotal = 0;

		for (let i = 0; i < items.length; i++) {
			const file = items[i];
			setStatus(status, `Adding ${i + 1} of ${items.length}: ${file.name}`);
			try {
				// A damaged file can load "successfully" and only fail when its pages are read,
				// so the whole read-and-copy step sits inside the same try.
				const doc = await PDFDocument.load(await file.arrayBuffer());
				const pages = await merged.copyPages(doc, doc.getPageIndices());
				pages.forEach((p) => merged.addPage(p));
				pageTotal += pages.length;
			} catch (err) {
				throw new Error(`${file.name}: ${friendlyPdfError(err)}`);
			}
		}

		setStatus(status, 'Saving…');
		const bytes = await merged.save();
		const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
		const url = urls.make(blob);
		addResultRow(results, 'merged.pdf', `${pageTotal} pages, ${formatBytes(blob.size)}`, false, {
			url,
			filename: 'merged.pdf',
		});
		setStatus(status, 'Done. Your PDFs are merged.');
	} catch (err) {
		setStatus(status, err instanceof Error ? err.message : 'Something went wrong.', true);
	} finally {
		mergeBtn.disabled = items.length < 2;
	}
});

render();
bindDropzone(zone, input, (files) => void onFiles(files));
