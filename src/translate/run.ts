import { AI_OFF_FOR_FAN_WORK, aiAllowedFor } from '../import/ao3Book';
import { accountsAvailable, accountToken, signedIn } from '../account';
import { PUBLIC } from '../edition';
import { genreNote } from '../genres';
import { ANY_SOURCE, guessSource, LANGUAGES, sourceOf, targetOf, TARGETS, type LanguageInfo, type TargetInfo } from '../languages';
import { db } from '../db';
import { newId } from '../logic';
import type { Chapter, GlossaryEntry, ModelOption, TranslateSettings, Translation } from '../types';
import { chat, type ChatResult } from './api';
import { needsTranslation } from '../logic';
import { clearTrouble, noteTrouble } from '../mascot/trouble';
import { CENSORED, chapterMessages, cleanChapterTitle, cleanTitle, glossaryLines, costOf, estimateTokens, glossaryScanMessages, isRefusal, parseTerms, pronounWarnings, splitReply, titleMessages, type ChatMessage, type ProposedTerm } from './prompt';
import { paragraphs } from '../logic';

/** Prices and ids as the owner's provider lists them on 2026-10-24 (change them in Settings when they move). */
export const DEFAULT_MODELS: ModelOption[] = [
  { id: 'claude-haiku-5.5', label: 'Claude Haiku 5.5 (budget)', inputPrice: 0.066, outputPrice: 0.332 },
  { id: 'deepseek-v4-pro-0813', label: 'DeepSeek v4 Pro (quality)', inputPrice: 0.561, outputPrice: 1.683 },
  { id: 'minimax-m2', label: 'MiniMax M2', inputPrice: 0.195, outputPrice: 0.78 },
  { id: 'minimax-m3', label: 'MiniMax M3', inputPrice: 0.225, outputPrice: 0.9 },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (budget, untested)', inputPrice: 0.08, outputPrice: 0.48 },
  { id: 'qwen3.6-plus-uncensored', label: 'Qwen 3.6 Plus Uncensored (untested)', inputPrice: 0.406, outputPrice: 2.44 },
  { id: 'glm-4.7', label: 'GLM 4.7 (untested, price not set)' },
];

export const EMPTY_SETTINGS: TranslateSettings = { mode: PUBLIC && accountsAvailable ? 'hosted' : 'own', baseUrl: '', apiKey: '', models: DEFAULT_MODELS, defaultModel: DEFAULT_MODELS[0].id, ahead: 1, onImport: 3 };

/** Names saved by earlier versions, replaced by the provider's ids. */
const RETIRED_MODEL_IDS = ['MiniMax-M2', 'MiniMax-M3'];

const KEY = 'translate';

export async function loadSettings(): Promise<TranslateSettings> {
  const row = await db.settings.get(KEY);
  const saved = { ...EMPTY_SETTINGS, ...((row?.value as Partial<TranslateSettings>) ?? {}) };
  if (saved.mode === 'hosted') {
    // YoomiRead AI: the models are the server's, not the ones saved for the reader's own service.
    // When the server cannot be reached and nothing is kept yet, the list is empty and Settings says so.
    const models = await hostedModels();
    return { ...saved, models, defaultModel: models.some((m) => m.id === saved.hostedModel) ? saved.hostedModel! : (models[0]?.id ?? '') };
  }
  // Models added in a later version are missing from settings saved before it: add them, keep the owner's edits.
  const kept = saved.models.filter((m) => !RETIRED_MODEL_IDS.includes(m.id));
  const have = new Set(kept.map((m) => m.id));
  const missing = DEFAULT_MODELS.filter((m) => !have.has(m.id));
  return kept.length === saved.models.length && !missing.length ? saved : { ...saved, models: [...kept, ...missing] };
}

export async function saveSettings(settings: TranslateSettings): Promise<void> {
  if (settings.mode === 'hosted') {
    // The model picked for YoomiRead AI is kept apart, so the reader's own service keeps its own list and choice.
    const row = await db.settings.get(KEY);
    const before = { ...EMPTY_SETTINGS, ...((row?.value as Partial<TranslateSettings>) ?? {}) };
    await db.settings.put({ key: KEY, value: { ...settings, models: before.models, defaultModel: before.defaultModel, hostedModel: settings.defaultModel } });
    return;
  }
  await db.settings.put({ key: KEY, value: settings });
}

/** Switches between YoomiRead AI and the reader's own service. Only the choice changes: each keeps its own models. */
export async function setAiMode(mode: 'own' | 'hosted'): Promise<void> {
  const row = await db.settings.get(KEY);
  await db.settings.put({ key: KEY, value: { ...EMPTY_SETTINGS, ...((row?.value as Partial<TranslateSettings>) ?? {}), mode } });
}

/** True when AI can be used now: signed in for YoomiRead AI, or an address and key for the reader's own service. */
export function aiReady(settings: TranslateSettings | undefined): boolean {
  if (!settings) return false;
  if (settings.mode === 'hosted') return accountsAvailable && signedIn();
  return !!(settings.baseUrl.trim() && settings.apiKey.trim());
}

const HOSTED_KEY = 'hostedModels';

/**
 * The models YoomiRead AI offers, with their prices. Asked of the server and kept on the phone, so the list is there
 * offline too; refreshed at most once an hour.
 */
export async function hostedModels(force = false): Promise<ModelOption[]> {
  const row = (await db.settings.get(HOSTED_KEY))?.value as { at: number; models: ModelOption[] } | undefined;
  if (row && !force && Date.now() - row.at < 3_600_000) return row.models;
  try {
    const res = await fetch('/api/ai/models');
    if (!res.ok) return row?.models ?? [];
    const data = (await res.json()) as { models?: { id: string; label: string; input: number; output: number }[] };
    const models = (data.models ?? []).map((m) => ({ id: m.id, label: m.label, inputPrice: m.input, outputPrice: m.output }));
    await db.settings.put({ key: HOSTED_KEY, value: { at: Date.now(), models } });
    return models;
  } catch {
    return row?.models ?? [];
  }
}

/** This month's use of YoomiRead AI, in US$, and the monthly limit. */
export async function hostedUsage(): Promise<{ spent: number; limit: number }> {
  const token = await accountToken();
  const res = await fetch('/api/ai/usage', { headers: { authorization: `Bearer ${token ?? ''}` } });
  if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again.' : 'Could not read this month’s use.');
  return (await res.json()) as { spent: number; limit: number };
}

/**
 * Asks the provider which models it offers. Prices and labels already set on this phone are kept;
 * models the provider does not list stay too, so the owner's own entries are never lost.
 */
export async function fetchModels(settings: TranslateSettings): Promise<ModelOption[]> {
  const base = settings.baseUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${settings.apiKey.trim()}` } });
  if (!res.ok) throw new Error(`The provider did not list its models (${res.status}).`);
  const data = (await res.json()) as { data?: { id?: unknown }[] };
  const ids = (data.data ?? []).map((m) => String(m.id ?? '')).filter(Boolean);
  if (!ids.length) throw new Error('The provider listed no models.');
  const saved = new Map(settings.models.map((m) => [m.id, m]));
  const defaults = new Map(DEFAULT_MODELS.map((m) => [m.id, m]));
  const listed = ids.map((id) => saved.get(id) ?? defaults.get(id) ?? { id, label: id });
  const unlisted = settings.models.filter((m) => !ids.includes(m.id));
  return [...listed, ...unlisted];
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
  // Keeping count must never stop the translation or scan it counts: a failed save is only logged.
  try {
    await db.transaction('rw', db.books, async () => {
      const b = await db.books.get(bookId);
      if (!b) return;
      await db.books.update(bookId, { spent: (b.spent ?? 0) + cost, spentEstimated: b.spentEstimated || estimated });
    });
  } catch (e) {
    console.warn('The cost was not saved:', e);
  }
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

/**
 * The story so far before this chapter: the summary saved with the nearest earlier chapter
 * that has one. Works even when chapters were translated out of order, or some were skipped.
 */
async function summaryBefore(chapter: Chapter): Promise<string | undefined> {
  const [chapters, translations] = await Promise.all([
    db.chapters.where('bookId').equals(chapter.bookId).toArray(),
    db.translations.where('bookId').equals(chapter.bookId).toArray(),
  ]);
  const summaryOf = new Map(translations.filter((t) => t.summary).map((t) => [t.chapterId, t.summary]));
  const earlier = chapters.filter((c) => c.number < chapter.number && summaryOf.has(c.id)).sort((a, b) => b.number - a.number);
  return earlier.length ? summaryOf.get(earlier[0].id) : undefined;
}

type ChapterOptions = { settings: TranslateSettings; model: string; onText?: (piece: string) => void; signal?: AbortSignal; save?: boolean };

/**
 * Translates one chapter, saves the English next to the original, and queues new names for review.
 * It also tells the cat how it went: a failure or skipped passages make him cross, a clean run calms him.
 */
export async function translateChapter(chapter: Chapter, options: ChapterOptions): Promise<ChapterRun> {
  try {
    const run = await runChapter(chapter, options);
    const skipped = run.translation.text.split('\n\n').includes(CENSORED);
    await (skipped ? noteTrouble('skipped', chapter.title, chapter.id) : clearTrouble()).catch(() => {});
    return run;
  } catch (e) {
    // Stopping on purpose is not a failure.
    if (!options.signal?.aborted) await noteTrouble('failed', chapter.title, chapter.id, e instanceof Error ? e.message : undefined).catch(() => {});
    throw e;
  }
}

async function runChapter(chapter: Chapter, options: ChapterOptions): Promise<ChapterRun> {
  const [book, text, glossary, previousSummary] = await Promise.all([
    db.books.get(chapter.bookId).then((b) => {
      if (!aiAllowedFor(b)) throw new Error(AI_OFF_FOR_FAN_WORK);
      return b;
    }),
    db.texts.get(chapter.id),
    db.glossary.where('bookId').equals(chapter.bookId).toArray(),
    summaryBefore(chapter),
  ]);
  if (!text?.text) throw new Error('This chapter has no text to translate.');
  const messages = chapterMessages({
    bookTitle: book?.title ?? '',
    chapterTitle: chapter.title,
    text: text.text,
    glossary,
    previousSummary: previousSummary ?? book?.storySoFar,
    style: book?.style,
    genre: genreNote(book) || undefined,
    source: sourceOf(book),
    target: targetOf(book),
  });
  const result = await chat(options.settings, options.model, messages, options.onText, options.signal);
  const { text: english, terms, summary, title } = splitReply(result.text, sourceOf(book));
  const option = modelFor(options.settings, options.model);
  const spend = callCost(option, messages, result);
  // A refusal is not a translation: show it as an error and keep the chapter untranslated.
  if (isRefusal(result.text)) {
    await addSpend(chapter.bookId, spend.cost, spend.estimated);
    throw new Error(
      `${option.label} would not translate "${chapter.title}". Try the other model in Compare, or check what your provider allows.`,
    );
  }
  // A reply cut short by the output limit would save half a chapter: fail instead, but keep the spend.
  if (result.truncated) {
    await addSpend(chapter.bookId, spend.cost, spend.estimated);
    throw new Error(`The reply for "${chapter.title}" was cut short. Try again, or turn thinking on in Settings.`);
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
    warnings: translationWarnings(text.text, english, glossary),
    summary,
    lang: targetOf(book).id,
    title,
    createdAt: Date.now(),
  };
  let newTerms = 0;
  if (options.save !== false) {
    await db.translations.put(translation);
    if (title) await db.chapters.update(chapter.id, { titleEn: title });
    newTerms = await addProposals(chapter.bookId, terms);
  }
  return { translation, terms, newTerms };
}

/**
 * Things to look at in a finished translation: passages the model marked as skipped, a reply with
 * clearly fewer paragraphs than the original (text may have been dropped), and pronouns that do not match.
 */
export function translationWarnings(original: string, english: string, glossary: GlossaryEntry[]): string[] {
  const warnings: string[] = [];
  const marked = english.split('\n\n').filter((p) => p === CENSORED).length;
  if (marked) warnings.push(`${marked} passage${marked > 1 ? 's' : ''} marked in red could not be translated and ${marked > 1 ? 'were' : 'was'} skipped.`);
  const sourceCount = paragraphs(original).length;
  // A marked passage still stands in for one original paragraph, so it counts.
  const englishCount = english.split('\n\n').filter(Boolean).length;
  if (sourceCount >= 5 && englishCount < sourceCount * 0.9) {
    warnings.push(`The English has ${englishCount} paragraphs for ${sourceCount} in the original, so some text may be missing.`);
  }
  return [...warnings, ...pronounWarnings(english, glossary.filter((g) => g.status === 'ok'))];
}

/** Saves a translation made earlier without saving (the one picked in Compare). */
export async function keepTranslation(run: ChapterRun): Promise<number> {
  await db.translations.put(run.translation);
  if (run.translation.title) await db.chapters.update(run.translation.chapterId, { titleEn: run.translation.title });
  return addProposals(run.translation.bookId, run.terms);
}

/** Reads the first chapters and proposes a glossary. Returns how many entries were added for review. */
export async function scanGlossary(bookId: string, settings: TranslateSettings, model: string, signal?: AbortSignal): Promise<number> {
  const [book, chapters, known] = await Promise.all([
    db.books.get(bookId).then((b) => {
      if (!aiAllowedFor(b)) throw new Error(AI_OFF_FOR_FAN_WORK);
      return b;
    }),
    db.chapters.where('bookId').equals(bookId).sortBy('number'),
    db.glossary.where('bookId').equals(bookId).toArray(),
  ]);
  // Up to about 12,000 characters from the start of the book: enough to meet the main cast.
  let sample = '';
  // The last chapter read whole, so "Look for new characters" later starts after it.
  let wholeTo = 0;
  for (const c of chapters) {
    const t = (await db.texts.get(c.id))?.text;
    if (!t) continue;
    sample += `\n\n${c.title}\n${t}`;
    if (sample.length <= 12_000) wholeTo = c.number;
    if (sample.length > 12_000) break;
  }
  if (!sample.trim()) throw new Error('This book has no chapter text to read yet.');
  const messages = glossaryScanMessages({ bookTitle: book?.title ?? '', sample: sample.slice(0, 12_000), known, plain: !needsTranslation(book, sample), source: sourceOf(book) });
  const result = await chat(settings, model, messages, undefined, signal);
  const spend = callCost(modelFor(settings, model), messages, result);
  await addSpend(bookId, spend.cost, spend.estimated);
  if (wholeTo > (book?.castUpTo ?? 0)) await db.books.update(bookId, { castUpTo: wholeTo }).catch(() => {});
  return addProposals(bookId, parseTerms(result.text, !needsTranslation(book, sample), sourceOf(book)));
}

/** Asks the model for an English title. */
export async function translateTitle(
  settings: TranslateSettings,
  model: string,
  title: string,
  author?: string,
  bookId?: string,
): Promise<string> {
  // The title's own letters say its language (a book's language may not be set yet right after import).
  const lang = guessSource(title);
  const messages = titleMessages(title, author, lang ? LANGUAGES[lang] : undefined);
  const result = await chat(settings, model, messages);
  if (bookId) {
    const spend = callCost(modelFor(settings, model), messages, result);
    await addSpend(bookId, spend.cost, spend.estimated);
  }
  const english = cleanTitle(result.text);
  if (!english) throw new Error('The model gave no title back.');
  return english;
}

/** Chapter titles to put into English in one request (each is short, so many fit). */
const TITLES_PER_CALL = 120;

/** The request for a batch of chapter titles: numbered lines in, numbered lines out. */
export function titleBatchMessages(titles: string[], glossary: GlossaryEntry[], source: LanguageInfo = LANGUAGES.zh, target: TargetInfo = TARGETS.en): ChatMessage[] {
  const named = glossary.filter((g) => g.status === 'ok' && [g.original, ...(g.aliases ?? [])].some((n) => n && titles.some((t) => t.includes(n))));
  return [
    {
      role: 'system',
      content:
        `You translate the chapter titles of a ${source.novel} into ${target.name}. Use the glossary exactly for names. ` +
        'Leave out the chapter number ("第589章 入梦" becomes "Into the Dream", "第12話 旅立ち" becomes "Departure", "제3화 각성" becomes "Awakening"); ' +
        'keep words like "Side Story". Keep the tone of each title. ' +
        'Reply with the same numbered lines and nothing else: "1. Title".',
    },
    {
      role: 'user',
      content: [named.length ? `Glossary:\n${glossaryLines(named)}` : '', titles.map((t, i) => `${i + 1}. ${t}`).join('\n')].filter(Boolean).join('\n\n'),
    },
  ];
}

/** Reads numbered lines back: title i (0-based) → English. */
export function parseTitleBatch(reply: string, count: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of reply.split('\n')) {
    const m = /^\s*(\d+)\s*[.)：:]\s*(.+)$/.exec(line);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    const title = cleanChapterTitle(m[2]);
    if (i >= 0 && i < count && title && !out.has(i)) out.set(i, title);
  }
  return out;
}

/**
 * Puts the chapter titles of a book into English, a batch at a time (chapters that have one already are skipped).
 * Each batch is saved as it comes back. Returns how many titles were done.
 */
export async function translateTitles(bookId: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<number> {
  const settings = await loadSettings();
  const book = await db.books.get(bookId);
  if (!aiAllowedFor(book)) throw new Error(AI_OFF_FOR_FAN_WORK);
  const model = modelFor(settings, book?.model);
  const glossary = (await db.glossary.where('bookId').equals(bookId).toArray()) as GlossaryEntry[];
  const todo = ((await db.chapters.where('bookId').equals(bookId).sortBy('number')) as Chapter[])
    .filter((c) => !c.titleEn && ANY_SOURCE.test(c.title));
  let done = 0;
  onProgress?.(0, todo.length);
  for (let at = 0; at < todo.length; at += TITLES_PER_CALL) {
    if (signal?.aborted) break;
    const batch = todo.slice(at, at + TITLES_PER_CALL);
    const messages = titleBatchMessages(
      batch.map((c) => c.title),
      glossary,
      sourceOf(book),
      targetOf(book),
    );
    const result = await chat(settings, model.id, messages, undefined, signal);
    const spend = callCost(model, messages, result);
    await addSpend(bookId, spend.cost, spend.estimated);
    const titles = parseTitleBatch(result.text, batch.length);
    await db.transaction('rw', db.chapters, async () => {
      for (const [i, t] of titles) await db.chapters.update(batch[i].id, { titleEn: t });
    });
    done += titles.size;
    onProgress?.(at + batch.length, todo.length);
  }
  return done;
}
