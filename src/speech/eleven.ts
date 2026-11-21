import type { SpeechChunk } from './chunks';

/**
 * ElevenLabs voices, called straight from the phone (their API allows it), with the owner's own key. The key and the
 * audio stay on this phone. Flash, their cheaper model: half a credit per character.
 * Audio is kept in the browser's cache storage (`yoomiread-audio`), one file per part, so a chapter is paid for once.
 */

export const ELEVEN_MODEL = 'eleven_flash_v2_5';
/** Credits per character with Flash. */
export const CREDITS_PER_CHAR = 0.5;
/** Pay-as-you-go price for Flash, US dollars per 1,000 characters (elevenlabs.io/pricing/api, 2026-11-21). */
export const DOLLARS_PER_1K = 0.04;
/** Characters per request: long enough to sound natural, short enough to start playing soon. */
const PART = 1500;

export const AUDIO_CACHE = 'yoomiread-audio';

/** A run of sentences spoken in one request. */
export interface SpeechPart {
  /** Index of its first and one past its last sentence in the chapter's chunks. */
  from: number;
  to: number;
  text: string;
}

/** Groups a chapter's sentences into parts of up to `max` characters (a sentence is never split). */
export function partsOf(chunks: SpeechChunk[], max = PART): SpeechPart[] {
  const out: SpeechPart[] = [];
  let from = 0;
  let text = '';
  chunks.forEach((c, i) => {
    if (text && text.length + 1 + c.text.length > max) {
      out.push({ from, to: i, text });
      from = i;
      text = '';
    }
    text = text ? `${text} ${c.text}` : c.text;
  });
  if (text) out.push({ from, to: chunks.length, text });
  return out;
}

/** The part a sentence is in. */
export function partOfChunk(parts: SpeechPart[], chunk: number): number {
  const i = parts.findIndex((p) => chunk >= p.from && chunk < p.to);
  return i < 0 ? 0 : i;
}

/**
 * Which sentence of a part is being spoken, from how far the audio has played: sentences take time in proportion to
 * their length. Good enough to mark the right paragraph.
 */
export function chunkAtTime(chunks: SpeechChunk[], part: SpeechPart, fraction: number): number {
  const lengths = chunks.slice(part.from, part.to).map((c) => c.text.length + 1);
  const total = lengths.reduce((a, b) => a + b, 0);
  let at = fraction * total;
  for (let i = 0; i < lengths.length; i++) {
    if (at < lengths[i]) return part.from + i;
    at -= lengths[i];
  }
  return part.to - 1;
}

/** Where in a part's audio a sentence starts, 0 to 1. */
export function timeOfChunk(chunks: SpeechChunk[], part: SpeechPart, chunk: number): number {
  const lengths = chunks.slice(part.from, part.to).map((c) => c.text.length + 1);
  const total = lengths.reduce((a, b) => a + b, 0);
  const before = lengths.slice(0, Math.max(0, chunk - part.from)).reduce((a, b) => a + b, 0);
  return total ? before / total : 0;
}

/** Characters a chapter costs, and its credits and dollars with Flash. */
export function chapterCost(parts: SpeechPart[]): { chars: number; credits: number; dollars: number } {
  const chars = parts.reduce((s, p) => s + p.text.length, 0);
  return { chars, credits: Math.round(chars * CREDITS_PER_CHAR), dollars: (chars / 1000) * DOLLARS_PER_1K };
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** The cache address of a part's audio: changes when the text, the voice or the speed changes. */
export function audioKey(chapterId: string, voiceId: string, speed: number, text: string): string {
  return `${location.origin}/__audio/${chapterId}/${voiceId}/${speed}/${hash(text)}.mp3`;
}

async function cache(): Promise<Cache | undefined> {
  try {
    return await caches.open(AUDIO_CACHE);
  } catch {
    return undefined;
  }
}

/** Saved audio for a part, if any. */
export async function savedAudio(key: string): Promise<Blob | undefined> {
  const hit = await (await cache())?.match(key);
  return hit ? hit.blob() : undefined;
}

/** How many of a chapter's parts are saved already (they cost nothing). */
export async function savedParts(keys: string[]): Promise<number> {
  const c = await cache();
  if (!c) return 0;
  let n = 0;
  for (const k of keys) if (await c.match(k)) n++;
  return n;
}

export class ElevenError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Plain words for what ElevenLabs answered. */
function explain(status: number, body: string): string {
  if (status === 401) return 'ElevenLabs did not accept the key. Check it in the Voice settings.';
  if (/quota|credits|character_limit|exceeds/i.test(body)) return 'Out of ElevenLabs credits for this month.';
  if (status === 404 || /voice.*not.*found/i.test(body)) return 'ElevenLabs does not know that voice ID.';
  if (status === 429) return 'ElevenLabs is busy (too many requests). Try again in a moment.';
  if (/detected_unusual_activity|free.*tier/i.test(body)) return 'ElevenLabs blocked this free account from the app. A paid plan works.';
  return `ElevenLabs said no (${status}).`;
}

/** Speaks a part with ElevenLabs and saves the audio. Uses the saved copy when there is one. */
export async function speakPart(input: { key: string; voiceId: string; speed: number; text: string; cacheKey: string; signal?: AbortSignal }): Promise<Blob> {
  const saved = await savedAudio(input.cacheKey);
  if (saved) return saved;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': input.key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: input.text, model_id: ELEVEN_MODEL, voice_settings: { speed: Math.max(0.7, Math.min(1.2, input.speed)) } }),
    signal: input.signal,
  });
  if (!res.ok) throw new ElevenError(explain(res.status, await res.text().catch(() => '')), res.status);
  const blob = await res.blob();
  await (await cache())?.put(input.cacheKey, new Response(blob, { headers: { 'content-type': 'audio/mpeg' } }));
  return blob;
}

/** Credits used and left this month, from the owner's ElevenLabs account. */
export async function elevenCredits(key: string): Promise<{ used: number; limit: number }> {
  const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new ElevenError(explain(res.status, await res.text().catch(() => '')), res.status);
  const j = (await res.json()) as { character_count?: number; character_limit?: number };
  return { used: j.character_count ?? 0, limit: j.character_limit ?? 0 };
}

/** Deletes all saved ElevenLabs audio (to free space on the phone). Returns how many files went. */
export async function clearSavedAudio(): Promise<number> {
  const c = await cache();
  if (!c) return 0;
  const keys = await c.keys();
  await Promise.all(keys.map((k) => c.delete(k)));
  return keys.length;
}

let silence: string | undefined;
/**
 * A 0.2 s silent clip, played inside a tap so the phone lets audio play afterwards. It must have real length: an
 * empty clip can be refused, and then nothing after it plays.
 */
export function silentUrl(): string {
  if (silence) return silence;
  const n = 4800;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (at: number, t: string) => [...t].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  silence = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silence;
}
