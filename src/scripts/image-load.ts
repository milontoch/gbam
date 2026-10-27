// One place that decides whether a chosen file can be used as an image.
// Instead of checking against a short list of types, we let the browser try to open it,
// so JPG, PNG, WebP, GIF, BMP and AVIF all work wherever the browser supports them.

export const IMAGE_ACCEPT = 'image/*,.heic,.heif';
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

const isHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
const isSvg = (f: File) => f.type === 'image/svg+xml' || /\.svgz?$/i.test(f.name);

const HEIC_HELP =
	'This browser cannot open HEIC photos (the iPhone format). Safari can. Or on the iPhone, go to Settings, Camera, Formats and choose Most Compatible, or share the photo as JPG.';

// Quick checks that need no decoding. Returns a plain-English problem, or null when the file looks usable.
export function precheckImage(file: File): string | null {
	if (file.size === 0) return 'This file is empty.';
	if (file.size > MAX_IMAGE_BYTES) return 'This file is larger than 40 MB.';
	if (isSvg(file)) return 'SVG files are not supported. Use a photo such as JPG or PNG.';
	// Some systems report no type at all (blank), so only reject types that are clearly not images.
	if (file.type && !file.type.startsWith('image/') && !isHeic(file)) return 'This is not an image file.';
	return null;
}

export async function decodeImage(file: File, maxPixels: number): Promise<ImageBitmap> {
	const problem = precheckImage(file);
	if (problem) throw new Error(problem);

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		if (isHeic(file)) throw new Error(HEIC_HELP);
		throw new Error(
			'This image could not be opened. It may be damaged, or your browser may not support this format. JPG, PNG and WebP always work.',
		);
	}
	if (bitmap.width * bitmap.height > maxPixels) {
		bitmap.close();
		throw new Error('This image is too large for a phone or browser to handle safely.');
	}
	return bitmap;
}
