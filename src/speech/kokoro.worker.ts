/// <reference lib="webworker" />
// The Kokoro voice model, run off the main thread so the reader stays smooth while it speaks.
// The model and each voice are downloaded from Hugging Face the first time and then kept by the browser
// (transformers.js keeps them in its own cache), so later chapters need no internet.
import { KokoroTTS } from 'kokoro-js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

type In = { id: number; type: 'load'; gpu?: boolean } | { id: number; type: 'speak'; text: string; voice: string; speed: number };

let tts: Promise<KokoroTTS> | undefined;
let device: 'webgpu' | 'wasm' = 'wasm';

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

/** WebGPU (the graphics chip) when the browser has it: many times faster than the processor alone. */
async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function load(wantGpu = false): Promise<KokoroTTS> {
  tts ??= (wantGpu ? hasGpu() : Promise.resolve(false))
    .then((gpu) => {
      device = gpu ? 'webgpu' : 'wasm';
      return KokoroTTS.from_pretrained(MODEL, {
        // The full model on the graphics chip (it needs it to sound right); the small one (about 90 MB) on the processor.
        dtype: gpu ? 'fp32' : 'q8',
        device,
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === 'progress' && p.total) post({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
        },
      });
    })
    .catch((e) => {
      tts = undefined;
      throw e;
    });
  return tts;
}

self.onmessage = async (event: MessageEvent<In>) => {
  const m = event.data;
  try {
    if (m.type === 'load') {
      await load(m.gpu);
      post({ id: m.id, type: 'ready', device });
    } else {
      const model = await load();
      const audio = await model.generate(m.text, { voice: m.voice as never, speed: m.speed });
      const samples = audio.audio as Float32Array;
      post({ id: m.id, type: 'audio', samples, rate: audio.sampling_rate }, [samples.buffer]);
    }
  } catch (e) {
    post({ id: m.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
