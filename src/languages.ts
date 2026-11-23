import type { Book, BookLanguage } from './types';

/**
 * The languages YoomiRead translates from, in one place: their names, how to spot their script, how names go into
 * English, and how fast they read. Everything that used to assume Chinese asks here.
 */
export type SourceLanguage = 'zh' | 'ja' | 'ko';

export interface LanguageInfo {
  id: SourceLanguage;
  /** As readers call it. */
  name: string;
  /** Its own name, for the reader's Original / Translation switch. */
  native: string;
  /** For the HTML lang attribute (picks the right font and glyph shapes). */
  htmlLang: string;
  /** Characters only this language's text uses (kana for Japanese, hangul for Korean, Han for Chinese). */
  script: RegExp;
  /** The kind of book, for the translator: "Chinese web novel". */
  novel: string;
  /** How personal names go into English, for the translator and the glossary scan. */
  names: string;
  /** Rough reading speed in characters per minute. */
  perMinute: number;
}

const HAN = '\\u3400-\\u9fff\\uf900-\\ufaff';
const KANA = '\\u3040-\\u30ff\\u31f0-\\u31ff';
const HANGUL = '\\uac00-\\ud7af\\u1100-\\u11ff\\u3130-\\u318f';

export const LANGUAGES: Record<SourceLanguage, LanguageInfo> = {
  zh: {
    id: 'zh',
    name: 'Chinese',
    native: '中文',
    htmlLang: 'zh',
    script: new RegExp(`[${HAN}]`),
    novel: 'Chinese web novel',
    names: 'pinyin for personal names (meaning-based English for titles, places and terms where that reads better)',
    perMinute: 400,
  },
  ja: {
    id: 'ja',
    name: 'Japanese',
    native: '日本語',
    htmlLang: 'ja',
    script: new RegExp(`[${KANA}${HAN}]`),
    novel: 'Japanese light novel or web novel',
    names:
      'Hepburn romanization for personal names, in the order the story uses (usually family name first in the text); keep honorifics like -san, -sama, -senpai as the style setting says',
    perMinute: 500,
  },
  ko: {
    id: 'ko',
    name: 'Korean',
    native: '한국어',
    htmlLang: 'ko',
    script: new RegExp(`[${HANGUL}]`),
    novel: 'Korean web novel',
    names: 'Revised Romanization for personal names (family name first, as in the story), unless the story gives an English spelling',
    perMinute: 500,
  },
};

/** Every letter of any source language: Han, kana and hangul. */
export const ANY_SOURCE = new RegExp(`[${HAN}${KANA}${HANGUL}]`);
const ANY_SOURCE_G = new RegExp(ANY_SOURCE.source, 'g');
const KANA_G = new RegExp(`[${KANA}]`, 'g');
const HANGUL_G = new RegExp(`[${HANGUL}]`, 'g');
const HAN_G = new RegExp(`[${HAN}]`, 'g');

/** The source language of a book, or undefined for English and other books. */
export function sourceOf(book: Pick<Book, 'language'> | undefined | null): LanguageInfo | undefined {
  const l = book?.language;
  return l === 'zh' || l === 'ja' || l === 'ko' ? LANGUAGES[l] : undefined;
}

/** The HTML lang for text in the book's own language (undefined for English). */
export function htmlLangOf(language: BookLanguage | undefined): string | undefined {
  return language === 'zh' || language === 'ja' || language === 'ko' ? LANGUAGES[language].htmlLang : undefined;
}

/** Counts letters of the source scripts (Han, kana, hangul) in a text. */
export function sourceLetters(text: string): number {
  return (text.match(ANY_SOURCE_G) ?? []).length;
}

/**
 * Which language a text is in, from its letters. Kana means Japanese (Japanese mixes kana with Han; Chinese never
 * uses kana), hangul means Korean, Han alone means Chinese.
 */
export function guessSource(text: string): SourceLanguage | undefined {
  const sample = text.slice(0, 5000);
  const kana = (sample.match(KANA_G) ?? []).length;
  const hangul = (sample.match(HANGUL_G) ?? []).length;
  const han = (sample.match(HAN_G) ?? []).length;
  if (hangul > 20 && hangul >= han) return 'ko';
  if (kana > 20 && kana * 10 >= han) return 'ja';
  if (han > 20) return 'zh';
  return undefined;
}

/** The HTML lang for a short piece of original text (a name, a title), from its letters; undefined for Latin text. */
export function htmlLangOfText(text: string | undefined, fallback?: BookLanguage): string | undefined {
  if (!text) return undefined;
  if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'ja';
  if (/[가-힯ᄀ-ᇿ㄰-㆏]/.test(text)) return 'ko';
  // Han alone: the book's language decides (a Japanese name can be all kanji), else Chinese.
  if (/[㐀-鿿豈-﫿]/.test(text)) return htmlLangOf(fallback) ?? 'zh';
  return undefined;
}

/** Names of the languages a book can be in, for pickers and labels. */
export const BOOK_LANGUAGES: { id: BookLanguage; label: string }[] = [
  { id: 'zh', label: 'Chinese' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'en', label: 'English' },
  { id: 'other', label: 'Other' },
];

/** The languages a book can be translated into. English unless the book says otherwise. */
export type TargetLanguage = 'en' | 'es' | 'fr';

export interface TargetInfo {
  id: TargetLanguage;
  /** As readers call it, and as the translator is told. */
  name: string;
  htmlLang: string;
  /** Short label for chips ("EN"). */
  short: string;
  /** Its own name ("Español"). */
  native: string;
}

export const TARGETS: Record<TargetLanguage, TargetInfo> = {
  en: { id: 'en', name: 'English', htmlLang: 'en', short: 'EN', native: 'English' },
  es: { id: 'es', name: 'Spanish', htmlLang: 'es', short: 'ES', native: 'Español' },
  fr: { id: 'fr', name: 'French', htmlLang: 'fr', short: 'FR', native: 'Français' },
};

/** The language a book is translated into (English when not set). */
export function targetOf(book: { target?: TargetLanguage } | undefined | null): TargetInfo {
  return TARGETS[book?.target ?? 'en'] ?? TARGETS.en;
}
