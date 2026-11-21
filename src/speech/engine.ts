/**
 * Talks to the Kokoro voice model in its worker (src/speech/kokoro.worker.ts). One worker for the whole app, started
 * the first time something is read aloud, so the voice code (and its download) never weighs on anything else.
 */

export interface Spoken {
  samples: Float32Array;
  rate: number;
}

/** Download progress of the voice model, 0 to 1, while it is being fetched the first time. */
export type ProgressListener = (fraction: number) => void;

let worker: Worker | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const progress = new Set<ProgressListener>();
const files = new Map<string, { loaded: number; total: number }>();

function start(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const m = event.data as { id?: number; type: string; message?: string; file?: string; loaded?: number; total?: number; samples?: Float32Array; rate?: number };
    if (m.type === 'progress' && m.file && m.total) {
      files.set(m.file, { loaded: m.loaded ?? 0, total: m.total });
      const all = [...files.values()];
      const fraction = all.reduce((s, f) => s + f.loaded, 0) / all.reduce((s, f) => s + f.total, 0);
      for (const l of progress) l(Math.min(1, fraction));
      return;
    }
    const job = m.id !== undefined ? waiting.get(m.id) : undefined;
    if (!job) return;
    waiting.delete(m.id!);
    if (m.type === 'error') job.reject(new Error(m.message || 'The voice could not speak.'));
    else if (m.type === 'audio') job.resolve({ samples: m.samples!, rate: m.rate! });
    else job.resolve((m as { device?: string }).device);
  };
  worker.onerror = (e) => {
    for (const job of waiting.values()) job.reject(new Error(e.message || 'The voice stopped working.'));
    waiting.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

function ask<T>(msg: Record<string, unknown>): Promise<T> {
  const w = start();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ ...msg, id });
  });
}

/** Gets the voice model ready (downloads it the first time). */
export function loadVoice(onProgress?: ProgressListener): Promise<'webgpu' | 'wasm'> {
  if (onProgress) progress.add(onProgress);
  return ask<'webgpu' | 'wasm'>({ type: 'load' }).finally(() => onProgress && progress.delete(onProgress));
}

/** Speaks a short piece of text into audio samples. */
export function speak(text: string, voice: string, speed: number): Promise<Spoken> {
  return ask<Spoken>({ type: 'speak', text, voice, speed });
}
