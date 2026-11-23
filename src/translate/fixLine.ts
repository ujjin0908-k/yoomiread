import { AI_OFF_FOR_FAN_WORK, aiAllowedFor } from '../import/ao3Book';
import { LANGUAGES, sourceOf, targetOf, TARGETS, type LanguageInfo, type TargetInfo } from '../languages';
import { db } from '../db';
import { newId, paragraphs } from '../logic';
import type { GlossaryEntry, GlossaryKind } from '../types';
import type { ChatMessage } from './prompt';
import { chat } from './api';
import { addSpend, callCost, loadSettings, modelFor } from './run';

/**
 * "Check the original" in the reader: an odd word in the English ("Granny's—") is selected, and this finds the
 * Chinese it came from, asks what it really means, and fixes it now (in this chapter's translation) and for later
 * (as a glossary entry, which every later translation must follow).
 */

export interface ParagraphPair {
  english: string;
  original: string;
  index: number;
  /** False when the two texts have a different number of paragraphs, so the match is a best guess. */
  exact: boolean;
}

/**
 * The English paragraph holding `offset` (a position in the translation) and the original paragraph it was translated
 * from. Translations keep one paragraph per paragraph, so the same number is the same paragraph; when the counts
 * differ, the one at the same place in the chapter is taken.
 */
export function pairAt(original: string, english: string, offset: number): ParagraphPair | undefined {
  const en = paragraphs(english);
  const zh = paragraphs(original);
  if (!en.length || !zh.length) return undefined;
  let index = en.findIndex((p, i) => offset >= p.start && (i === en.length - 1 || offset < en[i + 1].start));
  if (index < 0) index = 0;
  const exact = en.length === zh.length;
  const at = exact ? index : Math.min(zh.length - 1, Math.round((index / Math.max(1, en.length - 1)) * (zh.length - 1)));
  return { english: en[index].text, original: zh[at].text, index, exact };
}

export interface FixAnswer {
  /** The Chinese words that became the selection, exactly as in the paragraph. */
  original: string;
  literal?: string;
  /** What it means here. */
  meaning?: string;
  /** A better English for it in this line. */
  suggestion?: string;
  kind?: GlossaryKind;
}

export function fixMessages(input: { original: string; english: string; quote: string; neighbours?: string; source?: LanguageInfo; target?: TargetInfo }): ChatMessage[] {
  const src = input.source ?? LANGUAGES.zh;
  const into = (input.target ?? TARGETS.en).name;
  return [
    {
      role: 'system',
      content:
        `You check one line of a ${src.novel} translated into ${into}. The reader selected words in the ${into} that look wrong. ` +
        `Find the ${src.name} words in the original paragraph that became the selected ${into}, and say what they really mean in this line. ` +
        `Reply with one JSON object and nothing else: {"original": "the ${src.name} words, copied exactly from the paragraph", ` +
        '"literal": "word-for-word meaning", "meaning": "what it means here, in one short sentence", ' +
        `"suggestion": "the ${into} to use instead in this line, short, in the same voice", ` +
        '"kind": "person|place|god|group|term"} (kind: term for an expression, catchphrase, item or rule).',
    },
    {
      role: 'user',
      content: [
        `Selected English: ${input.quote}`,
        `English paragraph: ${input.english}`,
        `Original paragraph: ${input.original}`,
        ...(input.neighbours ? [`Nearby original text (for context): ${input.neighbours}`] : []),
      ].join('\n'),
    },
  ];
}

/** Reads the model's reply. The Chinese must be in the paragraph, or it is not trusted. */
export function parseFix(reply: string, paragraph: string): FixAnswer | undefined {
  const json = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  let raw: Partial<FixAnswer>;
  try {
    raw = JSON.parse(json) as Partial<FixAnswer>;
  } catch {
    return undefined;
  }
  const original = String(raw.original ?? '').trim();
  if (!original || !paragraph.includes(original)) return undefined;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const kinds: GlossaryKind[] = ['person', 'place', 'god', 'group', 'term'];
  return {
    original,
    literal: text(raw.literal),
    meaning: text(raw.meaning),
    suggestion: text(raw.suggestion),
    kind: kinds.includes(raw.kind as GlossaryKind) ? (raw.kind as GlossaryKind) : 'term',
  };
}

/** Asks the model which Chinese became the selected English. Costs one small call, added to the book's spend. */
export async function askOriginal(bookId: string, pair: ParagraphPair, quote: string): Promise<FixAnswer> {
  const settings = await loadSettings();
  const book = await db.books.get(bookId);
  if (!aiAllowedFor(book)) throw new Error(AI_OFF_FOR_FAN_WORK);
  const model = modelFor(settings, book?.model);
  const messages = fixMessages({ original: pair.original, english: pair.english, quote, source: sourceOf(book), target: targetOf(book) });
  const result = await chat(settings, model.id, messages);
  const spend = callCost(model, messages, result);
  await addSpend(bookId, spend.cost, spend.estimated);
  const answer = parseFix(result.text, pair.original);
  if (!answer) throw new Error(`The answer did not name words from this paragraph. Select the ${(sourceOf(book) ?? LANGUAGES.zh).name} yourself below.`);
  return answer;
}

/** The text with `start`–`end` replaced. */
export function replaceAt(text: string, start: number, end: number, by: string): string {
  return text.slice(0, start) + by + text.slice(end);
}

/**
 * Saves a fix: the new English in this chapter's translation (when given), and a glossary entry so later chapters
 * use it (when given). An entry with the same Chinese is updated; the fix is locked so scans never change it.
 */
export async function saveFix(input: {
  chapterId: string;
  bookId: string;
  start: number;
  end: number;
  replacement?: string;
  entry?: { original: string; english: string; note?: string; kind: GlossaryKind };
}): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.translations, db.glossary, async () => {
    if (input.replacement !== undefined) {
      const t = await db.translations.get(input.chapterId);
      if (t) await db.translations.update(input.chapterId, { text: replaceAt(t.text, input.start, input.end, input.replacement) });
    }
    const e = input.entry;
    if (e && e.original.trim() && e.english.trim()) {
      const there = (await db.glossary.where('bookId').equals(input.bookId).toArray()).find((g) => g.original === e.original.trim());
      if (there) {
        await db.glossary.update(there.id, { english: e.english.trim(), note: e.note?.trim() || there.note, status: 'ok', locked: true, updatedAt: now });
      } else {
        const row: GlossaryEntry = {
          id: newId(),
          bookId: input.bookId,
          original: e.original.trim(),
          english: e.english.trim(),
          kind: e.kind,
          note: e.note?.trim() || undefined,
          status: 'ok',
          locked: true,
          createdAt: now,
          updatedAt: now,
        };
        await db.glossary.add(row);
      }
    }
  });
}
