import type { Note, WorldEvent } from '../types';
import type { WorldAt, WorldEntry } from './visible';

/**
 * The timeline: what happened, chapter by chapter, up to my reading line. Three kinds of rows share it:
 * events (from a guide, a story scan, or written by me), first appearances (found free in the text, so the timeline is
 * never empty), and my own highlights and chapter comments, so it is also my journal of the book.
 */
export type TimelineRow =
  | { kind: 'event'; chapter: number; event: WorldEvent }
  | { kind: 'arrivals'; chapter: number; entries: WorldEntry[] }
  | { kind: 'note'; chapter: number; note: Note & { chapter: number } };

export interface TimelineSection {
  /** The arc's name, or a range of chapters when the book has no arcs. */
  title: string;
  from: number;
  to: number;
  rows: TimelineRow[];
}

const ORDER = { arrivals: 0, event: 1, note: 2 };

export function buildTimeline(world: WorldAt, size = 25): TimelineSection[] {
  const rows: TimelineRow[] = [];
  for (const event of world.events) if (event.chapter !== undefined) rows.push({ kind: 'event', chapter: event.chapter, event });
  // First appearances: people, gods, places and groups (terms would drown the rest), gathered per chapter.
  const arrivals = new Map<number, WorldEntry[]>();
  for (const e of world.entries) {
    if (e.kind === 'term' || e.firstChapter === undefined || e.firstChapter > world.line) continue;
    arrivals.set(e.firstChapter, [...(arrivals.get(e.firstChapter) ?? []), e]);
  }
  for (const [chapter, entries] of arrivals) {
    entries.sort((a, b) => Number(b.role === 'main') - Number(a.role === 'main') || a.english.localeCompare(b.english));
    rows.push({ kind: 'arrivals', chapter, entries });
  }
  for (const note of world.notes) rows.push({ kind: 'note', chapter: note.chapter, note });
  rows.sort((a, b) => a.chapter - b.chapter || ORDER[a.kind] - ORDER[b.kind]);

  // Sections: by arc when events name arcs (a row belongs to the arc of the latest event at or before it),
  // otherwise by runs of chapters.
  const arcs = world.events.filter((e) => e.arc && e.chapter !== undefined).sort((a, b) => a.chapter! - b.chapter!);
  const sections: TimelineSection[] = [];
  const push = (title: string, row: TimelineRow) => {
    const last = sections[sections.length - 1];
    if (last && last.title === title) {
      last.rows.push(row);
      last.to = row.chapter;
    } else sections.push({ title, from: row.chapter, to: row.chapter, rows: [row] });
  };
  if (arcs.length) {
    let i = -1;
    for (const row of rows) {
      while (i + 1 < arcs.length && arcs[i + 1].chapter! <= row.chapter) i++;
      push(i >= 0 ? arcs[i].arc! : 'The beginning', row);
    }
  } else {
    for (const row of rows) {
      const start = Math.floor((row.chapter - 1) / size) * size + 1;
      push(`Chapters ${start}–${start + size - 1}`, row);
    }
  }
  return sections;
}
