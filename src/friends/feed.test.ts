import { describe, expect, it } from 'vitest';
import { ago, buildFeed, type FeedRow } from './feed';
import type { CardData } from './card';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const mina: CardData = { user_id: 'm', name: 'Mina', visibility: 'friends', now_title: 'Oz', now_chapter: 20, now_total: 24, updated_at: iso(1) };
const jun: CardData = { user_id: 'j', name: 'Jun', visibility: 'public', updated_at: iso(50) };

describe('buildFeed', () => {
  const rows: FeedRow[] = [
    { id: '1', user_id: 'j', kind: 'finished', book_title: 'The Harbor Book', rating: 4.5, created_at: iso(3) },
    { id: '2', user_id: 'j', kind: 'recommend', book_title: 'Oz', note: 'Cosy', to_user: 'me', created_at: iso(2) },
    { id: '3', user_id: 'm', kind: 'wrapped', book_title: 'November 2026', note: '41h · Night owl', created_at: iso(30) },
    // From someone whose card I can't see: left out.
    { id: '4', user_id: 'stranger', kind: 'finished', book_title: 'Secret', created_at: iso(0.5) },
  ];

  it('mixes what friends are reading with what they posted, newest first', () => {
    const feed = buildFeed([mina, jun], rows, 'me');
    expect(feed.map((e) => `${e.kind}:${e.who.name}`)).toEqual(['reading:Mina', 'recommend:Jun', 'finished:Jun', 'wrapped:Mina']);
  });

  it('knows a recommendation was for me', () => {
    const rec = buildFeed([mina, jun], rows, 'me').find((e) => e.kind === 'recommend');
    expect(rec && rec.kind === 'recommend' && rec.forMe).toBe(true);
    const other = buildFeed([mina, jun], rows, 'someone else').find((e) => e.kind === 'recommend');
    expect(other && other.kind === 'recommend' && other.forMe).toBe(false);
  });

  it('keeps half stars', () => {
    const fin = buildFeed([mina, jun], rows, 'me').find((e) => e.kind === 'finished');
    expect(fin && fin.kind === 'finished' && fin.rating).toBe(4.5);
  });

  it('shows nothing for a friend with no book and no posts', () => {
    expect(buildFeed([jun], [], 'me')).toEqual([]);
  });
});

describe('ago', () => {
  it('says how long ago, plainly', () => {
    expect(ago(NOW - 30_000, NOW)).toBe('just now');
    expect(ago(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(ago(NOW - 3 * 3_600_000, NOW)).toBe('3h ago');
    expect(ago(NOW - 26 * 3_600_000, NOW)).toBe('yesterday');
    expect(ago(NOW - 4 * 86_400_000, NOW)).toBe('4 days ago');
  });
});
