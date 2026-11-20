import { isRead } from '../logic';
import type { Book, Chapter, GlossaryEntry, Note, ProfileFact, WorldEvent, WorldLink } from '../types';

/**
 * The Living Book's one rule: show nothing past the reading line.
 *
 * The reading line is the furthest chapter I have reached: the highest chapter marked read, or the chapter I am in,
 * whichever is later. Everything shown in the world carries a chapter number and is hidden past that line.
 * - My own lines, links and events always show (I wrote them, so they are not spoilers to me).
 * - Safe guide links (setup facts, not twists) show once both ends are met; links are only kept when both ends show.
 * - Guide items with no chapter show only when the book's "Show the guide's spoilers" is on (`book.worldSpoilers`).
 * - Anything else with no chapter is hidden, including an entry's note, other names and picture description.
 * Every screen of the world reads through `worldAt`, so this file is the only place the rule lives.
 */

export function readingLine(book: Pick<Book, 'lastChapterId' | 'startLine'>, chapters: Chapter[]): number {
  // A book that carries on from another (copied world, starting at chapter 521) counts what came before as read.
  let line = book.startLine ?? 0;
  for (const c of chapters) if (isRead(c) && c.number > line) line = c.number;
  const current = chapters.find((c) => c.id === book.lastChapterId);
  if (current && current.number > line) line = current.number;
  return line;
}

export interface WorldOptions {
  line: number;
  /** Show guide items that have no chapter. */
  spoilers: boolean;
}

/** Whether something with this chapter and these marks may be shown. */
export function allowed(item: { chapter?: number; mine?: boolean; guide?: boolean; safe?: boolean }, o: WorldOptions): boolean {
  if (item.mine) return true;
  if (item.chapter !== undefined) return item.chapter <= o.line;
  return !!item.safe || (!!item.guide && o.spoilers);
}

const facts = (list: ProfileFact[] | undefined, o: WorldOptions) => (list ?? []).filter((f) => allowed(f, o));

/** An entry as the world shows it at the line: only the facts that are allowed, and when it first appeared. */
export interface WorldEntry extends GlossaryEntry {
  /** The chapter it is first named in, when known. */
  firstChapter?: number;
}

/** The current link for a pair, with the earlier ones (oldest first) for its history. */
export interface WorldPair {
  from: string;
  to: string;
  current: WorldLink;
  history: WorldLink[];
}

export interface WorldAt {
  line: number;
  entries: WorldEntry[];
  pairs: WorldPair[];
  events: WorldEvent[];
  /** My highlights and chapter comments, with the chapter number each belongs to. */
  notes: (Note & { chapter: number })[];
  /** Places by the place they are inside (only places that are shown); top-level places under ''. */
  placesWithin: Map<string, string[]>;
}

/**
 * Whether an entry is in the world at the line: it was first named at or before the line, or it has a fact the line
 * allows (my own lines count). Guide-only entries never named in the text show only with spoilers on.
 */
function entryShown(g: GlossaryEntry, first: number | undefined, o: WorldOptions): boolean {
  if (first !== undefined && first <= o.line) return true;
  const p = g.profile;
  const all = [...(p?.about ?? []), ...(p?.powers ?? []), ...(p?.status ?? []), ...(p?.quote ? [p.quote] : [])];
  if (all.some((f) => f.mine || (f.chapter !== undefined && f.chapter <= o.line))) return true;
  return o.spoilers && g.status === 'ok';
}

export function worldAt(
  data: { entries: GlossaryEntry[]; links: WorldLink[]; events: WorldEvent[]; notes: Note[]; chapters: Chapter[]; firstSeen: Map<string, number> },
  o: WorldOptions,
): WorldAt {
  const entries: WorldEntry[] = data.entries
    .filter((g) => g.status === 'ok' && entryShown(g, data.firstSeen.get(g.id), o))
    .map((g) => {
      const p = g.profile;
      const profile = p
        ? {
            ...p,
            looks: facts(p.looks, o),
            about: facts(p.about, o),
            powers: facts(p.powers, o),
            status: facts(p.status, o),
            quote: p.quote && allowed(p.quote, o) ? p.quote : undefined,
          }
        : undefined;
      // A note, other names and a picture description carry no chapter and can give a twist away
      // ("Mother Tree of Fear"), so they show only with spoilers on.
      const hidden = o.spoilers ? {} : { note: undefined, aliases: undefined, look: undefined };
      return { ...g, ...hidden, profile, firstChapter: data.firstSeen.get(g.id) };
    });
  const shown = new Set(entries.map((g) => g.id));

  // Links: both ends shown, and the link allowed. The newest allowed link of a pair is its current one.
  const byPair = new Map<string, WorldLink[]>();
  for (const l of data.links) {
    if (!shown.has(l.from) || !shown.has(l.to) || l.from === l.to || !allowed(l, o)) continue;
    const key = `${l.from}\u0000${l.to}`;
    byPair.set(key, [...(byPair.get(key) ?? []), l]);
  }
  const when = (l: WorldLink) => l.chapter ?? (l.mine ? Number.MAX_SAFE_INTEGER : -1);
  const pairs: WorldPair[] = [...byPair.values()].map((list) => {
    const sorted = [...list].sort((a, b) => when(a) - when(b) || a.createdAt - b.createdAt);
    return { from: sorted[0].from, to: sorted[0].to, current: sorted[sorted.length - 1], history: sorted.slice(0, -1) };
  });

  // Events: allowed, with names past the line taken out (an event never names someone not met yet).
  const events = data.events
    .filter((e) => allowed(e, o))
    .map((e) => ({ ...e, who: e.who?.filter((id) => shown.has(id)), where: e.where && shown.has(e.where) ? e.where : undefined }))
    .sort((a, b) => (a.chapter ?? -1) - (b.chapter ?? -1) || a.createdAt - b.createdAt);

  const numberOf = new Map(data.chapters.map((c) => [c.id, c.number]));
  const notes = data.notes
    .map((n) => ({ ...n, chapter: numberOf.get(n.chapterId) ?? Number.MAX_SAFE_INTEGER }))
    .filter((n) => n.chapter <= o.line)
    .sort((a, b) => a.chapter - b.chapter || a.createdAt - b.createdAt);

  const placesWithin = new Map<string, string[]>();
  for (const g of entries) {
    if (g.kind !== 'place') continue;
    const parent = g.within && shown.has(g.within) ? g.within : '';
    placesWithin.set(parent, [...(placesWithin.get(parent) ?? []), g.id]);
  }

  return { line: o.line, entries, pairs, events, notes, placesWithin };
}
