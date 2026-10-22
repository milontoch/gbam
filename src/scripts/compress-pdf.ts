import { bindDropzone } from './dropzone';
import { formatBytes } from './format';
import { checkPdfFile, friendlyPdfError } from './pdf-common';
import { addResultRow, baseName, byId, setStatus, urlKeeper } from './ui';

const zone = byId('file-input-zone');
const input = byId<HTMLInputElement>('file-input');
const editor = byId('editor');
const info = byId('file-info');
const methodMax = byId<HTMLInputElement>('method-max');
const levelEl = byId<HTMLSelectElement>('level');
const targetEl = byId<HTMLInputElement>('target-kb');
const goBtn = byId<HTMLButtonElement>('go-btn');
const cancelBtn = byId<HTMLButtonElement>('cancel-btn');
const progress = byId<HTMLProgressElement>('progress');
const status = byId('status');
const results = byId<HTMLUListElement>('results');
const nextStep = byId('next-step');
const nextText = byId('next-text');
const nextBtn = byId<HTMLButtonElement>('next-btn');

const urls = urlKeeper();
let source: { name: string; bytes: Uint8Array } | null = null;
let busy = false;
let cancelled = false;

type Method = 'keep' | 'max';
const method = (): Method => (methodMax.checked ? 'max' : 'keep');
const fail = (m: string) => setStatus(status, m, true);

function setBusy(on: boolean) {
	busy = on;
	goBtn.disabled = on;
	cancelBtn.classList.toggle('hidden', !on);
	progress.classList.toggle('hidden', !on);
	if (!on) progress.value = 0;
}

async function onFiles(chosen: File[]) {
	if (busy) return fail('Please wait for the current job to finish, or press Cancel.');
	const file = chosen[0];
	urls.clear();
	results.replaceChildren();
	nextStep.classList.add('hidden');
	editor.classList.add('hidden');
	source = null;
	setStatus(status, chosen.length > 1 ? 'Only the first PDF was used. Compress one PDF at a time.' : '');

	const problem = await checkPdfFile(file);
	if (problem) return fail(problem);
	source = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
	info.textContent = `${file.name}: ${formatBytes(file.size)}`;
	editor.classList.remove('hidden');
}

async function compress(chosen: Method) {
	if (!source || busy) return;
	const original = source;
	const targetKb = Number(targetEl.value);
	const target = Number.isFinite(targetKb) && targetKb > 0 ? Math.round(targetKb * 1024) : 0;

	urls.clear();
	results.replaceChildren();
	nextStep.classList.add('hidden');
	cancelled = false;
	setBusy(true);
	setStatus(status, 'Loading the PDF tool…');

	try {
		// The heavy code is fetched only now, so the page itself stays small.
		const core = await import('./pdf-compress-core');
		const levels = chosen === 'keep' ? core.SMART_LEVELS : core.MAX_LEVELS;
		const start = Math.min(Number(levelEl.value), levels.length - 1);
		const passes = target > 0 ? levels.slice(start).map((_, i) => start + i) : [start];

		let best: Uint8Array | null = null;
		let found = 0;
		let changed = 0;
		for (let p = 0; p < passes.length; p++) {
			const prefix = passes.length > 1 ? `Try ${p + 1} of ${passes.length}: ` : '';
			const ctl = {
				isCancelled: () => cancelled,
				onProgress: (s: { done: number; total: number; label: string }) => {
					progress.value = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
					setStatus(status, prefix + s.label);
				},
			};
			let bytes: Uint8Array;
			if (chosen === 'keep') {
				const r = await core.shrinkImages(original.bytes, core.SMART_LEVELS[passes[p]], ctl);
				bytes = r.bytes;
				found = r.found;
				changed = r.changed;
			} else {
				bytes = await core.rasterize(original.bytes, core.MAX_LEVELS[passes[p]], ctl);
			}
			if (!best || bytes.length < best.length) best = bytes;
			if (target > 0 && best.length <= target) break;
		}

		const before = original.bytes.length;
		const saved = best ? 1 - best.length / before : 0;
		if (!best || best.length >= before * 0.95) {
			// never hand back a file that is not clearly smaller
			if (chosen === 'keep') {
				const why =
					found === 0
						? 'This PDF has no large pictures inside it, so there is little to shrink while keeping its text.'
						: 'The pictures inside this PDF could not be made much smaller.';
				fail(`${why} Your original is unchanged.`);
				nextText.textContent = 'Maximum compression turns each page into a picture, which can shrink it much more. The text can no longer be selected.';
				nextStep.classList.remove('hidden');
			} else {
				fail('This PDF could not be made clearly smaller. It may already be small, or mostly text and drawings. Your original is unchanged.');
			}
			return;
		}

		const blob = new Blob([best as BlobPart], { type: 'application/pdf' });
		const filename = `${baseName(original.name, 'document')}-compressed.pdf`;
		const note =
			chosen === 'keep'
				? `${changed} of ${found} pictures shrunk. Text is still selectable.`
				: 'Pages are now pictures, so the text cannot be selected or searched.';
		addResultRow(results, filename, `${formatBytes(before)} → ${formatBytes(best.length)} (${Math.round(saved * 100)}% smaller). ${note}`, false, {
			url: urls.make(blob),
			filename,
		});

		if (target > 0 && best.length > target) {
			setStatus(status, `Done, but not under ${formatBytes(target)}: this is the smallest we could make. Look at it before you send it.`, true);
			if (chosen === 'keep') {
				nextText.textContent = 'Maximum compression can go smaller still. The text can no longer be selected.';
				nextStep.classList.remove('hidden');
			}
		} else {
			setStatus(status, 'Done. Open the file and look at it before you send it.');
		}
	} catch (err) {
		const name = err instanceof Error ? err.name : '';
		if (err instanceof Error && err.message === 'Cancelled') setStatus(status, 'Cancelled. Your original is unchanged.');
		else if (name === 'PasswordException' || err instanceof Error && err.constructor.name === 'PdfPasswordError')
			fail('This PDF is password-protected. Remove the password first, then try again.');
		else if (err instanceof Error && /^Maximum compression works up to/.test(err.message)) fail(err.message);
		else fail(friendlyPdfError(err));
	} finally {
		setBusy(false);
	}
}

goBtn.addEventListener('click', () => void compress(method()));
cancelBtn.addEventListener('click', () => {
	cancelled = true;
	setStatus(status, 'Cancelling…');
});
nextBtn.addEventListener('click', () => {
	methodMax.checked = true;
	void compress('max');
});

bindDropzone(zone, input, (files) => void onFiles(files));
