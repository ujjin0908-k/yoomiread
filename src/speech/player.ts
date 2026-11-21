import { db } from '../db';
import { chunkAt, speechChunks, type SpeechChunk } from './chunks';
import { loadVoice, speak } from './engine';

/**
 * Read aloud: one player for the whole app, so it keeps going while pages change (the next chapter starts by itself).
 * Pieces of the chapter are spoken by Kokoro in its worker, a few ahead of the one playing, and played one after the
 * other through a single <audio> element (it keeps playing with the phone's controls and, often, with the screen locked).
 */

export interface ReadAloudSettings {
  voice: string;
  speed: number;
  /** Go on to the next chapter at the end of one. */
  autoNext: boolean;
  /** Use the graphics chip (WebGPU): faster where it works, but a bigger download (about 330 MB) and more memory. */
  gpu?: boolean;
}

export const DEFAULT_READ_ALOUD: ReadAloudSettings = { voice: 'am_michael', speed: 1, autoNext: true };

export async function loadReadAloud(): Promise<ReadAloudSettings> {
  const saved = (await db.settings.get('readAloud'))?.value as Partial<ReadAloudSettings> | undefined;
  return { ...DEFAULT_READ_ALOUD, ...(saved ?? {}) };
}

export async function saveReadAloud(change: Partial<ReadAloudSettings>): Promise<ReadAloudSettings> {
  const next = { ...(await loadReadAloud()), ...change };
  await db.settings.put({ key: 'readAloud', value: next });
  return next;
}

export type PlayerStatus = 'idle' | 'loading' | 'waiting' | 'playing' | 'paused' | 'ended';

export interface PlayerState {
  status: PlayerStatus;
  bookId?: string;
  chapterId?: string;
  title?: string;
  /** The piece being read (positions in the chapter text). */
  current?: { start: number; end: number };
  index: number;
  total: number;
  /** First time only: how much of the voice model has downloaded. */
  download?: { mb: number; fraction?: number };
  device?: 'webgpu' | 'wasm';
  /** True when the voice is slower than real time on this phone, so it pauses between pieces. */
  slow?: boolean;
  error?: string;
  /** The chapter the player wants to go on with (set at the end of a chapter when "next chapter" is on). */
  nextChapterId?: string;
}

/** Pieces made ahead of the one playing. More smooths over a slow phone; each one is a few hundred KB of audio. */
const AHEAD = 6;

let state: PlayerState = { status: 'idle', index: 0, total: 0 };
const listeners = new Set<() => void>();
let chunks: SpeechChunk[] = [];
let made = new Map<number, string>(); // piece index → object URL of its WAV
let run = 0; // bumped on every start/stop, so old work is dropped
let making = false;
let audio: HTMLAudioElement | undefined;
let settings: ReadAloudSettings = DEFAULT_READ_ALOUD;
let timing: number[] = []; // seconds of work per second of audio, for the last few pieces

function set(change: Partial<PlayerState>) {
  state = { ...state, ...change };
  for (const l of listeners) l();
}

export function playerState(): PlayerState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Float samples (−1 to 1) as a 16-bit mono WAV file. */
export function toWav(samples: Float32Array, rate: number): ArrayBuffer {
  const data = samples.length * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.onerror = () => {
      if (state.status === 'playing') set({ status: 'paused', error: 'The phone could not play the sound. Tap ▶ to try again.' });
    };
    audio.onended = () => {
      const mine = run;
      setTimeout(() => mine === run && advance(), 0);
    };
  }
  return audio;
}

function clearMade() {
  for (const url of made.values()) URL.revokeObjectURL(url);
  made = new Map();
}

/** Starts reading a chapter from `from` (a position in its text: where the reader is). Call it from a tap. */
export async function startReading(input: { bookId: string; chapterId: string; title: string; text: string; from?: number }): Promise<void> {
  // Unlock the audio element inside the tap, before anything waits (iPhone only allows sound started by a tap).
  asMedia();
  const el = element();
  el.src = silenceUrl();
  void el.play().catch(() => {});
  stopWork();
  const mine = run;
  settings = await loadReadAloud();
  chunks = speechChunks(input.text);
  if (!chunks.length) {
    set({ status: 'idle', error: 'This chapter has nothing to read aloud.' });
    return;
  }
  const index = chunkAt(chunks, input.from ?? 0);
  timing = [];
  set({
    status: 'loading',
    bookId: input.bookId,
    chapterId: input.chapterId,
    title: input.title,
    index,
    total: chunks.length,
    current: chunks[index],
    error: undefined,
    nextChapterId: undefined,
    slow: false,
  });
  setMediaSession(input.title);
  try {
    const device = await loadVoice(!!settings.gpu, (d) => mine === run && set({ download: d }));
    if (mine !== run) return;
    set({ device, download: undefined, status: 'waiting' });
  } catch (e) {
    if (mine === run) set({ status: 'idle', download: undefined, error: e instanceof Error ? e.message : 'The voice could not be loaded.' });
    return;
  }
  void make(mine);
  playCurrent();
}

/** Makes audio for the pieces ahead of the one playing, one at a time. */
async function make(mine: number) {
  if (making) return;
  making = true;
  try {
    for (;;) {
      if (mine !== run) return;
      let next = state.index;
      while (made.has(next)) next++;
      if (next >= chunks.length || next - state.index >= AHEAD) return;
      const t0 = performance.now();
      const { samples, rate } = await speak(chunks[next].text, settings.voice, settings.speed);
      if (mine !== run) return;
      const seconds = samples.length / rate;
      timing = [...timing.slice(-3), (performance.now() - t0) / 1000 / Math.max(0.3, seconds)];
      made.set(next, URL.createObjectURL(new Blob([toWav(samples, rate)], { type: 'audio/wav' })));
      const slow = timing.length >= 2 && timing.reduce((a, b) => a + b, 0) / timing.length > 1;
      if (slow !== state.slow) set({ slow });
      if (next === state.index && state.status === 'waiting') playCurrent();
    }
  } catch (e) {
    if (mine === run) set({ status: 'paused', error: e instanceof Error ? e.message : 'The voice stopped.' });
  } finally {
    making = false;
  }
}

function playCurrent() {
  const url = made.get(state.index);
  if (!url) {
    set({ status: 'waiting', current: chunks[state.index] });
    return;
  }
  const el = element();
  el.src = url;
  set({ status: 'playing', current: chunks[state.index] });
  void el.play().catch((e) =>
    set({
      status: 'paused',
      error: e instanceof Error && e.name === 'NotAllowedError' ? 'The phone held the sound back. Tap ▶ to start it.' : 'The sound did not start. Tap ▶ to try again.',
    }),
  );
  void make(run);
}

function advance() {
  const done = made.get(state.index);
  if (done) {
    URL.revokeObjectURL(done);
    made.delete(state.index);
  }
  if (state.index + 1 >= chunks.length) {
    set({ status: 'ended', current: undefined });
    return;
  }
  set({ index: state.index + 1 });
  playCurrent();
}

export function pause() {
  if (state.status !== 'playing' && state.status !== 'waiting') return;
  audio?.pause();
  set({ status: 'paused' });
}

export function resume() {
  if (state.status !== 'paused') return;
  asMedia();
  set({ error: undefined });
  if (made.has(state.index) && audio?.src && audio.currentTime > 0 && !audio.ended) {
    set({ status: 'playing' });
    void audio.play().catch(() => set({ status: 'paused' }));
  } else playCurrent();
}

/** One piece back or forward. */
export function skip(by: number) {
  if (!chunks.length) return;
  const index = Math.max(0, Math.min(chunks.length - 1, state.index + by));
  audio?.pause();
  set({ index });
  playCurrent();
}

function stopWork() {
  run++;
  audio?.pause();
  clearMade();
}

export function stop() {
  stopWork();
  chunks = [];
  set({ status: 'idle', current: undefined, index: 0, total: 0, chapterId: undefined, error: undefined, nextChapterId: undefined, download: undefined });
}

/** New voice or speed: what is already made is dropped and made again from the piece playing. */
export async function changeVoice(change: Partial<ReadAloudSettings>) {
  settings = await saveReadAloud(change);
  if (state.status === 'idle' || state.status === 'ended' || !chunks.length) return;
  const wasPaused = state.status === 'paused';
  stopWork();
  timing = [];
  void make(run);
  if (!wasPaused) playCurrent();
}

/** Stops with a message for the bar (e.g. the next chapter has no English to read). */
export function notice(error: string) {
  stopWork();
  chunks = [];
  set({ status: 'idle', current: undefined, index: 0, total: 0, nextChapterId: undefined, error });
}

/** The chapter ended and the reader moved on: the next chapter asks to be read from the start. */
export function wantNext(chapterId: string) {
  set({ nextChapterId: chapterId });
}

function setMediaSession(title: string) {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  if (!ms) return;
  try {
    ms.metadata = new MediaMetadata({ title, artist: 'YoomiRead' });
    ms.setActionHandler('play', () => resume());
    ms.setActionHandler('pause', () => pause());
    ms.setActionHandler('previoustrack', () => skip(-1));
    ms.setActionHandler('nexttrack', () => skip(1));
    ms.setActionHandler('stop', () => stop());
  } catch {
    // Older browsers: the reader's own buttons still work.
  }
}

/** A tiny silent WAV, played inside the first tap so the phone allows sound later. */
let silence: string | undefined;
/**
 * A short clip of silence (0.2 s), played inside the first tap so the phone allows sound later. It must have real
 * length: an empty clip can be refused, and then nothing after it plays.
 */
export function silenceUrl(): string {
  silence ??= URL.createObjectURL(new Blob([toWav(new Float32Array(4800), 24000)], { type: 'audio/wav' }));
  return silence;
}

/** Sound plays as media (like a podcast), so the silent switch does not mute it. iOS 17 and later. */
export function asMedia() {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch {
    // Not there on older phones.
  }
}
