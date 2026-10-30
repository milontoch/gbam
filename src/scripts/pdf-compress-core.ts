// The two ways of making a PDF smaller. Loaded only when the user presses "Compress".
//
//  1. shrinkImages(): finds the pictures inside the PDF (a scanned or photographed document is made of
//     pictures) and re-saves only those, smaller. Text, links and layout stay exactly as they were.
//  2. rasterize(): draws every page as a picture at a lower resolution and rebuilds the PDF. Much stronger,
//     but the text can no longer be selected or searched.
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { PdfPasswordError, openPdf } from './pdfjs-loader';

export interface Progress {
	done: number;
	total: number;
	label: string;
}

export interface Control {
	onProgress: (p: Progress) => void;
	isCancelled: () => boolean;
}

export class Cancelled extends Error {
	constructor() {
		super('Cancelled');
	}
}

// Settings from light to extreme. "cap" = the longest side, in pixels, a picture inside the PDF may keep.
// "dpi" = how sharp each page is drawn when pages become pictures (150 is good for printing, 72 is screen-only).
export const SMART_LEVELS = [
	{ cap: 2200, quality: 0.8 },
	{ cap: 1700, quality: 0.7 },
	{ cap: 1200, quality: 0.6 },
	{ cap: 900, quality: 0.5 },
];
export const MAX_LEVELS = [
	{ dpi: 150, quality: 0.75 },
	{ dpi: 120, quality: 0.65 },
	{ dpi: 96, quality: 0.55 },
	{ dpi: 72, quality: 0.45 },
];

const MIN_IMAGE_BYTES = 20 * 1024; // pictures smaller than this are not worth touching
const MAX_RENDER_PIXELS = 16_000_000; // one page picture; older iPhones fail silently above ~16.7 megapixels
export const MAX_RASTER_PAGES = 300;

const N = (s: string) => PDFName.of(s);
const nameOf = (v: unknown) => (v instanceof PDFName ? v.decodeText() : undefined);

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Only plain, single-JPEG, colour or grey pictures are changed. Anything unusual is left exactly as it is.
function plainJpegInfo(stream: PDFRawStream): { width: number; height: number } | null {
	const d = stream.dict;
	if (nameOf(d.lookup(N('Subtype'))) !== 'Image') return null;

	const filter = d.lookup(N('Filter'));
	const single = filter instanceof PDFArray ? (filter.size() === 1 ? filter.lookup(0) : undefined) : filter;
	if (nameOf(single) !== 'DCTDecode') return null;

	if (d.has(N('SMask')) || d.has(N('Mask')) || d.has(N('Decode')) || d.has(N('DecodeParms'))) return null;
	const mask = d.lookup(N('ImageMask'));
	if (mask instanceof PDFBool && mask.asBoolean()) return null;
	const bpc = d.lookup(N('BitsPerComponent'));
	if (bpc instanceof PDFNumber && bpc.asNumber() !== 8) return null;

	const cs = d.lookup(N('ColorSpace'));
	let components = 0;
	const csName = nameOf(cs);
	if (csName === 'DeviceRGB') components = 3;
	else if (csName === 'DeviceGray') components = 1;
	else if (cs instanceof PDFArray && nameOf(cs.lookup(0)) === 'ICCBased') {
		const profile = cs.lookup(1);
		const n = profile instanceof PDFRawStream ? profile.dict.lookup(N('N')) : undefined;
		components = n instanceof PDFNumber ? n.asNumber() : 0;
	}
	if (components !== 1 && components !== 3) return null; // CMYK and special colour spaces are skipped

	const w = d.lookup(N('Width'));
	const h = d.lookup(N('Height'));
	if (!(w instanceof PDFNumber) || !(h instanceof PDFNumber)) return null;
	return { width: w.asNumber(), height: h.asNumber() };
}

export async function shrinkImages(
	bytes: Uint8Array,
	level: { cap: number; quality: number },
	ctl: Control,
): Promise<{ bytes: Uint8Array; found: number; changed: number }> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const ctx = doc.context;

	const candidates: { ref: ReturnType<typeof ctx.enumerateIndirectObjects>[number][0]; stream: PDFRawStream; width: number; height: number }[] = [];
	for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
		if (!(obj instanceof PDFRawStream)) continue;
		const info = plainJpegInfo(obj);
		if (info && obj.getContents().length >= MIN_IMAGE_BYTES) candidates.push({ ref, stream: obj, ...info });
	}

	let changed = 0;
	for (let i = 0; i < candidates.length; i++) {
		if (ctl.isCancelled()) throw new Cancelled();
		ctl.onProgress({ done: i, total: candidates.length, label: `Shrinking picture ${i + 1} of ${candidates.length}…` });
		const { ref, stream, width, height } = candidates[i];
		const original = stream.getContents();

		let bitmap: ImageBitmap;
		try {
			// "none": a PDF viewer ignores the photo's rotation tag, so we must too
			bitmap = await createImageBitmap(new Blob([original as BlobPart], { type: 'image/jpeg' }), { imageOrientation: 'none' });
		} catch {
			continue; // a picture this browser cannot read stays as it was
		}
		const k = Math.min(1, level.cap / Math.max(bitmap.width, bitmap.height));
		const w = Math.max(1, Math.round(bitmap.width * k));
		const h = Math.max(1, Math.round(bitmap.height * k));
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const c = canvas.getContext('2d');
		if (!c) {
			bitmap.close();
			continue;
		}
		c.fillStyle = '#ffffff';
		c.fillRect(0, 0, w, h);
		c.imageSmoothingQuality = 'high';
		c.drawImage(bitmap, 0, 0, w, h);
		bitmap.close();
		const blob = await toJpeg(canvas, level.quality);
		canvas.width = canvas.height = 0;
		if (!blob || blob.size >= original.length * 0.9) continue; // keep the original unless we save at least 10%

		const next = new Uint8Array(await blob.arrayBuffer());
		const dict: PDFDict = ctx.obj({
			Type: 'XObject',
			Subtype: 'Image',
			Width: w,
			Height: h,
			ColorSpace: 'DeviceRGB',
			BitsPerComponent: 8,
			Filter: 'DCTDecode',
		});
		ctx.assign(ref, PDFRawStream.of(dict, next));
		changed++;
		void width;
		void height;
	}

	ctl.onProgress({ done: candidates.length, total: candidates.length, label: 'Saving…' });
	const out = await doc.save({ useObjectStreams: true });
	return { bytes: out, found: candidates.length, changed };
}

export { PdfPasswordError };

export async function rasterize(bytes: Uint8Array, level: { dpi: number; quality: number }, ctl: Control): Promise<Uint8Array> {
	const { pdf, task } = await openPdf(bytes);

	try {
		if (pdf.numPages > MAX_RASTER_PAGES) throw new Error(`Maximum compression works up to ${MAX_RASTER_PAGES} pages.`);
		const out = await PDFDocument.create();
		for (let i = 1; i <= pdf.numPages; i++) {
			if (ctl.isCancelled()) throw new Cancelled();
			ctl.onProgress({ done: i - 1, total: pdf.numPages, label: `Page ${i} of ${pdf.numPages}…` });
			const page = await pdf.getPage(i);
			const base = page.getViewport({ scale: 1 }); // page size in PDF points (1/72 inch)

			let scale = level.dpi / 72;
			const pixels = base.width * scale * (base.height * scale);
			if (pixels > MAX_RENDER_PIXELS) scale *= Math.sqrt(MAX_RENDER_PIXELS / pixels);
			const viewport = page.getViewport({ scale });

			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.ceil(viewport.width));
			canvas.height = Math.max(1, Math.ceil(viewport.height));
			const c = canvas.getContext('2d')!;
			await page.render({ canvas, canvasContext: c, viewport, background: '#ffffff' }).promise;
			const blob = await toJpeg(canvas, level.quality);
			canvas.width = canvas.height = 0;
			page.cleanup();
			if (!blob) throw new Error('A page could not be turned into a picture. Try a smaller PDF.');

			const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
			out.addPage([base.width, base.height]).drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
		}
		ctl.onProgress({ done: pdf.numPages, total: pdf.numPages, label: 'Saving…' });
		return await out.save({ useObjectStreams: true });
	} finally {
		await task.destroy();
	}
}
