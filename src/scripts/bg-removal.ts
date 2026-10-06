// Main-thread side of AI background removal: prepares the photo, talks to the worker,
// and returns a mask (a canvas whose alpha channel is "how much is the person").

const MODEL_URL = '/models/modnet-uint8.onnx';
const MODEL_BYTES = 6_632_188; // used for the progress bar (the file is served compressed)
const REF = 512; // the model works best when the short side is about 512 px

export interface Status {
	text: string;
	fraction?: number; // 0 to 1 while downloading
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Float32Array) => void; reject: (e: Error) => void }>();
let onStatus: ((s: Status) => void) | null = null;

export function isSupported(): boolean {
	return typeof WebAssembly === 'object' && typeof Worker === 'function';
}

function reset() {
	worker?.terminate();
	worker = null;
	ready = null;
	pending.forEach((p) => p.reject(new Error('The background tool stopped. Please try again.')));
	pending.clear();
}

function start(): Promise<void> {
	if (ready) return ready;
	worker = new Worker(new URL('./bg-worker.ts', import.meta.url), { type: 'module' });
	ready = new Promise<void>((resolve, reject) => {
		worker!.onmessage = (e: MessageEvent) => {
			const m = e.data;
			if (m.type === 'progress') onStatus?.({ text: 'Downloading the AI model (one time)…', fraction: m.fraction });
			else if (m.type === 'stage') onStatus?.({ text: 'Starting the AI engine…' });
			else if (m.type === 'ready') resolve();
			else if (m.type === 'result') {
				pending.get(m.id)?.resolve(m.matte);
				pending.delete(m.id);
			} else if (m.type === 'error') {
				if (m.id === undefined) {
					reject(new Error(m.message));
				} else {
					pending.get(m.id)?.reject(new Error(m.message));
					pending.delete(m.id);
				}
			}
		};
		worker!.onerror = () => reject(new Error('The background tool could not start in this browser.'));
		worker!.postMessage({ type: 'init', modelUrl: MODEL_URL, totalBytes: MODEL_BYTES });
	});
	ready.catch(reset); // a failed start can be retried from scratch
	return ready;
}

const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

export async function computeMask(source: HTMLCanvasElement, status: (s: Status) => void): Promise<HTMLCanvasElement> {
	onStatus = status;
	await start();

	// Size for the model: short side about 512 px, both sides a multiple of 32.
	const w = source.width;
	const h = source.height;
	let rw = w;
	let rh = h;
	if (Math.max(w, h) < REF || Math.min(w, h) > REF) {
		if (w >= h) {
			rh = REF;
			rw = Math.round((w / h) * REF);
		} else {
			rw = REF;
			rh = Math.round((h / w) * REF);
		}
	}
	rw = Math.max(32, rw - (rw % 32));
	rh = Math.max(32, rh - (rh % 32));

	const small = document.createElement('canvas');
	small.width = rw;
	small.height = rh;
	const sctx = small.getContext('2d')!;
	sctx.imageSmoothingQuality = 'high';
	sctx.drawImage(source, 0, 0, rw, rh);
	const px = sctx.getImageData(0, 0, rw, rh).data;

	const plane = rw * rh;
	const data = new Float32Array(3 * plane); // planar R, G, B scaled to -1..1
	for (let i = 0; i < plane; i++) {
		data[i] = (px[i * 4] - 127.5) / 127.5;
		data[plane + i] = (px[i * 4 + 1] - 127.5) / 127.5;
		data[2 * plane + i] = (px[i * 4 + 2] - 127.5) / 127.5;
	}

	status({ text: 'Removing the background…' });
	const id = nextId++;
	const matte = await new Promise<Float32Array>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		worker!.postMessage({ type: 'run', id, data, width: rw, height: rh }, [data.buffer]);
	});

	// Matte (0 = background, 1 = person) -> alpha, with edges tightened a little to cut halos.
	const maskSmall = document.createElement('canvas');
	maskSmall.width = rw;
	maskSmall.height = rh;
	const mctx = maskSmall.getContext('2d')!;
	const img = mctx.createImageData(rw, rh);
	for (let i = 0; i < plane; i++) {
		img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
		img.data[i * 4 + 3] = Math.round(smoothstep(0.12, 0.88, matte[i]) * 255);
	}
	mctx.putImageData(img, 0, 0);

	const mask = document.createElement('canvas');
	mask.width = w;
	mask.height = h;
	const ctx = mask.getContext('2d')!;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(maskSmall, 0, 0, w, h);
	return mask;
}
