import { accountsAvailable, currentUserId, signedIn, supabaseClient } from '../account';
import { db } from '../db';
import { catLine } from '../mascot/askContext';
import type { Book, Chapter } from '../types';

/**
 * Buddy reads: friends read the same book together, each in their own copy, and leave comments on chapters.
 * The server (supabase/buddy.sql) keeps a comment on chapter N from reaching a friend until they have finished
 * chapter N, so nothing here has to hide anything: what arrives may be shown.
 * The book here only remembers which buddy read it belongs to (`book.buddy`); everything shared lives on the server.
 */

export interface BuddyLink {
  id: string;
  code: string;
  title: string;
}

export interface BuddyMember {
  userId: string;
  name: string;
  /** The last chapter they have finished. */
  line: number;
  me: boolean;
  owner: boolean;
}

export interface BuddyComment {
  id: string;
  userId: string;
  chapter: number;
  quote?: string;
  body: string;
  createdAt: number;
}

export interface Waiting {
  chapter: number;
  comments: number;
}

/** Buddy reads need accounts (a build with Supabase) and a signed-in reader. */
export function buddyAvailable(): boolean {
  return accountsAvailable;
}

const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/** A code as typed or pasted ("hk3m 9qr2", or a whole invite link) in the form the server uses, or undefined. */
export function cleanCode(typed: string): string | undefined {
  const fromLink = typed.match(/join\/([A-Za-z0-9]{8})\b/);
  const c = (fromLink ? fromLink[1] : typed).toUpperCase().replace(/[\s-]/g, '');
  return CODE.test(c) ? c : undefined;
}

/** The link a friend opens to join. It opens YoomiRead at the join screen. */
export function inviteLink(code: string, origin = location.origin): string {
  return `${origin}/#/join/${code}`;
}

/** The code shown to people, in two easy halves: "HK3M 9QR2". */
export function showCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/** Where I stand against the others, in one line. */
export function standing(members: BuddyMember[]): { text: string; ahead: boolean } {
  const me = members.find((m) => m.me);
  const others = members.filter((m) => !m.me);
  if (!me) return { text: '', ahead: false };
  if (!others.length) return { text: 'Nobody has joined yet. Send your friends the code.', ahead: false };
  const behind = others.filter((m) => m.line < me.line);
  const front = [...others].sort((a, b) => b.line - a.line)[0];
  if (behind.length === others.length) {
    const lead = me.line - Math.max(...others.map((m) => m.line));
    return { text: `You’re ahead by ${lead} chapter${lead === 1 ? '' : 's'}. The cat is saving you a seat while they catch up.`, ahead: true };
  }
  if (front.line > me.line) {
    const gap = front.line - me.line;
    return { text: `${front.name} is ${gap} chapter${gap === 1 ? '' : 's'} ahead of you.`, ahead: false };
  }
  return { text: 'You’re all at the same place.', ahead: false };
}

/** "2 comments waiting at chapter 12, 1 at chapter 15" */
export function waitingText(waiting: Waiting[]): string {
  if (!waiting.length) return '';
  const parts = waiting.slice(0, 3).map((w, i) => `${w.comments}${i === 0 ? ` comment${w.comments === 1 ? '' : 's'} waiting` : ''} at chapter ${w.chapter}`);
  const more = waiting.length > 3 ? `, and more after` : '';
  return `${parts.join(', ')}${more}. Read on to unlock them.`;
}

/** The last chapter I have finished in this book, which is what friends' comments are unlocked up to. */
export function myLine(book: Pick<Book, 'startLine'>, chapters: Chapter[]): number {
  return catLine(chapters, book.startLine);
}

/** The name I go by in buddy reads, remembered on this phone. */
export async function savedName(): Promise<string> {
  return ((await db.settings.get('buddy-name'))?.value as string | undefined) ?? '';
}

async function client() {
  if (!signedIn()) throw new Error('Sign in first (Settings › Account).');
  return supabaseClient();
}

function fail(error: { message: string } | null): void {
  if (!error) return;
  // The chapter lock refuses a comment on a chapter past the one I am reading.
  if (/row-level security/i.test(error.message)) throw new Error('You can comment on chapters up to the one you’re reading.');
  throw new Error(error.message || 'Something went wrong. Try again.');
}

/** Starts a buddy read for this book. Returns the link saved on the book. */
export async function startBuddyRead(book: Book, name: string): Promise<BuddyLink> {
  const c = await client();
  const { data, error } = await c.rpc('buddy_create', { p_title: book.title.slice(0, 200), p_name: name.trim() });
  fail(error);
  const row = (data as { id: string; code: string }[])[0];
  const link = { id: row.id, code: row.code, title: book.title };
  await db.books.update(book.id, { buddy: link });
  await db.settings.put({ key: 'buddy-name', value: name.trim() });
  return link;
}

/** The title of the book a code is for, and how many are reading, before joining. */
export async function peekBuddyRead(code: string): Promise<{ title: string; members: number } | undefined> {
  const c = await client();
  const { data, error } = await c.rpc('buddy_peek', { p_code: code });
  fail(error);
  return (data as { title: string; members: number }[])[0];
}

/** Joins with a code, reading it in one of my books. */
export async function joinBuddyRead(code: string, bookId: string, name: string): Promise<BuddyLink> {
  const c = await client();
  const { data, error } = await c.rpc('buddy_join', { p_code: code, p_name: name.trim() });
  fail(error);
  const row = (data as { id: string; title: string }[])[0];
  const link = { id: row.id, code, title: row.title };
  await db.books.update(bookId, { buddy: link });
  await db.settings.put({ key: 'buddy-name', value: name.trim() });
  return link;
}

export async function buddyMembers(link: BuddyLink): Promise<BuddyMember[]> {
  const c = await client();
  const [{ data, error }, read] = await Promise.all([
    c.from('buddy_members').select('user_id,name,line').eq('read_id', link.id).order('joined_at'),
    c.from('buddy_reads').select('owner').eq('id', link.id).maybeSingle(),
  ]);
  fail(error);
  const me = currentUserId();
  const owner = (read.data as { owner?: string } | null)?.owner;
  return ((data ?? []) as { user_id: string; name: string; line: number }[]).map((m) => ({ userId: m.user_id, name: m.name, line: m.line, me: m.user_id === me, owner: m.user_id === owner }));
}

/** Tells the others how far I am. Only ever my own row; the server refuses anything else. */
export async function shareLine(link: BuddyLink, line: number): Promise<void> {
  const c = await client();
  const me = currentUserId();
  const { error } = await c.from('buddy_members').update({ line }).eq('read_id', link.id).eq('user_id', me!);
  fail(error);
}

/** Comments I may see on one chapter (or all chapters up to my line, when no chapter is given). */
export async function buddyComments(link: BuddyLink, chapter?: number): Promise<BuddyComment[]> {
  const c = await client();
  let q = c.from('buddy_comments').select('id,user_id,chapter,quote,body,created_at').eq('read_id', link.id);
  if (chapter !== undefined) q = q.eq('chapter', chapter);
  const { data, error } = await q.order('created_at');
  fail(error);
  return ((data ?? []) as { id: string; user_id: string; chapter: number; quote: string | null; body: string; created_at: string }[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    chapter: r.chapter,
    quote: r.quote ?? undefined,
    body: r.body,
    createdAt: Date.parse(r.created_at),
  }));
}

export async function waitingComments(link: BuddyLink): Promise<Waiting[]> {
  const c = await client();
  const { data, error } = await c.rpc('buddy_waiting', { r: link.id });
  fail(error);
  return (data ?? []) as Waiting[];
}

export async function postComment(link: BuddyLink, chapter: number, body: string, quote?: string): Promise<void> {
  const c = await client();
  const { error } = await c.from('buddy_comments').insert({ read_id: link.id, chapter, body: body.trim().slice(0, 2000), quote: quote?.slice(0, 300) || null });
  fail(error);
}

export async function deleteComment(id: string): Promise<void> {
  const c = await client();
  const { error } = await c.from('buddy_comments').delete().eq('id', id);
  fail(error);
}

/** Leaves the buddy read (the owner ends it for everyone instead). The book itself stays as it is. */
export async function leaveBuddyRead(book: Book, owner: boolean): Promise<void> {
  const link = book.buddy;
  if (!link) return;
  const c = await client();
  const me = currentUserId();
  const { error } = owner ? await c.from('buddy_reads').delete().eq('id', link.id) : await c.from('buddy_members').delete().eq('read_id', link.id).eq('user_id', me!);
  fail(error);
  await db.books.update(book.id, { buddy: undefined });
}

/** The owner removes someone from the buddy read. */
export async function removeMember(link: BuddyLink, userId: string): Promise<void> {
  const c = await client();
  const { error } = await c.from('buddy_members').delete().eq('read_id', link.id).eq('user_id', userId);
  fail(error);
}
