// The one place that knows how to start the pdf.js engine on this site.
// Used by "Compress PDF" (maximum mode) and "Rotate PDF Pages". The engine is large, so it is only fetched when needed.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Where pdf.js finds its decoders, fonts and character maps. They are copied into /pdfjs at build time (scripts/copy-pdfjs-assets.mjs).
export const PDFJS_OPTIONS = {
	wasmUrl: '/pdfjs/wasm/',
	cMapUrl: '/pdfjs/cmaps/',
	cMapPacked: true,
	standardFontDataUrl: '/pdfjs/standard_fonts/',
	iccUrl: '/pdfjs/iccs/',
} as const;

export class PdfPasswordError extends Error {}

export async function getPdfJs() {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
	return pdfjs;
}

// Opens a PDF. pdf.js takes ownership of the bytes it is given, so it gets a copy.
export async function openPdf(bytes: Uint8Array) {
	const pdfjs = await getPdfJs();
	const task = pdfjs.getDocument({ data: bytes.slice(), ...PDFJS_OPTIONS });
	try {
		const pdf = await task.promise;
		return { pdf, task };
	} catch (err) {
		await task.destroy().catch(() => {});
		if (err instanceof Error && err.name === 'PasswordException') throw new PdfPasswordError('password');
		throw err;
	}
}
