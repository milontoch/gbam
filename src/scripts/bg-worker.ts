// Runs the AI model in a background thread so the page never freezes.
// Engine: ONNX Runtime Web (MIT). Model: MODNet portrait matting (Apache-2.0).
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

type InMessage =
	| { type: 'init'; modelUrl: string; totalBytes: number }
	| { type: 'run'; id: number; data: Float32Array; width: number; height: number };

const ctx = self as unknown as {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	onmessage: ((e: MessageEvent<InMessage>) => void) | null;
};

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1; // more threads need special server headers that would break ads later

let session: ort.InferenceSession | null = null;

async function download(url: string, total: number): Promise<Uint8Array> {
	const res = await fetch(url);
	if (!res.ok || !res.body) throw new Error('The model could not be downloaded.');
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.length;
		ctx.postMessage({ type: 'progress', fraction: Math.min(1, loaded / total) });
	}
	const all = new Uint8Array(loaded);
	let offset = 0;
	for (const c of chunks) {
		all.set(c, offset);
		offset += c.length;
	}
	return all;
}

ctx.onmessage = async (e) => {
	const m = e.data;
	try {
		if (m.type === 'init') {
			if (!session) {
				const bytes = await download(m.modelUrl, m.totalBytes);
				ctx.postMessage({ type: 'stage', stage: 'engine' });
				session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
			}
			ctx.postMessage({ type: 'ready' });
		} else if (m.type === 'run') {
			if (!session) throw new Error('The model is not ready.');
			const input = new ort.Tensor('float32', m.data, [1, 3, m.height, m.width]);
			const out = await session.run({ [session.inputNames[0]]: input });
			const matte = new Float32Array(out[session.outputNames[0]].data as Float32Array); // copy out of engine memory
			ctx.postMessage({ type: 'result', id: m.id, matte }, [matte.buffer]);
		}
	} catch (err) {
		ctx.postMessage({ type: 'error', id: m.type === 'run' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
	}
};
