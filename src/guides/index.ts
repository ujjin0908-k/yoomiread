import { db } from '../db';
import { newId } from '../logic';
import { namesOf } from '../translate/profiles';
import type { Book, CharacterProfile, GlossaryEntry, GlossaryKind, ProfileFact, WorldEvent, WorldLink } from '../types';
import type { Guide, GuideEntry, GuideEvent, GuideLink } from './types';

export type { Guide, GuideEntry, GuideEvent, GuideLink } from './types';

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
      look: typeof e.look === 'string' ? e.look.trim() || undefined : undefined,
      within: typeof e.within === 'string' ? e.within.trim() || undefined : undefined,
    }));
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const chapter = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);
  const links: GuideLink[] = (Array.isArray(r.links) ? r.links : [])
    .map((l) => l as Partial<GuideLink>)
    .filter((l) => str(l.from) && str(l.to) && str(l.label))
    .map((l) => ({ from: str(l.from)!, to: str(l.to)!, label: str(l.label)!, chapter: chapter(l.chapter), safe: l.safe === true || undefined }));
  const events: GuideEvent[] = (Array.isArray(r.events) ? r.events : [])
    .map((e) => e as Partial<GuideEvent>)
    .filter((e) => str(e.title))
    .map((e) => ({ title: str(e.title)!, chapter: chapter(e.chapter), detail: str(e.detail), who: strings(e.who), where: str(e.where), arc: str(e.arc) }));
  return {
    book: String(r.book ?? 'Imported guide'),
    titles: strings(r.titles) ?? [],
    entries,
    style: typeof r.style === 'string' ? r.style.trim() || undefined : undefined,
    links: links.length ? links : undefined,
    events: events.length ? events : undefined,
  };
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
        look: match.look || e.look,
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
        look: e.look,
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
  await applyGuideWorld(bookId, guide, [...all, ...fresh], now);
  // The guide's art style, unless the owner set one.
  if (guide.style) {
    const book = await db.books.get(bookId);
    if (book && !book.artStyle) await db.books.update(bookId, { artStyle: guide.style });
  }
  return { added, filled };
}

/**
 * The Living Book part of a guide: places nested in places, links and events. Names are found by any of an entry's
 * names. Something already there (same pair and label, or same event title) is not added twice; a place already
 * nested keeps its place; the owner's own links and events are never touched. Returns how many were added.
 */
export async function applyGuideWorld(bookId: string, guide: Guide, entries: GlossaryEntry[], now = Date.now()): Promise<{ links: number; events: number }> {
  const byName = new Map<string, GlossaryEntry>();
  // Shorter lists first, so an exact English name wins over someone else's other name.
  for (const g of entries) for (const n of namesOf(g)) if (!byName.has(squash(n))) byName.set(squash(n), g);
  for (const g of entries) byName.set(squash(g.english), g);
  const find = (name?: string) => (name ? byName.get(squash(name)) : undefined);

  for (const e of guide.entries) {
    if (e.kind !== 'place' || !e.within) continue;
    const place = entries.find((g) => g.kind === 'place' && squash(g.english) === squash(e.english));
    const parent = find(e.within);
    if (place && parent && parent.kind === 'place' && parent.id !== place.id && !place.within) {
      await db.glossary.update(place.id, { within: parent.id, updatedAt: now });
      place.within = parent.id;
    }
  }

  const haveLinks = await db.worldLinks.where('bookId').equals(bookId).toArray();
  const linkKey = (from: string, to: string, label: string) => `${from}|${to}|${squash(label)}`;
  const seenLinks = new Set(haveLinks.map((l) => linkKey(l.from, l.to, l.label)));
  const newLinks: WorldLink[] = [];
  for (const l of guide.links ?? []) {
    const from = find(l.from);
    const to = find(l.to);
    if (!from || !to || from.id === to.id) continue;
    const key = linkKey(from.id, to.id, l.label);
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    newLinks.push({ id: newId(), bookId, from: from.id, to: to.id, label: l.label, chapter: l.chapter, guide: true, safe: l.safe, createdAt: now });
  }
  if (newLinks.length) await db.worldLinks.bulkAdd(newLinks);

  const haveEvents = await db.worldEvents.where('bookId').equals(bookId).toArray();
  const seenEvents = new Set(haveEvents.map((e) => squash(e.title)));
  const newEvents: WorldEvent[] = [];
  for (const e of guide.events ?? []) {
    if (seenEvents.has(squash(e.title))) continue;
    seenEvents.add(squash(e.title));
    const who = (e.who ?? []).map(find).filter((g): g is GlossaryEntry => !!g).map((g) => g.id);
    newEvents.push({
      id: newId(),
      bookId,
      chapter: e.chapter,
      title: e.title,
      detail: e.detail,
      who: who.length ? who : undefined,
      where: find(e.where)?.id,
      arc: e.arc,
      guide: true,
      createdAt: now,
    });
  }
  if (newEvents.length) await db.worldEvents.bulkAdd(newEvents);
  return { links: newLinks.length, events: newEvents.length };
}
