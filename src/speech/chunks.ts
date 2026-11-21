import { paragraphs } from '../logic';

/** One piece of a chapter read aloud: a sentence or a few short ones, never across a paragraph. */
export interface SpeechChunk {
  /** Position in the chapter text, so the reader can show where it is. */
  start: number;
  end: number;
  text: string;
}

/** Pieces up to this many characters: short enough for the voice model, long enough to sound natural. */
const MAX = 260;

/**
 * Cuts a chapter into pieces to read aloud, in order. Sentences are kept whole; short ones are joined up to `max`, a
 * very long one is cut at a comma or a space. Pieces with nothing to say ("？", "......") are left out, and the
 * 【】 brackets around names are read as nothing.
 */
export function speechChunks(text: string, max = MAX): SpeechChunk[] {
  const out: SpeechChunk[] = [];
  for (const p of paragraphs(text)) {
    const sentences: { start: number; end: number }[] = [];
    const re = /[^.!?。！？…]+(?:[.!?。！？…]+["”'’)\]]*|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p.text))) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      sentences.push({ start: m.index, end: m.index + m[0].length });
    }
    let cur: { start: number; end: number } | undefined;
    const flush = () => {
      if (!cur) return;
      pushPiece(out, p.text, p.start, cur.start, cur.end, max);
      cur = undefined;
    };
    for (const s of sentences) {
      if (cur && s.end - cur.start > max) flush();
      cur = cur ? { start: cur.start, end: s.end } : { ...s };
    }
    flush();
  }
  return out;
}

function pushPiece(out: SpeechChunk[], para: string, base: number, start: number, end: number, max: number) {
  while (end - start > max) {
    const slice = para.slice(start, start + max);
    const cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(' — '));
    const at = cut > max / 3 ? cut + 1 : Math.max(slice.lastIndexOf(' '), max / 2);
    addChunk(out, para, base, start, start + at);
    start += at;
  }
  addChunk(out, para, base, start, end);
}

function addChunk(out: SpeechChunk[], para: string, base: number, start: number, end: number) {
  const raw = para.slice(start, end);
  const text = sayable(raw);
  if (!/[\p{L}\p{N}]/u.test(text)) return;
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  out.push({ start: base + start + lead, end: base + end - trail, text });
}

/** What the voice should say for a piece of text: brackets around names dropped, runs of dots made into one pause. */
export function sayable(text: string): string {
  return text
    .replace(/[【】[\]]/g, '')
    .replace(/(\.\s*){3,}|…+/g, '… ')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The piece to start from: the first one that ends after `offset` (where the reader is). */
export function chunkAt(chunks: SpeechChunk[], offset: number): number {
  const i = chunks.findIndex((c) => c.end > offset);
  return i < 0 ? 0 : i;
}
