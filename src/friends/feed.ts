import type { CardData } from './card';

/** A feed item as the server keeps it (supabase/friends.sql). */
export interface FeedRow {
  id?: string;
  user_id?: string;
  kind: 'started' | 'finished' | 'recommend' | 'wrapped';
  book_title?: string | null;
  rating?: number | null;
  note?: string | null;
  to_user?: string | null;
  created_at?: string;
}

/** One line in the activity feed. */
export type FeedEntry =
  | { kind: 'reading'; key: string; who: CardData; title: string; chapter?: number; total?: number; at: number }
  | { kind: 'finished'; key: string; who: CardData; title: string; rating?: number; at: number }
  | { kind: 'recommend'; key: string; who: CardData; title: string; note?: string; forMe: boolean; at: number }
  | { kind: 'wrapped'; key: string; who: CardData; title: string; note?: string; at: number };

/**
 * The activity feed (owner's pick, 2026-11-24): what each friend is reading now (from their card), and what they
 * posted: books finished, books recommended (to me or to everyone), Wrapped shared. Newest first. Posts from someone
 * whose card I can't see (removed, or private) are left out.
 */
export function buildFeed(cards: CardData[], rows: FeedRow[], me: string | undefined, limit = 40): FeedEntry[] {
  const byId = new Map(cards.filter((c) => c.user_id).map((c) => [c.user_id!, c]));
  const out: FeedEntry[] = [];
  for (const c of cards) {
    if (!c.user_id || !c.now_title) continue;
    out.push({
      kind: 'reading',
      key: `reading-${c.user_id}`,
      who: c,
      title: c.now_title,
      chapter: c.now_chapter ?? undefined,
      total: c.now_total ?? undefined,
      at: c.updated_at ? Date.parse(c.updated_at) : 0,
    });
  }
  for (const r of rows) {
    const who = r.user_id ? byId.get(r.user_id) : undefined;
    if (!who || !r.book_title) continue;
    const at = r.created_at ? Date.parse(r.created_at) : 0;
    const key = r.id ?? `${r.kind}-${r.user_id}-${at}`;
    if (r.kind === 'finished') out.push({ kind: 'finished', key, who, title: r.book_title, rating: r.rating ?? undefined, at });
    else if (r.kind === 'recommend') out.push({ kind: 'recommend', key, who, title: r.book_title, note: r.note ?? undefined, forMe: !!me && r.to_user === me, at });
    else if (r.kind === 'wrapped') out.push({ kind: 'wrapped', key, who, title: r.book_title, note: r.note ?? undefined, at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** "2h ago", "yesterday", "3 days ago", "Nov 2". */
export function ago(at: number, now = Date.now()): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
