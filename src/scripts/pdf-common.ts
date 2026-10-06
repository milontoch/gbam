// Shared PDF checks used by merge, split and compress.

export const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB per file

// A real PDF starts with "%PDF-" near the beginning. This catches renamed files
// without trusting the file extension or the browser-reported type.
export async function looksLikePdf(file: File): Promise<boolean> {
	const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
	const text = new TextDecoder('latin1').decode(head);
	return text.includes('%PDF-');
}

export async function checkPdfFile(file: File): Promise<string | null> {
	if (file.size === 0) return 'This file is empty.';
	if (file.size > MAX_PDF_BYTES) return 'This file is larger than 100 MB.';
	if (!(await looksLikePdf(file))) return 'This does not look like a PDF file.';
	return null;
}

// pdf-lib throws a long technical message for locked files; turn it into plain English.
export function friendlyPdfError(err: unknown): string {
	const msg = err instanceof Error ? err.message : '';
	if (/encrypt/i.test(msg)) return 'This PDF is password-protected. Remove the password first, then try again.';
	return 'This PDF could not be read. It may be damaged.';
}
