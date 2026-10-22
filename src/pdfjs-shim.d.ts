// pdf.js ships the same code as a readable file and a minified one; only the readable one comes with types.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
	export * from 'pdfjs-dist/legacy/build/pdf.mjs';
}
