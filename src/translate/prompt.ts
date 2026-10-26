import type { Gender, GlossaryEntry, GlossaryKind, ModelOption } from '../types';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** Marks where the translation ends and the list of new names begins in the model's reply. */
export const NEW_TERMS = '===NEW TERMS===';
/** Marks the short story-so-far summary, written after the translation and before the new names. */
export const SUMMARY = '===SUMMARY===';

function glossaryLines(entries: GlossaryEntry[]): string {
  return entries
    .map((g) => {
      const parts = [`${g.original} = ${g.english}`];
      if (g.kind === 'person' && g.gender) parts.push(`(${g.gender})`);
      else if (g.kind !== 'person') parts.push(`(${g.kind})`);
      if (g.note) parts.push(`- ${g.note}`);
      return parts.join(' ');
    })
    .join('\n');
}

/**
 * Instructions for translating one chapter. Only approved glossary entries are used:
 * proposals waiting for review must not spread through the book.
 */
export function chapterMessages(input: {
  bookTitle: string;
  chapterTitle: string;
  text: string;
  glossary: GlossaryEntry[];
  /** The story so far, from the last translated chapter before this one. */
  previousSummary?: string;
}): ChatMessage[] {
  const approved = input.glossary.filter((g) => g.status === 'ok');
  const system = [
    'You translate Chinese web novels into natural, readable English for a single reader.',
    'Rules:',
    '- Translate everything. Do not summarize, skip, shorten or add anything.',
    '- Keep the paragraph breaks: one paragraph of the original becomes one paragraph in English, separated by a blank line.',
    '- Use the glossary exactly for every name and term in it. Use each person\'s pronouns as given.',
    '- Keep the tone of the original. Dialogue should sound like real speech.',
    '- Output only the translation, with no notes, no title line and no commentary.',
    `- After the translation, write a line "${SUMMARY}" and then the story so far in English: 3 to 6 sentences covering`,
    '  who is who, what has happened, and where things stand at the end of this chapter. Update the earlier summary given in the message',
    '  with this chapter. Keep it under 200 words: compress older events, keep names and the current situation.',
    `- Then write a line "${NEW_TERMS}" and then one JSON object per line for each name or plot term`,
    '  that is NOT in the glossary: {"original": "...", "english": "...", "kind": "person|place|term", "gender": "he|she|they|it"}.',
    '  Only three kinds: character names (person), place names (place), and terms invented or specific to this novel\'s world (term).',
    '  Never ordinary words, common phrases, English words, titles of rank that are common vocabulary, or anything already in the glossary.',
    '  "original" is the Chinese text from the chapter. Give gender only for people. If there are none, write the marker line and nothing after it.',
  ].join('\n');
  const user = [
    `Book: ${input.bookTitle}`,
    `Chapter: ${input.chapterTitle}`,
    approved.length ? `Glossary:\n${glossaryLines(approved)}` : 'Glossary: (empty)',
    input.previousSummary ? `Story so far (before this chapter):\n${input.previousSummary}` : 'Story so far: (this is the start of the book)',
    '',
    'Text to translate:',
    input.text,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Instructions for building a glossary from the first chapters. */
export function glossaryScanMessages(input: { bookTitle: string; sample: string; known: GlossaryEntry[] }): ChatMessage[] {
  const system = [
    'You prepare a glossary for translating a Chinese novel into English.',
    'List only three kinds of entry: character names (person), place names (place), and terms that are new to this novel\'s world (term),',
    'such as invented techniques, sects, realms or items that the story explains or uses as its own vocabulary.',
    'Skip everything else: ordinary words, common phrases, slang, English words, common titles of rank, and anything that is not a name or a novel-specific term.',
    'The "original" must be the Chinese text as written.',
    'For each, give the original, a natural English rendering (pinyin for personal names, meaning-based for most terms),',
    'the kind (person, place or term) and, for people, the gender as he, she, they or it, judged from the text.',
    'Answer with one JSON object per line and nothing else:',
    '{"original": "...", "english": "...", "kind": "person|place|term", "gender": "he|she|they|it", "note": "short optional note"}',
  ].join('\n');
  const known = input.known.length ? `Already in the glossary (skip these): ${input.known.map((g) => g.original).join(', ')}\n\n` : '';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Book: ${input.bookTitle}\n\n${known}Text:\n${input.sample}` },
  ];
}

export interface ProposedTerm {
  original: string;
  english: string;
  kind: GlossaryKind;
  gender?: Gender;
  note?: string;
}

const KINDS: GlossaryKind[] = ['person', 'place', 'term'];
const GENDERS: Gender[] = ['he', 'she', 'they', 'it'];

/** Reads "one JSON object per line"; skips anything that is not a usable entry. */
export function parseTerms(raw: string): ProposedTerm[] {
  const out: ProposedTerm[] = [];
  const seen = new Set<string>();
  for (const line of raw.split('\n')) {
    const t = line.trim().replace(/^[-*]\s*/, '').replace(/,$/, '');
    if (!t.startsWith('{')) continue;
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      const original = String(o.original ?? '').trim();
      const english = String(o.english ?? '').trim();
      // A term must come from the Chinese text: English words in the list are never kept.
      if (!original || !english || seen.has(original) || !/[㐀-鿿豈-﫿]/.test(original)) continue;
      const kind = KINDS.includes(o.kind as GlossaryKind) ? (o.kind as GlossaryKind) : 'term';
      const gender = kind === 'person' && GENDERS.includes(o.gender as Gender) ? (o.gender as Gender) : undefined;
      const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : undefined;
      seen.add(original);
      out.push({ original, english, kind, gender, note });
    } catch {
      // Not JSON: ignore the line.
    }
  }
  return out;
}

/** Splits the model's reply into the translation and the proposed new terms. */
const REFUSAL = /^\s*(i can(?:not|'t)|i won(?:'|’)t|i am (?:unable|not able)|i'm (?:unable|not able)|sorry,? (?:but )?i (?:can|cannot|won)|the (?:provided )?text is already in english)/i;

/** True when the model answered with a refusal instead of a translation (no text should be saved). */
export function isRefusal(reply: string): boolean {
  return REFUSAL.test(reply.trim().slice(0, 200));
}

export function splitReply(reply: string): { text: string; terms: ProposedTerm[]; summary?: string } {
  const at = reply.indexOf(NEW_TERMS);
  const beforeTerms = at >= 0 ? reply.slice(0, at) : reply;
  const terms = at >= 0 ? parseTerms(reply.slice(at + NEW_TERMS.length)) : [];
  const marker = beforeTerms.indexOf(SUMMARY);
  const body = marker >= 0 ? beforeTerms.slice(0, marker) : beforeTerms;
  const summary = marker >= 0 ? beforeTerms.slice(marker + SUMMARY.length).trim() : '';
  // Normalise paragraph breaks to the blank-line form the reader expects.
  const text = body
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');
  return { text, terms, summary: summary || undefined };
}

const CJK = /[㐀-鿿豈-﫿]/g;

/** Rough token counts for a cost estimate before anything is sent. */
export function estimateTokens(text: string, glossaryCount = 0): { input: number; output: number } {
  const cjk = (text.match(CJK) ?? []).length;
  const other = text.length - cjk;
  // About one token per Chinese character, plus the instructions and the glossary.
  const input = Math.round(cjk * 1.1 + other / 4 + 450 + glossaryCount * 12);
  // English comes out a little shorter in tokens than the Chinese characters going in.
  // The story-so-far summary adds about 200 tokens of output per chapter.
  const output = Math.round(cjk * 0.9 + other / 4 + 60 + 200);
  return { input, output };
}

export function costOf(model: ModelOption | undefined, input: number, output: number): number | undefined {
  if (!model || model.inputPrice === undefined || model.outputPrice === undefined) return undefined;
  return (input * model.inputPrice + output * model.outputPrice) / 1_000_000;
}

export function formatCost(dollars?: number): string {
  if (dollars === undefined) return 'price not set';
  // Under a dollar, cents read better than "$0.01".
  if (dollars < 0.1) return `${(dollars * 100).toFixed(2)}¢`;
  if (dollars < 1) return `${(dollars * 100).toFixed(1)}¢`;
  return `$${dollars.toFixed(2)}`;
}

const PRONOUNS: Record<'he' | 'she', RegExp> = {
  he: /\b(he|him|his|himself)\b/gi,
  she: /\b(she|her|hers|herself)\b/gi,
};

/**
 * Flags people whose pronouns look wrong: in paragraphs that mention only that one person,
 * the opposite pronouns clearly outnumber the right ones.
 */
export function pronounWarnings(text: string, glossary: GlossaryEntry[]): string[] {
  const people = glossary.filter((g) => g.kind === 'person' && (g.gender === 'he' || g.gender === 'she'));
  const paragraphs = text.split(/\n\s*\n/);
  const warnings: string[] = [];
  for (const person of people) {
    let right = 0;
    let wrong = 0;
    const other = person.gender === 'he' ? 'she' : 'he';
    for (const p of paragraphs) {
      const mentioned = people.filter((x) => p.includes(x.english));
      if (mentioned.length !== 1 || mentioned[0] !== person) continue;
      right += (p.match(PRONOUNS[person.gender as 'he' | 'she']) ?? []).length;
      wrong += (p.match(PRONOUNS[other]) ?? []).length;
    }
    if (wrong >= 2 && wrong > right) {
      warnings.push(`${person.english} is "${person.gender}" in the glossary, but this chapter mostly says "${other}".`);
    }
  }
  return warnings;
}

/** Instructions for translating a book title (and author name) into English. */
export function titleMessages(title: string, author?: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You translate Chinese book titles into natural English, the way an English publisher would title the book. ' +
        'Reply with only the English title on one line: no quotes, no notes, no original text.',
    },
    { role: 'user', content: author ? `Title: ${title}\nAuthor: ${author}` : `Title: ${title}` },
  ];
}

/** Takes the first real line of the reply and strips quotes and labels. */
export function cleanTitle(reply: string): string {
  const line = reply.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line
    .replace(/^(english\s+)?title\s*[:：]\s*/i, '')
    .replace(/^["'“”‘’《「『]+|["'“”‘’》」』]+$/g, '')
    .trim();
}
