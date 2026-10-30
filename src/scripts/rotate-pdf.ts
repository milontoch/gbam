import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { checkPdfFile, friendlyPdfError } from './pdf-common';
import { PdfPasswordError, openPdf } from './pdfjs-loader';
import { describeTurn, isSideways, normalizeAngle, turn } from './rotate-core';
import { addResultRow, baseName, byId, h, setStatus, urlKeeper } from './ui';

const MAX_PAGES = 300;
const THUMB_SIDE = 260; // longest side of a small page picture, in pixels
const PREVIEW_SIDE = 900;

const zone = byId('file-input-zone');
const input = byId<HTMLInputElement>('file-input');
const editor = byId('editor');
const info = byId('file-info');
const selectAllBtn = byId<HTMLButtonElement>('select-all');
const selectNoneBtn = byId<HTMLButtonElement>('select-none');
const selectSidewaysBtn = byId<HTMLButtonElement>('select-sideways');
const selectionInfo = byId('selection-info');
const turnLeftBtn = byId<HTMLButtonElement>('turn-left');
const turnRightBtn = byId<HTMLButtonElement>('turn-right');
const turn180Btn = byId<HTMLButtonElement>('turn-180');
const resetBtn = byId<HTMLButtonElement>('reset-all');
const prevBtn = byId<HTMLButtonElement>('preview-prev');
const nextBtn = byId<HTMLButtonElement>('preview-next');
const previewLabel = byId('preview-label');
const previewCanvas = byId<HTMLCanvasElement>('preview-canvas');
const previewLeftBtn = byId<HTMLButtonElement>('preview-left');
const previewRightBtn = byId<HTMLButtonElement>('preview-right');
const grid = byId<HTMLUListElement>('pages');
const saveBtn = byId<HTMLButtonElement>('save-btn');
const status = byId('status');
const results = byId<HTMLUListElement>('results');

const urls = urlKeeper();
const fail = (m: string) => setStatus(status, m, true);

let source: { name: string; bytes: Uint8Array } | null = null;
let doc: { pdf: PDFDocumentProxy; task: { destroy(): Promise<void> } } | null = null;
let generation = 0; // changes with every new file, so slow work for an old file is dropped
let turns: number[] = []; // extra clockwise turn for every page, 0 / 90 / 180 / 270
let selected: boolean[] = [];
let sideways: (boolean | null)[] = [];
let previewIndex = 0;

interface Card {
	li: HTMLLIElement;
	canvas: HTMLCanvasElement;
	check: HTMLInputElement;
	badge: HTMLElement;
	drawn: boolean;
}
let cards: Card[] = [];
let observer: IntersectionObserver | null = null;

const pageCache = new Map<number, Promise<PDFPageProxy>>();
const renders = new Map<HTMLCanvasElement, { cancel(): void }>();

function getPage(i: number): Promise<PDFPageProxy> {
	let p = pageCache.get(i);
	if (!p) {
		p = doc!.pdf.getPage(i + 1);
		pageCache.set(i, p);
	}
	return p;
}

// Draws page i, with its pending turn applied, into a canvas.
async function draw(canvas: HTMLCanvasElement, i: number, longestSide: number) {
	const gen = generation;
	const page = await getPage(i);
	if (gen !== generation) return;
	const rotation = normalizeAngle(page.rotate + turns[i]);
	const base = page.getViewport({ scale: 1, rotation });
	const viewport = page.getViewport({ scale: longestSide / Math.max(base.width, base.height), rotation });

	renders.get(canvas)?.cancel();
	canvas.width = Math.max(1, Math.round(viewport.width));
	canvas.height = Math.max(1, Math.round(viewport.height));
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const task = page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' });
	renders.set(canvas, task);
	try {
		await task.promise;
	} catch (err) {
		if (!(err instanceof Error && err.name === 'RenderingCancelledException')) throw err;
	} finally {
		if (renders.get(canvas) === task) renders.delete(canvas);
	}
}

function refreshCard(i: number) {
	const c = cards[i];
	const words = describeTurn(turns[i]);
	c.badge.textContent = words ? `Will be ${words}` : '';
	c.badge.classList.toggle('hidden', !words);
	c.check.checked = selected[i];
	c.li.classList.toggle('picked', selected[i]);
	if (c.drawn) void draw(c.canvas, i, THUMB_SIDE);
}

function refreshSummary() {
	const count = selected.filter(Boolean).length;
	selectionInfo.textContent = count === 0 ? 'No pages ticked yet.' : `${count} page${count === 1 ? '' : 's'} ticked.`;
	const changed = turns.filter((t) => t !== 0).length;
	saveBtn.disabled = changed === 0;
	saveBtn.textContent = changed === 0 ? 'Save rotated PDF' : `Save rotated PDF (${changed} page${changed === 1 ? '' : 's'} turned)`;
	const bulk = count === 0;
	for (const b of [turnLeftBtn, turnRightBtn, turn180Btn]) b.disabled = bulk;
	resetBtn.disabled = changed === 0;
}

function turnPage(i: number, delta: number) {
	turns[i] = turn(turns[i], delta);
	refreshCard(i);
	if (i === previewIndex) void showPreview(i);
	refreshSummary();
	// a new change means the saved file below is out of date
	urls.clear();
	results.replaceChildren();
}

function turnSelected(delta: number) {
	if (!selected.some(Boolean)) return setStatus(status, 'Tick the pages you want to turn first.', true);
	setStatus(status, '');
	selected.forEach((on, i) => {
		if (on) turns[i] = turn(turns[i], delta);
	});
	cards.forEach((_, i) => refreshCard(i));
	void showPreview(previewIndex);
	refreshSummary();
	urls.clear();
	results.replaceChildren();
}

async function showPreview(i: number) {
	previewIndex = i;
	previewLabel.textContent = `Page ${i + 1} of ${turns.length}${turns[i] ? ` (${describeTurn(turns[i])})` : ''}`;
	prevBtn.disabled = i === 0;
	nextBtn.disabled = i === turns.length - 1;
	await draw(previewCanvas, i, PREVIEW_SIDE);
}

function buildCards(n: number) {
	grid.replaceChildren();
	observer?.disconnect();
	observer = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (!e.isIntersecting) continue;
				const i = Number((e.target as HTMLElement).dataset.i);
				const c = cards[i];
				if (c && !c.drawn) {
					c.drawn = true;
					void draw(c.canvas, i, THUMB_SIDE);
				}
				observer?.unobserve(e.target);
			}
		},
		{ rootMargin: '300px' },
	);

	cards = [];
	for (let i = 0; i < n; i++) {
		const li = h('li', 'page-card');
		li.dataset.i = String(i);

		const thumb = h('button', 'thumb');
		thumb.type = 'button';
		thumb.setAttribute('aria-label', `Preview page ${i + 1}`);
		const canvas = h('canvas');
		thumb.append(canvas);
		thumb.addEventListener('click', () => {
			void showPreview(i);
			byId('preview-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});

		const meta = h('div', 'page-meta');
		const label = h('label', 'choice');
		const check = h('input');
		check.type = 'checkbox';
		check.setAttribute('aria-label', `Tick page ${i + 1}`);
		check.addEventListener('change', () => {
			selected[i] = check.checked;
			li.classList.toggle('picked', check.checked);
			refreshSummary();
		});
		label.append(check, h('span', undefined, `Page ${i + 1}`));
		const badge = h('span', 'rot-badge hidden');
		meta.append(label, badge);

		const actions = h('div', 'row-actions');
		const left = h('button', 'btn btn-secondary btn-small', '↺');
		left.type = 'button';
		left.setAttribute('aria-label', `Turn page ${i + 1} left`);
		left.addEventListener('click', () => turnPage(i, -90));
		const right = h('button', 'btn btn-secondary btn-small', '↻');
		right.type = 'button';
		right.setAttribute('aria-label', `Turn page ${i + 1} right`);
		right.addEventListener('click', () => turnPage(i, 90));
		actions.append(left, right);

		li.append(thumb, meta, actions);
		grid.append(li);
		cards.push({ li, canvas, check, badge, drawn: false });
		observer.observe(li);
	}
}

async function closeDoc() {
	generation++;
	for (const r of renders.values()) r.cancel();
	renders.clear();
	pageCache.clear();
	observer?.disconnect();
	const old = doc;
	doc = null;
	await old?.task.destroy().catch(() => {});
}

async function onFiles(chosen: File[]) {
	const file = chosen[0];
	await closeDoc();
	urls.clear();
	results.replaceChildren();
	editor.classList.add('hidden');
	source = null;
	setStatus(status, chosen.length > 1 ? 'Only the first PDF was used. Rotate one PDF at a time.' : '');

	const problem = await checkPdfFile(file);
	if (problem) return fail(problem);

	setStatus(status, 'Loading the pages…');
	const gen = generation;
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const opened = await openPdf(bytes);
		if (gen !== generation) return void (await opened.task.destroy());
		const n = opened.pdf.numPages;
		if (n < 1) throw new Error('empty');
		if (n > MAX_PAGES) {
			await opened.task.destroy();
			return fail(`This PDF has ${n} pages. This tool shows up to ${MAX_PAGES}. Use Split PDF to cut it into smaller parts first.`);
		}
		doc = opened;
		source = { name: file.name, bytes };
	} catch (err) {
		return fail(err instanceof PdfPasswordError ? 'This PDF is password-protected. Remove the password first, then try again.' : friendlyPdfError(err));
	}

	const n = doc!.pdf.numPages;
	turns = new Array(n).fill(0);
	selected = new Array(n).fill(false);
	sideways = new Array(n).fill(null);
	info.textContent = `${file.name}: ${n} page${n === 1 ? '' : 's'}, ${formatBytes(file.size)}`;
	buildCards(n);
	editor.classList.remove('hidden');
	setStatus(status, '');
	refreshSummary();
	selectSidewaysBtn.disabled = true;
	void showPreview(0);

	// Find which pages are wider than tall, in the background, without blocking the screen.
	void (async () => {
		for (let i = 0; i < n; i++) {
			if (gen !== generation) return;
			const page = await getPage(i);
			const v = page.getViewport({ scale: 1 });
			sideways[i] = isSideways(v.width, v.height);
			if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
		}
		if (gen === generation) selectSidewaysBtn.disabled = false;
	})();
}

selectAllBtn.addEventListener('click', () => {
	selected.fill(true);
	cards.forEach((_, i) => refreshCard(i));
	refreshSummary();
});
selectNoneBtn.addEventListener('click', () => {
	selected.fill(false);
	cards.forEach((_, i) => refreshCard(i));
	refreshSummary();
});
selectSidewaysBtn.addEventListener('click', () => {
	const count = sideways.filter(Boolean).length;
	selected = sideways.map((s) => s === true);
	cards.forEach((_, i) => refreshCard(i));
	refreshSummary();
	setStatus(status, count === 0 ? 'No page is wider than it is tall, so none was ticked.' : `${count} wide page${count === 1 ? '' : 's'} ticked. Turn them right or left to stand them up.`);
});
turnLeftBtn.addEventListener('click', () => turnSelected(-90));
turnRightBtn.addEventListener('click', () => turnSelected(90));
turn180Btn.addEventListener('click', () => turnSelected(180));
resetBtn.addEventListener('click', () => {
	turns.fill(0);
	cards.forEach((_, i) => refreshCard(i));
	void showPreview(previewIndex);
	refreshSummary();
	urls.clear();
	results.replaceChildren();
});
prevBtn.addEventListener('click', () => void showPreview(Math.max(0, previewIndex - 1)));
nextBtn.addEventListener('click', () => void showPreview(Math.min(turns.length - 1, previewIndex + 1)));
previewLeftBtn.addEventListener('click', () => turnPage(previewIndex, -90));
previewRightBtn.addEventListener('click', () => turnPage(previewIndex, 90));

saveBtn.addEventListener('click', async () => {
	if (!source) return;
	saveBtn.disabled = true;
	urls.clear();
	results.replaceChildren();
	setStatus(status, 'Saving…');
	try {
		const { PDFDocument, degrees } = await import('pdf-lib'); // loaded only now
		// Only each page's "which way up" flag changes. Text, pictures and quality are left exactly as they were.
		const pdf = await PDFDocument.load(source.bytes, { updateMetadata: false });
		if (pdf.getPageCount() !== turns.length) throw new Error('This PDF could not be read. It may be damaged.');
		let count = 0;
		turns.forEach((delta, i) => {
			if (delta === 0) return;
			const page = pdf.getPage(i);
			page.setRotation(degrees(turn(page.getRotation().angle, delta)));
			count++;
		});
		const bytes = await pdf.save();
		const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
		const filename = `${baseName(source.name, 'document')}-rotated.pdf`;
		addResultRow(results, filename, `${count} page${count === 1 ? '' : 's'} turned, ${formatBytes(blob.size)} (original ${formatBytes(source.bytes.length)})`, false, {
			url: urls.make(blob),
			filename,
		});
		setStatus(status, 'Done. Open the PDF and check that the pages now stand the right way up.');
	} catch (err) {
		fail(err instanceof Error && /damaged/.test(err.message) ? err.message : friendlyPdfError(err));
	} finally {
		refreshSummary();
	}
});

window.addEventListener('pagehide', () => void closeDoc());
bindDropzone(zone, input, (files) => void onFiles(files));
