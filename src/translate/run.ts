import { db } from '../db';
import { newId } from '../logic';
import type { Chapter, GlossaryEntry, ModelOption, TranslateSettings, Translation } from '../types';
import { chat, type ChatResult } from './api';
import { chapterMessages, cleanTitle, costOf, estimateTokens, glossaryScanMessages, isRefusal, parseTerms, pronounWarnings, splitReply, titleMessages, type ChatMessage, type ProposedTerm } from './prompt';

/**
 * Prices seen on the owner's provider on 2026-10-20 (change them in Settings when they move).
 * The MiniMax entries are not confirmed against the provider yet: their ids and prices come from
 * public listings, so check them in Settings and correct the id if the provider names it differently.
 */
export const DEFAULT_MODELS: ModelOption[] = [
  { id: 'claude-haiku-5.5', label: 'Claude Haiku 5.5 (budget)', inputPrice: 0.066, outputPrice: 0.332 },
  { id: 'deepseek-v4-pro-0813', label: 'DeepSeek v4 Pro (quality)', inputPrice: 0.561, outputPrice: 1.683 },
  { id: 'MiniMax-M2', label: 'MiniMax M2', inputPrice: 0.3, outputPrice: 1.2 },
  { id: 'MiniMax-M3', label: 'MiniMax M3', inputPrice: 0.3, outputPrice: 1.2 },
];

export const EMPTY_SETTINGS: TranslateSettings = { baseUrl: '', apiKey: '', models: DEFAULT_MODELS, defaultModel: DEFAULT_MODELS[0].id };

const KEY = 'translate';

export async function loadSettings(): Promise<TranslateSettings> {
  const row = await db.settings.get(KEY);
  const saved = { ...EMPTY_SETTINGS, ...((row?.value as Partial<TranslateSettings>) ?? {}) };
  // Models added in a later version are missing from settings saved before it: add them, keep the owner's edits.
  const have = new Set(saved.models.map((m) => m.id));
  const missing = DEFAULT_MODELS.filter((m) => !have.has(m.id));
  return missing.length ? { ...saved, models: [...saved.models, ...missing] } : saved;
}

export async function saveSettings(settings: TranslateSettings): Promise<void> {
  await db.settings.put({ key: KEY, value: settings });
}

export function modelFor(settings: TranslateSettings, id?: string): ModelOption {
  return settings.models.find((m) => m.id === id) ?? settings.models.find((m) => m.id === settings.defaultModel) ?? settings.models[0];
}

/**
 * What one call cost: from the tokens the provider reported, or estimated from the text
 * when it reported none. Undefined when the model has no prices set.
 */
export function callCost(model: ModelOption, messages: ChatMessage[], result: ChatResult): { cost?: number; estimated: boolean } {
  if (result.inputTokens !== undefined && result.outputTokens !== undefined) {
    return { cost: costOf(model, result.inputTokens, result.outputTokens), estimated: false };
  }
  const input = estimateTokens(messages.map((m) => m.content).join('\n')).input;
  const output = estimateTokens(result.text).input;
  return { cost: costOf(model, input, output), estimated: true };
}

/** Adds a call's cost to the book's running total. */
export async function addSpend(bookId: string, cost: number | undefined, estimated: boolean): Promise<void> {
  if (cost === undefined) return;
  await db.transaction('rw', db.books, async () => {
    const b = await db.books.get(bookId);
    if (!b) return;
    await db.books.update(bookId, { spent: (b.spent ?? 0) + cost, spentEstimated: b.spentEstimated || estimated });
  });
}

/** Adds proposed terms the glossary does not have yet, as "needs review". */
export async function addProposals(bookId: string, terms: ProposedTerm[]): Promise<number> {
  const existing = new Set((await db.glossary.where('bookId').equals(bookId).toArray()).map((g) => g.original));
  const now = Date.now();
  const fresh: GlossaryEntry[] = terms
    .filter((t) => !existing.has(t.original))
    .map((t) => ({ id: newId(), bookId, ...t, locked: false, status: 'review', createdAt: now, updatedAt: now }));
  await db.glossary.bulkAdd(fresh);
  return fresh.length;
}

export interface ChapterRun {
  translation: Translation;
  /** Names the model proposed (added for review when saved). */
  terms: ProposedTerm[];
  newTerms: number;
}

/** Translates one chapter, saves the English next to the original, and queues new names for review. */
export async function translateChapter(
  chapter: Chapter,
  options: { settings: TranslateSettings; model: string; onText?: (piece: string) => void; signal?: AbortSignal; save?: boolean },
): Promise<ChapterRun> {
  const [book, text, glossary] = await Promise.all([
    db.books.get(chapter.bookId),
    db.texts.get(chapter.id),
    db.glossary.where('bookId').equals(chapter.bookId).toArray(),
  ]);
  if (!text?.text) throw new Error('This chapter has no text to translate.');
  const messages = chapterMessages({ bookTitle: book?.title ?? '', chapterTitle: chapter.title, text: text.text, glossary });
  const result = await chat(options.settings, options.model, messages, options.onText, options.signal);
  const { text: english, terms } = splitReply(result.text);
  const option = modelFor(options.settings, options.model);
  const spend = callCost(option, messages, result);
  // A refusal is not a translation: show it as an error and keep the chapter untranslated.
  if (isRefusal(result.text)) {
    await addSpend(chapter.bookId, spend.cost, spend.estimated);
    throw new Error(
      `${option.label} would not translate "${chapter.title}". Try the other model in Compare, or check what your provider allows.`,
    );
  }
  // Money is spent even when a Compare result is not kept.
  await addSpend(chapter.bookId, spend.cost, spend.estimated);
  const translation: Translation = {
    chapterId: chapter.id,
    bookId: chapter.bookId,
    text: english,
    model: options.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: spend.cost,
    costEstimated: spend.estimated,
    warnings: pronounWarnings(english, glossary.filter((g) => g.status === 'ok')),
    createdAt: Date.now(),
  };
  let newTerms = 0;
  if (options.save !== false) {
    await db.translations.put(translation);
    newTerms = await addProposals(chapter.bookId, terms);
  }
  return { translation, terms, newTerms };
}

/** Saves a translation made earlier without saving (the one picked in Compare). */
export async function keepTranslation(run: ChapterRun): Promise<number> {
  await db.translations.put(run.translation);
  return addProposals(run.translation.bookId, run.terms);
}

/** Reads the first chapters and proposes a glossary. Returns how many entries were added for review. */
export async function scanGlossary(bookId: string, settings: TranslateSettings, model: string, signal?: AbortSignal): Promise<number> {
  const [book, chapters, known] = await Promise.all([
    db.books.get(bookId),
    db.chapters.where('bookId').equals(bookId).sortBy('number'),
    db.glossary.where('bookId').equals(bookId).toArray(),
  ]);
  // Up to about 12,000 characters from the start of the book: enough to meet the main cast.
  let sample = '';
  for (const c of chapters) {
    const t = (await db.texts.get(c.id))?.text;
    if (!t) continue;
    sample += `\n\n${c.title}\n${t}`;
    if (sample.length > 12_000) break;
  }
  if (!sample.trim()) throw new Error('This book has no chapter text to read yet.');
  const messages = glossaryScanMessages({ bookTitle: book?.title ?? '', sample: sample.slice(0, 12_000), known });
  const result = await chat(settings, model, messages, undefined, signal);
  const spend = callCost(modelFor(settings, model), messages, result);
  await addSpend(bookId, spend.cost, spend.estimated);
  return addProposals(bookId, parseTerms(result.text));
}

/** Asks the model for an English title. */
export async function translateTitle(
  settings: TranslateSettings,
  model: string,
  title: string,
  author?: string,
  bookId?: string,
): Promise<string> {
  const messages = titleMessages(title, author);
  const result = await chat(settings, model, messages);
  if (bookId) {
    const spend = callCost(modelFor(settings, model), messages, result);
    await addSpend(bookId, spend.cost, spend.estimated);
  }
  const english = cleanTitle(result.text);
  if (!english) throw new Error('The model gave no title back.');
  return english;
}
