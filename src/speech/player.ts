import { db } from '../db';
import { chunkAt, speechChunks, type SpeechChunk } from './chunks';

/**
 * Read aloud with the phone's own voices (the Web Speech API): free, instant, works offline. On iPhone, better voices
 * are downloaded in Settings → Accessibility → Read & Speak → Voices (the "Premium" and "Enhanced" ones), and then
 * show up here. One player for the whole app, so it keeps going while pages change (the next chapter starts by itself).
 */

export interface ReadAloudSettings {
  /** The voice's id (its voiceURI); empty means the phone's best English voice. */
  voice: string;
  speed: number;
  /** Go on to the next chapter at the end of one. */
  autoNext: boolean;
}

export const DEFAULT_READ_ALOUD: ReadAloudSettings = { voice: '', speed: 1, autoNext: true };

export async function loadReadAloud(): Promise<ReadAloudSettings> {
  const saved = (await db.settings.get('readAloud'))?.value as Partial<ReadAloudSettings> | undefined;
  const merged = { ...DEFAULT_READ_ALOUD, ...(saved ?? {}) };
  // A voice id from the old Kokoro voices ("am_michael") is not a phone voice.
  if (/^[ab][fm]_/.test(merged.voice)) merged.voice = '';
  return merged;
}

export async function saveReadAloud(change: Partial<ReadAloudSettings>): Promise<ReadAloudSettings> {
  const next = { ...(await loadReadAloud()), ...change };
  await db.settings.put({ key: 'readAloud', value: next });
  return next;
}

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'ended';

export interface PlayerState {
  status: PlayerStatus;
  bookId?: string;
  chapterId?: string;
  title?: string;
  /** The piece being read (positions in the chapter text). */
  current?: { start: number; end: number };
  index: number;
  total: number;
  error?: string;
  /** The chapter the player wants to go on with (set at the end of a chapter when "next chapter" is on). */
  nextChapterId?: string;
}

let state: PlayerState = { status: 'idle', index: 0, total: 0 };
const listeners = new Set<() => void>();
let chunks: SpeechChunk[] = [];
let run = 0; // bumped whenever speech is cut off, so a cancelled piece does not move the player on
let settings: ReadAloudSettings = DEFAULT_READ_ALOUD;

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

const synth = (): SpeechSynthesis | undefined => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);

/**
 * Apple's novelty voices (they sing, bubble or warble) and the old robotic ones. They are English voices too, so
 * without this list one of them could end up as the default.
 */
const NOVELTY = new Set(
  [
    'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged', 'Good News', 'Hysterical', 'Jester', 'Junior',
    'Kathy', 'Organ', 'Pipe Organ', 'Princess', 'Ralph', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Fred',
    'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley',
  ].map((n) => n.toLowerCase()),
);

/** True for a voice that is not meant for reading (novelty or robotic). */
export function isNovelty(v: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>): boolean {
  const base = v.name.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
  return NOVELTY.has(base) || /speech\.synthesis\.voice\.|eloquence/i.test(v.voiceURI);
}

/**
 * Quality: the downloaded Premium and Enhanced voices sound far better. iPhone does not always say so in the name,
 * so the voice's id is read too ("com.apple.voice.premium.en-US.Ava").
 */
export function voiceRank(v: Pick<SpeechSynthesisVoice, 'name'> & Partial<Pick<SpeechSynthesisVoice, 'voiceURI'>>): number {
  const both = `${v.name} ${v.voiceURI ?? ''}`;
  if (/premium/i.test(both)) return 0;
  if (/enhanced|neural|natural/i.test(both)) return 1;
  return 2;
}

/** The phone's English reading voices, best first: Premium, Enhanced, then Samantha (iPhone's usual voice), then by name. */
export function englishVoices<V extends Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI'>>(all: V[]): V[] {
  const seen = new Set<string>();
  const usual = (v: V) => (/^samantha\b/i.test(v.name) ? 0 : 1);
  return all
    .filter((v) => /^en([-_]|$)/i.test(v.lang) && !isNovelty(v))
    .filter((v) => (seen.has(v.voiceURI) ? false : (seen.add(v.voiceURI), true)))
    .sort((a, b) => voiceRank(a) - voiceRank(b) || usual(a) - usual(b) || a.name.localeCompare(b.name));
}

/** The phone's voices; on iPhone they arrive a moment after the page opens. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(s.getVoices());
    s.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const saved = voices.find((v) => v.voiceURI === settings.voice);
  return saved && !isNovelty(saved) ? saved : englishVoices(voices)[0];
}

function utterance(text: string, voice: SpeechSynthesisVoice | undefined, speed: number): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else u.lang = 'en-US';
  u.rate = speed;
  return u;
}

/** Says one line with a voice (for trying voices out). Call it from a tap. */
export function sayOnce(text: string, voiceURI: string, speed: number) {
  const s = synth();
  if (!s) return;
  if (state.status === 'playing') pause();
  s.cancel();
  s.speak(utterance(text, s.getVoices().find((x) => x.voiceURI === voiceURI), speed));
}

/** Starts reading a chapter from `from` (a position in its text: where the reader is). Call it from a tap. */
export async function startReading(input: { bookId: string; chapterId: string; title: string; text: string; from?: number }): Promise<void> {
  const s = synth();
  if (!s) {
    set({ status: 'idle', error: 'This browser cannot read aloud.' });
    return;
  }
  cut();
  chunks = speechChunks(input.text);
  if (!chunks.length) {
    set({ status: 'idle', error: 'This chapter has nothing to read aloud.' });
    return;
  }
  const index = chunkAt(chunks, input.from ?? 0);
  set({ status: 'playing', bookId: input.bookId, chapterId: input.chapterId, title: input.title, index, total: chunks.length, current: chunks[index], error: undefined, nextChapterId: undefined });
  setMediaSession(input.title);
  // iPhone only speaks when speech starts in a tap: the first piece starts now, before anything waits.
  sayCurrent();
  const before = settings;
  settings = await loadReadAloud();
  // The saved voice or speed was not known yet: the sentence starts again with them.
  if (state.status === 'playing' && (before.voice !== settings.voice || before.speed !== settings.speed || !s.getVoices().length)) {
    await loadVoices();
    if (state.status !== 'playing') return;
    cut();
    sayCurrent();
  }
}

function sayCurrent() {
  const s = synth();
  const piece = chunks[state.index];
  if (!s || !piece) return;
  const mine = ++run;
  const u = utterance(piece.text, pickVoice(s.getVoices()), settings.speed);
  u.onend = () => {
    if (mine !== run || state.status !== 'playing') return;
    if (state.index + 1 >= chunks.length) {
      set({ status: 'ended', current: undefined });
      return;
    }
    set({ index: state.index + 1, current: chunks[state.index + 1] });
    sayCurrent();
  };
  u.onerror = (e) => {
    if (mine !== run || e.error === 'interrupted' || e.error === 'canceled') return;
    set({ status: 'paused', error: 'The voice stopped. Tap ▶ to go on.' });
  };
  set({ current: piece });
  s.speak(u);
}

/** Stops the voice without moving on (the caller chooses what comes next). */
function cut() {
  run++;
  synth()?.cancel();
}

// Pausing stops the sentence and starts it again on play: iPhone's own pause is unreliable.
export function pause() {
  if (state.status !== 'playing') return;
  cut();
  set({ status: 'paused' });
}

export function resume() {
  if (state.status !== 'paused') return;
  set({ status: 'playing', error: undefined });
  sayCurrent();
}

/** One piece back or forward. */
export function skip(by: number) {
  if (!chunks.length) return;
  const index = Math.max(0, Math.min(chunks.length - 1, state.index + by));
  cut();
  set({ index, current: chunks[index], status: 'playing', error: undefined });
  sayCurrent();
}

export function stop() {
  cut();
  chunks = [];
  set({ status: 'idle', current: undefined, index: 0, total: 0, chapterId: undefined, error: undefined, nextChapterId: undefined });
}

/** New voice or speed: the sentence being read starts again with it. */
export async function changeVoice(change: Partial<ReadAloudSettings>) {
  settings = await saveReadAloud(change);
  if (state.status !== 'playing') return;
  cut();
  sayCurrent();
}

/** Stops with a message for the bar (e.g. the next chapter has no English to read). */
export function notice(error: string) {
  cut();
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
