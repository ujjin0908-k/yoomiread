import { accountsAvailable, currentUserId, signedIn, supabaseClient } from '../account';
import { db } from '../db';
import { DEFAULT_PREFS, type CardData, type CardPrefs } from './card';
import type { FeedRow } from './feed';

/**
 * Friends on the server (supabase/friends.sql): my card, friends added by code, their cards. The server decides who
 * may read what; this file only asks. Everything needs an account, like buddy reads.
 */

const PREFS_KEY = 'card-prefs';

export { accountsAvailable };

export async function loadPrefs(): Promise<CardPrefs> {
  const saved = (await db.settings.get(PREFS_KEY))?.value as Partial<CardPrefs> | undefined;
  return { ...DEFAULT_PREFS, ...saved, show: { ...DEFAULT_PREFS.show, ...saved?.show } };
}

export async function savePrefs(prefs: CardPrefs): Promise<void> {
  await db.settings.put({ key: PREFS_KEY, value: prefs });
}

async function client() {
  if (!signedIn()) throw new Error('Sign in first (Settings › Account).');
  return supabaseClient();
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message || 'Something went wrong. Try again.');
}

/** The friend code shown to people, in two easy halves: "HK3M 9QR2". */
export function showCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/** A code as typed or pasted (or a whole link), in the form the server uses, or undefined. */
export function cleanFriendCode(typed: string): string | undefined {
  const fromLink = typed.match(/friend\/([A-Za-z0-9]{8})\b/);
  const c = (fromLink ? fromLink[1] : typed).toUpperCase().replace(/[\s-]/g, '');
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(c) ? c : undefined;
}

/** The link a friend opens to add me. */
export function friendLink(code: string, origin = location.origin): string {
  return `${origin}/#/friend/${code}`;
}

/** Sends my card to the server (made the first time). Returns it as saved, with its code. */
export async function publishCard(card: CardData): Promise<CardData> {
  const c = await client();
  const { data: code, error } = await c.rpc('card_ensure', { p_name: card.name });
  fail(error);
  const fields = {
    name: card.name,
    visibility: card.visibility,
    badge: card.badge ?? null,
    now_title: card.now_title ?? null,
    now_chapter: card.now_chapter ?? null,
    now_total: card.now_total ?? null,
    genres: card.genres ?? null,
    line: card.line ?? null,
    line_book: card.line_book ?? null,
    line_chapter: card.line_chapter ?? null,
    hours: card.hours ?? null,
    streak: card.streak ?? null,
    theories: card.theories ?? null,
    wrapped: card.wrapped ?? null,
  };
  const { error: e2 } = await c.from('reader_cards').update(fields).eq('user_id', currentUserId()!);
  fail(e2);
  return { ...card, code: code as string, user_id: currentUserId() };
}

/** My friends' cards (the server leaves out private ones). Newest first. */
export async function friendCards(): Promise<CardData[]> {
  const c = await client();
  const { data, error } = await c.from('reader_cards').select('*').neq('user_id', currentUserId()!).order('updated_at', { ascending: false });
  fail(error);
  return (data ?? []) as CardData[];
}

/** A card by its code (public, mine or a friend's), for the add-a-friend screen. */
export async function cardByCode(code: string): Promise<CardData | undefined> {
  const c = await client();
  const { data, error } = await c.rpc('card_by_code', { p_code: code });
  fail(error);
  return (data as CardData[] | null)?.[0];
}

export async function addFriend(code: string): Promise<string> {
  const c = await client();
  const { data, error } = await c.rpc('friend_add', { p_code: code });
  fail(error);
  return ((data as { name: string }[] | null)?.[0]?.name as string) ?? 'your friend';
}

export async function removeFriend(id: string): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('friend_remove', { p_friend: id });
  fail(error);
}

/** Posts to the feed as me. A recommendation with `to_user` goes to that friend only; without, to all friends. */
export async function postFeed(item: Omit<FeedRow, 'id' | 'user_id' | 'created_at'>): Promise<void> {
  const c = await client();
  const { error } = await c.from('feed_items').insert({
    kind: item.kind,
    book_title: item.book_title?.slice(0, 200) ?? null,
    rating: item.rating ?? null,
    note: item.note?.trim().slice(0, 280) || null,
    to_user: item.to_user ?? null,
  });
  fail(error);
}

/** My friends' feed items, newest first (the server leaves out what I may not see). */
export async function friendFeed(): Promise<FeedRow[]> {
  const c = await client();
  const { data, error } = await c.from('feed_items').select('*').neq('user_id', currentUserId()!).order('created_at', { ascending: false }).limit(60);
  fail(error);
  return (data ?? []) as FeedRow[];
}

/** Tells friends I finished a book, if I said so (Edit card) and my card isn't private. Quietly does nothing offline. */
export async function shareFinished(title: string, rating?: number): Promise<void> {
  if (!accountsAvailable || !signedIn()) return;
  const prefs = await loadPrefs();
  if (!prefs.tellFinished || prefs.visibility === 'private') return;
  await postFeed({ kind: 'finished', book_title: title, rating: rating || null, note: null, to_user: null }).catch(() => undefined);
}
