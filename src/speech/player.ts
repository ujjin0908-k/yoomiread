import { db } from '../db';
import { chunkAt, speechChunks, type SpeechChunk } from './chunks';
import { audioKey, silentUrl, chapterCost, chunkAtTime, partOfChunk, partsOf, savedParts, speakPart, timeOfChunk, type SpeechPart } from './eleven';

/**
 * Read aloud with the phone's own voices (the Web Speech API): free, instant, works offline. On iPhone, better voices
 * are downloaded in Settings → Accessibility → Read & Speak → Voices (the "Premium" and "Enhanced" ones), and then
 * show up here. One player for the whole app, so it keeps going while pages change (the next chapter starts by itself).
 */

export interface ReadAloudSettings {
  /** The phone's voice (its voiceURI); empty means the phone's best English voice. */
  voice: string;
  speed: number;
  /** Go on to the next chapter at the end of one. */
  autoNext: boolean;
  /** Who speaks: the phone's own voices (free), or ElevenLabs with the owner's key. */
  engine: 'phone' | 'eleven';
  /** ElevenLabs API key. Stays on this phone (settings are never in a backup). */
  elevenKey: string;
  elevenVoice: string;
  /** Ask before a chapter uses ElevenLabs credits (chapters already saved never ask). */
  askFirst: boolean;
}

export const DEFAULT_READ_ALOUD: ReadAloudSettings = {
  voice: '',
  speed: 1,
  autoNext: true,
  engine: 'phone',
  elevenKey: '',
  elevenVoice: 'QAmlwgbPtjxpk7u98Qs9',
  askFirst: true,
};

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

/** waiting: ElevenLabs is making the audio; asking: it would use credits, and waits for a tap. */
export type PlayerStatus = 'idle' | 'asking' | 'waiting' | 'playing' | 'paused' | 'ended';

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
  /** What reading this chapter with ElevenLabs would use, while asking. */
  ask?: string;
  /** The chapter the player wants to go on with (set at the end of a chapter when "next chapter" is on). */
  nextChapterId?: string;
}

let state: PlayerState = { status: 'idle', index: 0, total: 0 };
const listeners = new Set<() => void>();
let chunks: SpeechChunk[] = [];
let run = 0; // bumped whenever speech is cut off, so a cancelled piece does not move the player on
let settings: ReadAloudSettings = DEFAULT_READ_ALOUD;
// Known before the first tap, so the tap can start the right voice at once (iPhone wants sound started in a tap).
if (typeof window !== 'undefined') void loadReadAloud().then((s) => (settings = s)).catch(() => {});

const eleven = () => settings.engine === 'eleven';
let parts: SpeechPart[] = [];
let part = 0;
let audio: HTMLAudioElement | undefined;
let made = new Map<number, Promise<string>>(); // part → object URL of its audio
let chapterId = '';
/** The chapter audio loaded in the element: its events count, the unlocking silent clip's do not. */
let playingUrl = '';

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
  if (state.status === 'playing') pause();
  const s = synth();
  if (!s) return;
  if (state.status === 'playing') pause();
  s.cancel();
  s.speak(utterance(text, s.getVoices().find((x) => x.voiceURI === voiceURI), speed));
}

/** Starts reading a chapter from `from` (a position in its text: where the reader is). Call it from a tap. */
export async function startReading(input: { bookId: string; chapterId: string; title: string; text: string; from?: number }): Promise<void> {
  const s = synth();
  if (!s && !eleven()) {
    set({ status: 'idle', error: 'This browser cannot read aloud.' });
    return;
  }
  // Unlock sound for ElevenLabs inside the tap, before anything waits.
  if (eleven()) unlockAudio();
  cut();
  chunks = speechChunks(input.text);
  if (!chunks.length) {
    set({ status: 'idle', error: 'This chapter has nothing to read aloud.' });
    return;
  }
  const index = chunkAt(chunks, input.from ?? 0);
  set({ status: 'playing', bookId: input.bookId, chapterId: input.chapterId, title: input.title, index, total: chunks.length, current: chunks[index], error: undefined, ask: undefined, nextChapterId: undefined });
  setMediaSession(input.title);
  if (eleven()) {
    await startEleven(input.chapterId, index);
    return;
  }
  if (!s) return;
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
  audio?.pause();
}

// Pausing stops the sentence and starts it again on play: iPhone's own pause is unreliable.
export function pause() {
  if (state.status !== 'playing' && state.status !== 'waiting') return;
  if (eleven()) {
    run++;
    audio?.pause();
  } else cut();
  set({ status: 'paused' });
}

export function resume() {
  if (state.status !== 'paused') return;
  set({ status: 'playing', error: undefined });
  if (eleven()) {
    playFrom(state.index);
    return;
  }
  sayCurrent();
}

/** One piece back or forward. */
export function skip(by: number) {
  if (!chunks.length) return;
  const index = Math.max(0, Math.min(chunks.length - 1, state.index + by));
  cut();
  set({ index, current: chunks[index], status: 'playing', error: undefined });
  if (eleven()) playFrom(index);
  else sayCurrent();
}

export function stop() {
  cut();
  chunks = [];
  set({ status: 'idle', current: undefined, index: 0, total: 0, chapterId: undefined, error: undefined, nextChapterId: undefined });
}

/** New voice or speed: the sentence being read starts again with it. */
export async function changeVoice(change: Partial<ReadAloudSettings>) {
  const before = settings;
  settings = await saveReadAloud(change);
  const heard = before.engine !== settings.engine || before.speed !== settings.speed || before.voice !== settings.voice || before.elevenVoice !== settings.elevenVoice;
  if (!heard || state.status !== 'playing') return;
  cut();
  if (before.engine !== settings.engine && eleven()) {
    await startEleven(chapterId || state.chapterId || '', state.index);
    return;
  }
  if (eleven()) {
    clearMade();
    playFrom(state.index);
  } else sayCurrent();
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

// ---------- ElevenLabs ----------

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.ontimeupdate = () => {
      if (!eleven() || state.status !== 'playing' || !audio?.duration || audio.src !== playingUrl) return;
      const i = chunkAtTime(chunks, parts[part], audio.currentTime / audio.duration);
      if (i !== state.index) set({ index: i, current: chunks[i] });
    };
    audio.onended = () => {
      if (!eleven() || state.status !== 'playing' || audio?.src !== playingUrl) return;
      if (part + 1 >= parts.length) set({ status: 'ended', current: undefined });
      else playFrom(parts[part + 1].from);
    };
  }
  return audio;
}

/** A short silent clip played inside the tap, so the phone lets the audio play later. */
function unlockAudio() {
  try {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s) s.type = 'playback';
  } catch {
    // Older phones.
  }
  const el = element();
  el.src = silentUrl();
  void el.play().catch(() => {});
}

function clearMade() {
  for (const p of made.values()) void p.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  made = new Map();
}

const keyOf = (i: number) => audioKey(chapterId, settings.elevenVoice, settings.speed, parts[i].text);

/** The audio of a part: saved, or made now (once). */
function partAudio(i: number): Promise<string> {
  let p = made.get(i);
  if (!p) {
    p = speakPart({ key: settings.elevenKey, voiceId: settings.elevenVoice, speed: settings.speed, text: parts[i].text, cacheKey: keyOf(i) }).then((b) => URL.createObjectURL(b));
    p.catch(() => made.delete(i));
    made.set(i, p);
  }
  return p;
}

async function startEleven(id: string, index: number) {
  if (!settings.elevenKey.trim()) {
    notice('Add your ElevenLabs key first: tap here, then Voice → ElevenLabs.');
    return;
  }
  chapterId = id;
  clearMade();
  parts = partsOf(chunks);
  part = partOfChunk(parts, index);
  const mine = run;
  const left = parts.slice(part);
  const saved = await savedParts(left.map((_, k) => keyOf(part + k)));
  if (mine !== run) return;
  if (settings.askFirst && saved < left.length) {
    const cost = chapterCost(left.slice(saved));
    set({
      status: 'asking',
      ask: `ElevenLabs: about ${cost.chars.toLocaleString()} characters (${cost.credits.toLocaleString()} credits, about $${cost.dollars.toFixed(2)}). Saved after, so paid once.`,
    });
    return;
  }
  playFrom(index);
}

/** The owner said yes to using credits for this chapter. */
export function confirmSpend() {
  if (state.status !== 'asking') return;
  unlockAudio();
  set({ status: 'playing', ask: undefined });
  playFrom(state.index);
}

/** Plays from a sentence: the part it is in, from about where that sentence starts. The next part is made meanwhile. */
function playFrom(index: number) {
  const mine = ++run;
  const p = partOfChunk(parts, index);
  part = p;
  const el = element();
  el.pause();
  set({ status: 'waiting', index, current: chunks[index], error: undefined });
  partAudio(p)
    .then((url) => {
      if (mine !== run) return;
      playingUrl = url;
      el.src = url;
      const at = timeOfChunk(chunks, parts[p], index);
      const go = () => {
        if (mine !== run) return;
        if (at > 0 && el.duration) el.currentTime = at * el.duration;
        set({ status: 'playing' });
        void el.play().catch((e) => mine === run && set({ status: 'paused', error: e instanceof Error && e.name === 'NotAllowedError' ? 'Tap ▶ to start the sound.' : 'The sound did not start. Tap ▶.' }));
      };
      if (el.readyState >= 1) go();
      else el.addEventListener('loadedmetadata', go, { once: true });
      // The next part is made while this one plays, so there is no gap.
      if (p + 1 < parts.length) void partAudio(p + 1).catch(() => {});
    })
    .catch((e) => {
      if (mine === run) set({ status: 'paused', error: e instanceof Error ? e.message : 'ElevenLabs could not speak.' });
    });
}
