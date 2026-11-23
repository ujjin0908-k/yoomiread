import { guessSource, LANGUAGES, sourceLetters } from './languages';
import type { Book, BookLanguage, Chapter, Gender, Note, Session, Shelf } from './types';

export const SHELVES: { id: Shelf; label: string }[] = [
  { id: 'reading', label: 'Reading' },
  { id: 'want', label: 'Want to read' },
  { id: 'finished', label: 'Read' },
  { id: 'dropped', label: 'Dropped' },
];

export type LibrarySort = 'recent' | 'title' | 'author' | 'progress';

export const LIBRARY_SORTS: { id: LibrarySort; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
  { id: 'progress', label: 'Progress' },
];

const byTitle = (a: Book, b: Book) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Orders books for the library. Recent = last opened (or last changed); Progress = most read first.
 * Books with no author go last under Author. Ties fall back to title.
 */
export function sortBooks(books: Book[], sort: LibrarySort, progressOf: (b: Book) => number): Book[] {
  const sorted = [...books];
  switch (sort) {
    case 'recent':
      return sorted.sort((a, b) => (b.lastReadAt ?? b.updatedAt) - (a.lastReadAt ?? a.updatedAt));
    case 'title':
      return sorted.sort(byTitle);
    case 'author':
      return sorted.sort((a, b) => {
        if (!a.author !== !b.author) return a.author ? -1 : 1;
        return a.author.localeCompare(b.author, undefined, { numeric: true, sensitivity: 'base' }) || byTitle(a, b);
      });
    case 'progress':
      return sorted.sort((a, b) => progressOf(b) - progressOf(a) || byTitle(a, b));
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Rounds to the nearest half star and keeps it in 0.5..5. */
export function clampRating(value: number): number {
  const half = Math.round(value * 2) / 2;
  return Math.min(5, Math.max(0.5, half));
}

/** Moves a book to a shelf and keeps the start and finish dates right. */
export function moveToShelf(book: Book, shelf: Shelf, now = Date.now()): Book {
  const next: Book = { ...book, shelf, updatedAt: now };
  if (shelf === 'reading' && !next.startedAt) next.startedAt = now;
  if (shelf === 'finished') {
    next.startedAt ??= now;
    next.finishedAt = now;
  } else {
    delete next.finishedAt;
  }
  return next;
}

/** Finishing a book: shelf, date, rating and review in one step. */
export function finishBook(book: Book, rating: number, review: string, now = Date.now()): Book {
  const moved = moveToShelf(book, 'finished', now);
  const trimmed = review.trim();
  return { ...moved, rating: clampRating(rating), review: trimmed || undefined };
}

/** Dropping a book: shelf, an optional rating for what was read, and why it was dropped (kept as the review). */
export function dropBook(book: Book, rating: number, reason: string, now = Date.now()): Book {
  const moved = moveToShelf(book, 'dropped', now);
  const trimmed = reason.trim();
  return { ...moved, rating: rating ? clampRating(rating) : undefined, review: trimmed || undefined };
}

/**
 * Whether a book needs translating. English books are read as they are, and so is any text that
 * is written in Latin letters only (the book's language setting can be wrong).
 */
export function needsTranslation(book?: Pick<Book, 'language'>, text?: string): boolean {
  if (book?.language === 'en') return false;
  if (text) {
    const sample = text.slice(0, 4000);
    const latin = (sample.match(/[a-zA-Z]/g) ?? []).length;
    const other = (sample.match(/[㐀-鿿가-힣぀-ヿ]/g) ?? []).length;
    if (latin > 0 && other === 0) return false;
  }
  return true;
}

/** A chapter counts as read when it was ticked, or scrolled to (nearly) the end. */
export function isRead(c: Chapter): boolean {
  return !!c.read || (c.position ?? 0) >= 0.9;
}

export function progress(chapters: Chapter[]): { read: number; total: number } {
  return { read: chapters.filter(isRead).length, total: chapters.length };
}

/** Share of the book read, 0 to 1: finished chapters plus the scroll position in unfinished ones. */
export function bookProgress(book: Book, chapters: Chapter[]): number {
  if (book.shelf === 'finished') return 1;
  if (!chapters.length) return 0;
  const done = chapters.reduce((sum, c) => sum + (c.read ? 1 : Math.min(1, Math.max(0, c.position ?? 0))), 0);
  return done / chapters.length;
}

/** The chapter to open when I tap "Continue": the last one I was in, else the first unread one. */
export function continueChapter(book: Book, chapters: Chapter[]): Chapter | undefined {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const last = sorted.find((c) => c.id === book.lastChapterId);
  if (last && !last.read) return last;
  const after = last ? sorted.filter((c) => c.number > last.number) : sorted;
  return after.find((c) => !c.read) ?? sorted.find((c) => !c.read) ?? last ?? sorted[0];
}

export function nextChapterNumber(chapters: Chapter[]): number {
  return chapters.reduce((max, c) => Math.max(max, c.number), 0) + 1;
}

const CJK = /[㐀-鿿豈-﫿]/g;

/** Japanese kana and Korean hangul: counted by characters too, like Han. */
const KANA_HANGUL = /[\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g;

/**
 * Minutes to read a piece of text. Chinese characters are counted at about 400 a minute, Japanese kana and Korean
 * hangul at about 500, everything else by words (about 230 a minute).
 * `readFraction` is how much of it is already read.
 */
export function readingMinutes(text: string, readFraction = 0): number {
  const remaining = text.slice(Math.floor(text.length * Math.min(1, Math.max(0, readFraction))));
  const cjk = (remaining.match(CJK) ?? []).length;
  const kh = (remaining.match(KANA_HANGUL) ?? []).length;
  const words = remaining.replace(CJK, ' ').replace(KANA_HANGUL, ' ').split(/\s+/).filter(Boolean).length;
  return Math.ceil(cjk / 400 + kh / 500 + words / 230);
}

/** The same estimate from a character count, for lists that do not load the text. */
export function estimateMinutes(chars: number, language: BookLanguage, readFraction = 0): number {
  const left = chars * (1 - Math.min(1, Math.max(0, readFraction)));
  // About 400 Chinese or 500 Japanese and Korean characters a minute; English is about 230 words, roughly 1,300 characters.
  const source = language === 'zh' || language === 'ja' || language === 'ko' ? LANGUAGES[language].perMinute : 1300;
  return Math.ceil(left / source);
}

export function guessLanguage(text: string): BookLanguage {
  const sample = text.slice(0, 5000);
  const source = guessSource(sample);
  const letters = (sample.match(/[A-Za-z]/g) ?? []).length;
  if (source && sourceLetters(sample) > letters / 3) return source;
  return letters > 20 ? 'en' : 'other';
}

export interface Segment {
  text: string;
  start: number;
  /** Highlight note ids covering this piece of text. */
  noteIds: string[];
}

/**
 * Splits text into pieces so overlapping highlights can be drawn.
 * Highlights with bad offsets are ignored.
 */
export function segmentText(text: string, notes: Note[]): Segment[] {
  const marks = notes.filter(
    (n) =>
      n.kind === 'highlight' &&
      n.start !== undefined &&
      n.end !== undefined &&
      n.start >= 0 &&
      n.end <= text.length &&
      n.start < n.end,
  );
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) {
    cuts.add(m.start!);
    cuts.add(m.end!);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start === end) continue;
    segments.push({
      text: text.slice(start, end),
      start,
      noteIds: marks.filter((m) => m.start! <= start && m.end! >= end).map((m) => m.id),
    });
  }
  return segments;
}

/** Splits chapter text into paragraphs, keeping each paragraph's offset. */
export function paragraphs(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const re = /[^\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].trim()) out.push({ start: m.index, text: m[0] });
  }
  return out;
}

const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface Stats {
  totalMs: number;
  sessions: number;
  finishedThisYear: number;
  averageRating?: number;
  /** Days in a row with reading, ending today or yesterday. */
  streak: number;
  /** Minutes read on each of the last `days` days, oldest first. */
  daily: { day: number; minutes: number }[];
}

export function computeStats(books: Book[], sessions: Session[], now = Date.now(), days = 14): Stats {
  const today = startOfDay(now);
  const perDay = new Map<number, number>();
  for (const s of sessions) perDay.set(startOfDay(s.startedAt), (perDay.get(startOfDay(s.startedAt)) ?? 0) + s.ms);

  const daily = Array.from({ length: days }, (_, i) => {
    const day = today - (days - 1 - i) * DAY;
    const ms = perDay.get(day) ?? 0;
    // Any reading at all shows as at least one minute, so short days still get a bar.
    return { day, minutes: ms ? Math.max(1, Math.round(ms / 60_000)) : 0 };
  });

  let streak = 0;
  let cursor = perDay.has(today) ? today : today - DAY;
  while (perDay.has(cursor)) {
    streak++;
    cursor -= DAY;
  }

  const year = new Date(now).getFullYear();
  const rated = books.filter((b) => b.shelf === 'finished' && b.rating);
  return {
    totalMs: sessions.reduce((sum, s) => sum + s.ms, 0),
    sessions: sessions.length,
    finishedThisYear: books.filter((b) => b.finishedAt && new Date(b.finishedAt).getFullYear() === year).length,
    averageRating: rated.length ? rated.reduce((sum, b) => sum + b.rating!, 0) / rated.length : undefined,
    streak,
    daily,
  };
}

export function formatDuration(ms: number): string {
  if (ms > 0 && ms < 60_000) return '<1m';
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function formatDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The folder names used so far, A to Z. */
export function folderNames(notes: Note[]): string[] {
  return [...new Set(notes.map((n) => n.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
}


/** The word under a position in a text (Chinese and English words are found with the browser's word splitter). */
export function wordAt(text: string, offset: number, locale: string): string | undefined {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
  for (const s of segmenter.segment(text)) {
    if (offset >= s.index && offset < s.index + s.segment.length) return s.isWordLike ? s.segment : undefined;
  }
  return undefined;
}

/** Quotation marks around speech, in English or Chinese text. */
const QUOTE = /[“”"「」『』]/g;

/** For each character: true when it sits inside a quotation (someone is speaking, not named by the narrator). */
function insideQuotes(paragraph: string): boolean[] {
  const inside: boolean[] = [];
  let open = false;
  for (const ch of paragraph) {
    if ('“「『'.includes(ch)) open = true;
    else if ('”」』'.includes(ch)) open = false;
    else if (ch === '"') open = !open;
    inside.push(open);
  }
  return inside;
}

/** Verbs of speaking, right after a name: "Pu Yu said", or 普宇说 / 普宇问. */
const SPEECH_WORDS = 'said|says|asked|asks|replied|answered|whispered|murmured|shouted|called|cried|added|muttered|snapped|laughed|sighed|demanded|growled|yelled|continued|repeated|insisted|admitted|explained|sneered|scoffed|inquired|enquired|returned|remarked|pleaded|exclaimed|responded|declared|observed|retorted|protested|suggested|announced|roared|screamed|sobbed|begged|gasped|interrupted|warned|ordered|commanded|mumbled|grumbled|hissed|chuckled|groaned|stammered|stuttered|joked|teased|urged|wailed|howled|barked|breathed|spoke|went on';
const SPEECH_VERB = new RegExp(`\\b(${SPEECH_WORDS})\\b|说|问|答|喊|叫|笑道|低声|沉声|冷声`);

/** Speaking verbs that come before the name: "said Pu Yu". */
const SPEECH_VERB_BEFORE = new RegExp(`\\b(${SPEECH_WORDS})\\s*$`);
/** Words just before a name that make it someone listened to or looked at, not the one acting: "by Pu Yu's ear". */
const NOT_SUBJECT = /\b(by|to|at|toward|towards|behind|beside|near|with|from|for|of|on|in|into|and|than|like|saw|see|told|asked|watched|looked)\s+$/i;
/** Where a sentence starts in the narration: the paragraph start, or after . ! ? : ; a dash or a closing quote. */
const SENTENCE_START = /(^|[.!?:;—–。！？：；”」』"]\s*)$/;

export type Speaker = { id: string; names: string[] };

/**
 * The cast as possible speakers, each with every name they go by: English, original and other names. All of them
 * count whatever the text's language, because an English book still holds the original name in the glossary
 * (程实 for Cheng Shi); looking only for that one meant English lines never found a speaker.
 */
export function speakersFrom(people: { id: string; english: string; original: string; aliases?: string[] }[]): Speaker[] {
  return people.map((g) => ({
    id: g.id,
    names: [...new Set([g.english, g.original, ...(g.aliases ?? [])].map((n) => n?.trim() ?? ''))].filter((n) => n.length > 1 || /[^\x00-\x7f]/.test(n)),
  }));
}

/**
 * Who is speaking in a paragraph, worked out on this phone (nothing is sent anywhere). In order:
 * 1. a name with a speaking verb by a quotation mark ("Pu Yu said, “…”", "“…” said Pu Yu", 普宇说：“…”);
 * 2. otherwise, a name starting a sentence of the narration near the speech ("Chen Chong frowned. “Retreat!”"),
 *    the one closest to a quotation mark if there are several.
 * A name inside the speech, a name only listened to ("a voice by Pu Yu's ear"), and narration far from any speech
 * do not count. Lines with only "he said" have no name, so no speaker.
 */
export function speakerOf(paragraph: string, people: Speaker[], reach = 30, near = 100): string | undefined {
  const quotes = [...paragraph.matchAll(QUOTE)].map((m) => m.index ?? 0);
  if (!quotes.length) return undefined;
  const inside = insideQuotes(paragraph);
  const distance = (at: number, end: number) => Math.min(...quotes.map((q) => (q < at ? at - q : q > end ? q - end : 0)));
  let beat: { id: string; d: number } | undefined;
  for (const person of people) {
    for (const name of person.names) {
      if (!name) continue;
      for (let at = paragraph.indexOf(name); at >= 0; at = paragraph.indexOf(name, at + 1)) {
        if (inside[at]) continue;
        const end = at + name.length;
        // Part of a longer word ("Lin" in "Linda") is not the name.
        if (/^[A-Za-z]/.test(name) && (/[A-Za-z]$/.test(paragraph.slice(0, at)) || /^[A-Za-z]/.test(paragraph.slice(end)))) continue;
        const d = distance(at, end);
        const before = paragraph.slice(Math.max(0, at - 25), at);
        if (d <= reach && (SPEECH_VERB.test(paragraph.slice(end, end + 25)) || SPEECH_VERB_BEFORE.test(before))) return person.id;
        if (d <= near && SENTENCE_START.test(before) && !NOT_SUBJECT.test(before) && (!beat || d < beat.d)) beat = { id: person.id, d };
      }
    }
  }
  return beat?.id;
}

/** True when this name is the one speaking in the paragraph (see `speakerOf`). */
export function speaksAs(paragraph: string, name: string, reach = 30): boolean {
  return !!name && speakerOf(paragraph, [{ id: name, names: [name] }], reach) === name;
}

/** A possible speaker with the pronoun the story uses for them, for following a conversation (see `speakersOfChapter`). */
export type CastMember = Speaker & { gender?: Gender };

const VERBS = SPEECH_WORDS;
/** "he said", "she asked", "I replied", and the other way round: "said he". */
const PRONOUN_TAG = new RegExp(`\\b(he|she|I)\\s+(?:\\w+ly\\s+)?(?:${VERBS})\\b|\\b(?:${VERBS})\\s+(he|she|I)\\b`, 'i');
/** A sentence of narration starting with a pronoun: "He frowned.", "I shook my head." */
const PRONOUN_START = /(?:^|[.!?:;—–])\s*(He|She|I)\b(?!['’])/;
/** The same in Chinese: 他说 / 她冷声道 / 我问, or a sentence starting with 他, 她 or 我. */
const PRONOUN_ZH = /([他她我])(?:.{0,3}?)(?:说|问|答|喊|叫|道)|(?:^|[。！？：；”」』])\s*([他她我])/;

/** A speech tag naming nobody in the cast: "replied the little old woman", "a voice called", "said one of them". */
const UNNAMED_TAG = new RegExp(`\\b(?:${SPEECH_WORDS})\\s+(?:the|a|an|one|another|someone|somebody)\\b|\\b(?:the|a|an)\\s+(?:[a-z-]+\\s+){0,3}[a-z]+\\s+(?:${SPEECH_WORDS})\\b`);

/** Narration ending on someone unnamed starting to speak: "the china girl cried out:", "who asked, in her squeaky voice:". */
const UNNAMED_ACTOR = new RegExp(`(?:\\bthe\\s+(?:[a-z-]+\\s+){0,3}[a-z]+|\\bwho)\\s+(?:${SPEECH_WORDS})(?:\\s+out)?\\b[^.!?]*[:,]?\\s*$`);

/** The narration of a paragraph, with every quoted character blanked so positions still line up. */
function narrationOf(paragraph: string): string {
  const inside = insideQuotes(paragraph);
  return [...paragraph].map((ch, i) => (inside[i] || '“”"「」『』'.includes(ch) ? ' ' : ch)).join('');
}

function pronounIn(narration: string): { who: 'he' | 'she' | 'I'; at: number } | undefined {
  const norm = (w: string) => (w === '他' ? 'he' : w === '她' ? 'she' : w === '我' || w.toLowerCase() === 'i' ? 'I' : (w.toLowerCase() as 'he' | 'she'));
  const tag = narration.match(PRONOUN_TAG);
  if (tag) return { who: norm(tag[1] ?? tag[2]), at: tag.index ?? 0 };
  const zh = narration.match(PRONOUN_ZH);
  if (zh) return { who: norm(zh[1] ?? zh[2]), at: zh.index ?? 0 };
  const start = narration.match(PRONOUN_START);
  if (start) return { who: norm(start[1]), at: start.index ?? 0 };
  return undefined;
}

/** Where each person of the cast is named in a stretch of narration, in order. */
function mentionsIn(narration: string, cast: CastMember[]): { id: string; at: number; start: boolean }[] {
  const found: { id: string; at: number; start: boolean }[] = [];
  for (const person of cast) {
    for (const name of person.names) {
      if (!name) continue;
      for (let at = narration.indexOf(name); at >= 0; at = narration.indexOf(name, at + 1)) {
        const end = at + name.length;
        if (/^[A-Za-z]/.test(name) && (/[A-Za-z]$/.test(narration.slice(0, at)) || /^[A-Za-z]/.test(narration.slice(end)))) continue;
        const before = narration.slice(Math.max(0, at - 25), at);
        found.push({ id: person.id, at, start: SENTENCE_START.test(before) && !NOT_SUBJECT.test(before) });
      }
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/**
 * Who speaks each paragraph of a chapter, following the conversation (worked out on this phone; nothing is sent).
 * `speakerOf` reads one paragraph alone and only finds a name next to the speech, about 4 lines in 10. Read in order,
 * the chapter gives more:
 * 1. a name by the speech (`speakerOf`);
 * 2. "he said", "She frowned. “…”": the last person of that gender named before it;
 * 3. "I said": the book's narrator, when the reader has said who "I" is;
 * 4. a line with no tag right after narration about one person ("Hu Yu set down the cup." then "“Let's go.”"): that person;
 * 5. a line with no tag in a back-and-forth: the other one of the two people talking.
 * A paragraph without speech, or one nothing points to, gets undefined: no face rather than a wrong one.
 */
export function speakersOfChapter(paras: string[], cast: CastMember[], narrator?: string, otherNames: string[] = []): (string | undefined)[] {
  const gender = new Map(cast.map((c) => [c.id, c.gender]));
  // Every name the glossary knows (people, places, groups); a capitalised name outside it is a stranger.
  const known = new Set([...cast.flatMap((c) => c.names), ...otherNames].flatMap((n) => [n, n.replace(/^the\s+/i, '')]).map((n) => n.toLowerCase()));
  const strangerIn = (text: string) =>
    [...text.matchAll(/\b[A-Z][a-z]+(?:[\s-]+(?:of\s+the\s+)?[A-Z][a-z]+)*/g)].some((m) => {
      // A capital at the start of a sentence says nothing.
      if (/(^|[.!?;:—])\s*$/.test(text.slice(0, m.index))) return false;
      return !known.has(m[0].toLowerCase()) && !/^(I|Mr|Mrs|Miss|Sir|Lady|Lord)$/.test(m[0]);
    });
  let prevNarration = '';
  // Who was named in each paragraph so far (narration and speakers), for "he" and "she".
  const namedIn: string[][] = [];
  // The last two people speaking, while a conversation goes on.
  let talk: string[] = [];
  let prevWho: string | undefined;
  let prevDialogue = false;
  let prevOpen = false;
  // The person a narration paragraph just before was about.
  let actor: string | undefined;
  const out: (string | undefined)[] = [];

  /** "he" or "she": someone named earlier in this paragraph, else the one of the two talking, else someone named
   *  in the last few paragraphs, and only when exactly one person fits. */
  const resolve = (g: 'he' | 'she', before: string[]): string | undefined => {
    const fits = (id: string) => gender.get(id) === g;
    const here = before.filter(fits);
    if (here.length) return here[here.length - 1];
    const inTalk = talk.filter(fits);
    if (inTalk.length === 1) return inTalk[0];
    if (inTalk.length === 2 && prevDialogue) return inTalk.find((id) => id !== prevWho);
    const recent = [...new Set(namedIn.slice(-3).flat().filter(fits))];
    return recent.length === 1 ? recent[0] : undefined;
  };

  for (const paragraph of paras) {
    const narration = narrationOf(paragraph);
    const mentions = mentionsIn(narration, cast);
    const hasSpeech = paragraph.search(QUOTE) >= 0;
    let who: string | undefined;

    if (hasSpeech && prevOpen && /^\s*[“"「『]/.test(paragraph)) {
      // A speech running on: the paragraph before ended without closing its quotation, so the same person goes on.
      who = prevWho;
    } else if (hasSpeech) {
      who = speakerOf(paragraph, cast);
      if (!who) {
        const p = pronounIn(narration);
        // A capitalised name the cast does not know, before the pronoun: someone else (Boq, the Monkey King) is acting.
        const stranger = p && (strangerIn(narration.slice(0, p.at)) || strangerIn(prevNarration));
        // "replied the little old woman", "a voice called": someone the cast does not hold is talking.
        const unnamed = UNNAMED_TAG.test(narration);
        // The pronoun belongs to the speech only when it is close to it, as for names in `speakerOf`.
        const close = p && Math.min(...[...paragraph.matchAll(QUOTE)].map((m) => Math.abs((m.index ?? 0) - p.at))) <= 100;
        if (unnamed || (p && !close)) who = undefined;
        else if (p?.who === 'I') who = narrator;
        else if (p && !stranger) who = resolve(p.who, mentions.filter((m) => m.at < p.at && m.start).map((m) => m.id));
        else if (!p && !/[A-Za-z\u4e00-\u9fff]{3}/.test(narration)) {
          // Speech alone.
          if (actor && !prevDialogue) who = strangerIn(prevNarration) || UNNAMED_TAG.test(prevNarration) || UNNAMED_ACTOR.test(prevNarration) ? undefined : actor;
          else if (prevDialogue && talk.length === 2) who = talk.find((id) => id !== prevWho);
        }
      }
    }

    out.push(who);
    namedIn.push([...mentions.map((m) => m.id), ...(who ? [who] : [])]);
    if (hasSpeech) {
      if (who) talk = talk.length && talk[talk.length - 1] === who ? talk : [...talk.filter((id) => id !== who), who].slice(-2);
      // A line nobody could be found for ends the back-and-forth: guessing on would only drift.
      else talk = [];
      prevDialogue = !!who;
      prevWho = who;
      prevNarration = '';
      prevOpen = (paragraph.match(/[“「『]/g) ?? []).length > (paragraph.match(/[”」』]/g) ?? []).length;
      actor = undefined;
    } else if (narration.trim()) {
      // Narration: who it is about, for speech right after it. A long stretch ends the conversation.
      const subjects = mentions.filter((m) => m.start);
      const p = pronounIn(narration);
      actor = subjects.length ? subjects[subjects.length - 1].id : p?.who === 'I' ? narrator : p ? resolve(p.who, []) : undefined;
      if (paragraph.length > 300 || !actor) talk = [];
      prevDialogue = false;
      prevOpen = false;
      prevWho = undefined;
      prevNarration = narration;
    }
  }
  return out;
}

/** A chapter's title to show: the English one when the book is translated and it has one, else the original. */
export function titleOf(c: { title: string; titleEn?: string }): string {
  return c.titleEn || c.title;
}
