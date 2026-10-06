// Gentle photo adjustments done on raw pixels (no libraries, nothing uploaded).

export interface Adjust {
	brightness: number; // -50 to 50
	contrast: number; // -50 to 50
	sharpness: number; // 0 to 100
}

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, sharpness: 0 };

export const isNeutral = (a: Adjust) => a.brightness === 0 && a.contrast === 0 && a.sharpness === 0;

export function adjustImage(img: ImageData, a: Adjust): void {
	const d = img.data;
	if (a.brightness !== 0 || a.contrast !== 0) {
		const gain = 1 + a.contrast / 100;
		const shift = a.brightness * 2.55;
		const lut = new Uint8ClampedArray(256); // clamps to 0..255 and rounds for us
		for (let i = 0; i < 256; i++) lut[i] = (i - 128) * gain + 128 + shift;
		for (let i = 0; i < d.length; i += 4) {
			d[i] = lut[d[i]];
			d[i + 1] = lut[d[i + 1]];
			d[i + 2] = lut[d[i + 2]];
		}
	}
	if (a.sharpness > 0) sharpen(img, a.sharpness / 100);
}

// Unsharp mask: add back some of the difference between each pixel and a 3x3 blur of it.
function sharpen(img: ImageData, amount: number): void {
	const { width: w, height: h, data: d } = img;
	const src = new Uint8ClampedArray(d);
	const k = amount * 1.5;
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				const p = i + c;
				const blur =
					(src[p - w * 4 - 4] + src[p - w * 4] + src[p - w * 4 + 4] + src[p - 4] + src[p] + src[p + 4] + src[p + w * 4 - 4] + src[p + w * 4] + src[p + w * 4 + 4]) / 9;
				d[p] = src[p] + k * (src[p] - blur);
			}
		}
	}
}

// A gentle starting point: looks at the middle of the photo (where the face usually is) and nudges
// brightness and contrast. Limits are deliberately small so darker skin tones are never washed out.
export function autoAdjust(img: ImageData): Adjust {
	const { width: w, height: h, data: d } = img;
	const hist = new Uint32Array(256);
	let n = 0;
	for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.7); y++) {
		for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x++) {
			const i = (y * w + x) * 4;
			hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
			n++;
		}
	}
	if (n === 0) return { ...NO_ADJUST };

	const percentile = (p: number) => {
		let acc = 0;
		for (let v = 0; v < 256; v++) {
			acc += hist[v];
			if (acc >= n * p) return v;
		}
		return 255;
	};
	const lo = percentile(0.02);
	const hi = percentile(0.98);
	if (hi - lo < 20) return { brightness: 0, contrast: 0, sharpness: 20 };

	const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
	const gain = clamp(190 / (hi - lo), 1, 1.3);
	const mid = ((lo + hi) / 2 - 128) * gain + 128;
	return {
		brightness: Math.round(clamp((118 - mid) / 2.55, -25, 25)),
		contrast: Math.round((gain - 1) * 100),
		sharpness: 20,
	};
}
