// Page layout for the Images to PDF tool. No browser code here, so it can be tested directly.
// PDF sizes are in points (1/72 inch). The origin of a PDF page is its bottom-left corner.

export type PageSize = 'a4' | 'letter' | 'fit';
export type Orientation = 'auto' | 'portrait' | 'landscape';

const SIZES: Record<'a4' | 'letter', [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };
export const FIT_LONG_SIDE = 842; // for "fit to picture", the longer side of the page is about A4's long side

export const MARGINS = { none: 0, small: 18, normal: 36 } as const; // 0, a quarter inch, half an inch

export interface Placement {
	pageW: number;
	pageH: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

export function layoutPage(imageW: number, imageH: number, size: PageSize, orientation: Orientation, margin: number): Placement {
	if (size === 'fit') {
		const k = FIT_LONG_SIDE / Math.max(imageW, imageH);
		const w = imageW * k;
		const h = imageH * k;
		return { pageW: w, pageH: h, x: 0, y: 0, w, h };
	}
	let [pageW, pageH] = SIZES[size];
	const landscape = orientation === 'landscape' || (orientation === 'auto' && imageW > imageH);
	if (landscape) [pageW, pageH] = [pageH, pageW];
	const k = Math.min((pageW - 2 * margin) / imageW, (pageH - 2 * margin) / imageH);
	const w = imageW * k;
	const h = imageH * k;
	return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

// How strongly pictures are shrunk before they go into the PDF.
export const QUALITY = {
	high: { cap: 3000, jpeg: 0.92 },
	balanced: { cap: 2000, jpeg: 0.8 },
	small: { cap: 1400, jpeg: 0.65 },
} as const;
