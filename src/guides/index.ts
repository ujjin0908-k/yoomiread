import { db } from '../db';
import { newId } from '../logic';
import { namesOf } from '../translate/profiles';
import type { Book, CharacterProfile, GlossaryEntry, GlossaryKind, ProfileFact } from '../types';
import type { Guide, GuideEntry } from './types';

export type { Guide, GuideEntry } from './types';

/** Guides that come with the app, by book. Loaded only when asked for, so the app stays small. */
const BUILT_IN: { titles: string[]; load: () => Promise<Guide> }[] = [
  {
    titles: ['foolish game of the gods', 'the foolish game of gods', 'foolish game of gods', "gods' foolish play", '诸神愚戏', '諸神愚戲', 'zhu shen yu xi'],
    load: async () => (await import('./foolish-game')).FOOLISH_GAME,
  },
];

const plainTitle = (t: string) => t.toLowerCase().replace(/[“”"'‘’]/g, "'").replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();

/** The built-in guide for this book, if there is one. */
export function guideFor(book: Book): (() => Promise<Guide>) | undefined {
  const mine = [book.title, book.originalTitle ?? ''].map(plainTitle).filter(Boolean);
  return BUILT_IN.find((g) => g.titles.some((t) => mine.includes(plainTitle(t))))?.load;
}

const KINDS: GlossaryKind[] = ['person', 'place', 'god', 'group', 'term'];
const squash = (s: string) => s.toLowerCase().replace(/[“”"'‘’「」『』]/g, '').replace(/\s+/g, ' ').trim();

/** Reads a guide file. Throws with a plain message when it is not one. */
export function parseGuide(text: string): Guide {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not a guide (it is not JSON).');
  }
  const r = raw as Partial<Guide>;
  if (!r || !Array.isArray(r.entries)) throw new Error('That file is not a guide: it has no "entries" list.');
  const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : undefined);
  const entries: GuideEntry[] = r.entries
    .map((e) => e as Partial<GuideEntry>)
    .filter((e) => typeof e.english === 'string' && e.english.trim())
    .map((e) => ({
      english: e.english!.trim(),
      original: typeof e.original === 'string' && e.original.trim() ? e.original.trim() : e.english!.trim(),
      kind: KINDS.includes(e.kind as GlossaryKind) ? (e.kind as GlossaryKind) : 'term',
      aliases: strings(e.aliases),
      gender: ['he', 'she', 'they', 'it'].includes(String(e.gender)) ? e.gender : undefined,
      role: e.role === 'main' || e.role === 'side' ? e.role : undefined,
      note: typeof e.note === 'string' ? e.note.trim() || undefined : undefined,
      about: strings(e.about),
      powers: strings(e.powers),
      status: strings(e.status),
    }));
  return { book: String(r.book ?? 'Imported guide'), titles: strings(r.titles) ?? [], entries };
}

/** Adds lines from the guide that are not there yet. Guide lines are kept by later updates, like the owner's own. */
function addGuideLines(have: ProfileFact[] = [], lines: string[] = []): ProfileFact[] {
  const seen = new Set(have.map((f) => squash(f.text)));
  const out = [...have];
  for (const text of lines) {
    if (seen.has(squash(text))) continue;
    seen.add(squash(text));
    out.push({ text, guide: true });
  }
  return out;
}

/**
 * Fills in the book's glossary from a guide. A name already there (by any of its names) keeps everything it has and
 * gains the guide's other names, note, pronouns and lines; a new name is added as approved. Nothing is sent anywhere.
 */
export async function applyGuide(bookId: string, guide: Guide, now = Date.now()): Promise<{ added: number; filled: number }> {
  const all = (await db.glossary.where('bookId').equals(bookId).toArray()) as GlossaryEntry[];
  for (const fix of guide.fixes ?? []) {
    for (const g of all.filter((x) => x.kind === fix.kind && squash(x.english) === squash(fix.english))) {
      const drop = new Set((fix.removeAliases ?? []).map(squash));
      const change = { original: fix.original ?? g.original, aliases: g.aliases?.filter((a) => !drop.has(squash(a))), updatedAt: now };
      await db.glossary.update(g.id, change);
      Object.assign(g, change);
    }
  }
  let added = 0;
  let filled = 0;
  const fresh: GlossaryEntry[] = [];
  for (const e of guide.entries) {
    const names = [e.english, e.original, ...(e.aliases ?? [])].map(squash);
    // Same kind first (a god "Chaos" and the path of Chaos are different things), then any person by name.
    const match =
      [...all, ...fresh].find((g) => g.kind === e.kind && namesOf(g).some((n) => names.includes(squash(n)))) ??
      (e.kind === 'person' ? undefined : [...all, ...fresh].find((g) => g.kind === 'term' && g.status === 'review' && namesOf(g).some((n) => names.includes(squash(n)))));
    // An old-style profile (looks and scene-by-scene lines) is settled by the guide instead of a paid rebuild:
    // its old lines go, the owner's lines, one-liner, quote and chapter mark stay.
    const settle = (base?: CharacterProfile): CharacterProfile | undefined =>
      !base || base.v === 2
        ? base
        : { ...base, looks: base.looks.filter((f) => f.mine), about: base.about.filter((f) => f.mine || f.guide), powers: base.powers ?? [], status: base.status ?? [], v: 2 };
    const profileFrom = (old?: CharacterProfile): CharacterProfile => {
      const base = settle(old);
      return {
        looks: base?.looks ?? [],
        ...base,
        about: addGuideLines(base?.about, e.about),
        powers: addGuideLines(base?.powers, e.powers),
        status: addGuideLines(base?.status, e.status),
        v: 2,
      };
    };
    if (match) {
      const aliases = [...new Set([...(match.aliases ?? []), ...(e.aliases ?? []), e.english].filter((a) => !namesOf(match).some((n) => squash(n) === squash(a))))];
      const change: Partial<GlossaryEntry> = {
        aliases: aliases.length ? [...(match.aliases ?? []), ...aliases.filter((a) => !(match.aliases ?? []).includes(a))] : match.aliases,
        note: match.note || e.note,
        gender: match.gender ?? (e.kind === 'person' ? e.gender : undefined),
        role: match.role ?? e.role,
        kind: e.kind,
        status: 'ok',
        profile: profileFrom(match.profile),
        updatedAt: now,
      };
      await db.glossary.update(match.id, change);
      Object.assign(match, change);
      filled++;
    } else {
      const row: GlossaryEntry = {
        id: newId(),
        bookId,
        original: e.original,
        english: e.english,
        kind: e.kind,
        aliases: e.aliases?.length ? e.aliases : undefined,
        gender: e.kind === 'person' ? e.gender : undefined,
        role: e.kind === 'person' ? (e.role ?? 'side') : undefined,
        note: e.note,
        profile: profileFrom(undefined),
        locked: false,
        status: 'ok',
        createdAt: now,
        updatedAt: now,
      };
      fresh.push(row);
      added++;
    }
  }
  if (fresh.length) await db.glossary.bulkAdd(fresh);
  return { added, filled };
}
