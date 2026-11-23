import type { Table } from 'dexie';
import { dataUrlToPicture, pictureToDataUrl } from './backup';
import type { YoomiDB } from './db';
import { isPicture } from './picture';

/**
 * Sync between a reader's devices (item 3 of the release plan). Offline first: the phone's database stays the real
 * one, and a sync now and then sends what changed here and takes what changed elsewhere.
 *
 * How changes are found: every row's fingerprint from the last sync is kept. A row whose fingerprint differs was
 * changed (or added) here; a row that is gone was deleted here. No write in the app needs to know about sync.
 * When the same row changed on two devices, the newer `updatedAt` wins; without one, this device's version wins.
 * Device settings (the API key, the AI choice) never leave the phone.
 */

/** The tables that sync, with each one's key. `settings` is not here on purpose. */
export const SYNC_TABLES = {
  books: 'id',
  chapters: 'id',
  texts: 'chapterId',
  notes: 'id',
  sessions: 'id',
  translations: 'chapterId',
  glossary: 'id',
  worldLinks: 'id',
  worldEvents: 'id',
} as const;
export type SyncTable = keyof typeof SYNC_TABLES;

/** One row as the server keeps it. `data` is JSON (pictures as data URLs); a deleted row has none. */
export interface SyncRow {
  tbl: SyncTable;
  id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  /** Server time of the last change, set by the server. */
  updated_at?: string;
}

/** Where rows go and come from. The real one is Supabase (`supabaseRemote`); tests use a list in memory. */
export interface Remote {
  push(rows: SyncRow[]): Promise<void>;
  /** Rows changed since `since` (server time), not counting this device's own, oldest first. */
  pull(since: string | undefined): Promise<SyncRow[]>;
}

export interface SyncState {
  /** The latest server time seen; the next pull starts here. */
  cursor?: string;
  /** Fingerprint of each row ("books:abc") as of the last sync. */
  hashes: Record<string, string>;
  lastAt?: number;
}

const STATE_KEY = 'sync';

export async function loadSyncState(db: YoomiDB): Promise<SyncState> {
  return ((await db.settings.get(STATE_KEY))?.value as SyncState | undefined) ?? { hashes: {} };
}

/** A fast 53-bit string fingerprint (cyrb53). Only compared with itself, never shown. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A row as JSON: pictures (covers, backgrounds, faces) become data URLs. */
export async function encodeRow(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...row };
  if (isPicture(out.cover)) out.cover = { dataUrl: await pictureToDataUrl(out.cover) };
  if (isPicture(out.picture)) out.picture = { dataUrl: await pictureToDataUrl(out.picture) };
  const backdrop = out.backdrop as { picture?: unknown; cover?: number } | undefined;
  if (backdrop && isPicture(backdrop.picture)) out.backdrop = { ...backdrop, picture: { dataUrl: await pictureToDataUrl(backdrop.picture) } };
  return out;
}

const back = (v: unknown) => (v && typeof v === 'object' && typeof (v as { dataUrl?: unknown }).dataUrl === 'string' ? dataUrlToPicture((v as { dataUrl: string }).dataUrl) : undefined);

/** The opposite of `encodeRow`. */
export function decodeRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  if (out.cover) out.cover = back(out.cover);
  if (out.picture) out.picture = back(out.picture);
  const backdrop = out.backdrop as { picture?: unknown; cover?: number } | undefined;
  if (backdrop?.picture) {
    const picture = back(backdrop.picture);
    out.backdrop = picture ? { ...backdrop, picture } : undefined;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** JSON with keys in a fixed order, so the same row always gives the same fingerprint. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const keyOf = (tbl: string, id: string) => `${tbl}:${id}`;
const table = (db: YoomiDB, tbl: SyncTable) => (db as unknown as Record<SyncTable, Table<Record<string, unknown>, string>>)[tbl];

export interface SyncResult {
  sent: number;
  received: number;
  /** Rows changed on both sides; the newer one was kept. */
  conflicts: number;
  /**
   * Set when the sync stopped before changing anything because it would remove many books from this phone. Nothing
   * was applied or sent; run again with `allowBookDeletes` (the reader agreed) or call `keepBooks` (they did not).
   */
  held?: { books: { id: string; title: string }[] };
}

export interface SyncOptions {
  /** The reader agreed that the books in `held` may be removed. */
  allowBookDeletes?: boolean;
  /** Leave out chapter text and translations (book text stays on this phone only). Default false. */
  noBookText?: boolean;
}

/** More than this many books, or a quarter of the library, removed in one sync needs the reader's OK. */
export const MANY_BOOKS = 2;

/** The tables that carry book text. */
const TEXT_TABLES: SyncTable[] = ['texts', 'translations'];

const UNDO_KEY = 'syncUndo';

/** What the last sync changed on this phone: each row as it was before (null: it did not exist). */
export interface SyncUndo {
  at: number;
  rows: { tbl: SyncTable; id: string; before: Record<string, unknown> | null }[];
}

export async function lastSyncUndo(db: YoomiDB): Promise<SyncUndo | undefined> {
  const u = (await db.settings.get(UNDO_KEY))?.value as SyncUndo | undefined;
  return u && u.rows.length ? u : undefined;
}

/**
 * Puts back what the last sync changed on this phone. The next sync then sees those rows as changed here and sends
 * them, so the server and the other devices get them back too.
 */
export async function undoLastSync(db: YoomiDB): Promise<number> {
  const u = await lastSyncUndo(db);
  if (!u) return 0;
  for (const r of u.rows) {
    if (r.before) await table(db, r.tbl).put(decodeRow(r.before));
    else await table(db, r.tbl).delete(r.id);
  }
  await db.settings.delete(UNDO_KEY);
  return u.rows.length;
}

/** The reader said no to removing these books: they are sent again, so the server has them back. */
export async function keepBooks(db: YoomiDB, bookIds: string[]): Promise<void> {
  const state = await loadSyncState(db);
  const hashes = { ...state.hashes };
  // Forgetting what was synced for these books makes the next sync see them as changed here, and send them.
  const drop = new Set(bookIds);
  for (const tbl of Object.keys(SYNC_TABLES) as SyncTable[]) {
    for (const row of await table(db, tbl).toArray()) {
      const bookId = tbl === 'books' ? row.id : row.bookId;
      if (drop.has(String(bookId))) delete hashes[keyOf(tbl, String(row[SYNC_TABLES[tbl]]))];
    }
  }
  await db.settings.put({ key: STATE_KEY, value: { ...state, hashes } satisfies SyncState });
}

/**
 * One sync: read what changed here, take what changed elsewhere, send what changed here. Safe to run again at any
 * time; a run cut short leaves nothing half done that the next run does not finish.
 */
export async function syncOnce(db: YoomiDB, remote: Remote, opts: SyncOptions = {}): Promise<SyncResult> {
  const state = await loadSyncState(db);
  const hashes = { ...state.hashes };

  // 1. This device: every row, encoded, with its fingerprint.
  const local = new Map<string, { tbl: SyncTable; id: string; data: Record<string, unknown>; hash: string }>();
  const tables = (Object.keys(SYNC_TABLES) as SyncTable[]).filter((t) => !(opts.noBookText && TEXT_TABLES.includes(t)));
  for (const tbl of tables) {
    const pk = SYNC_TABLES[tbl];
    for (const row of await table(db, tbl).toArray()) {
      const id = String(row[pk]);
      const data = await encodeRow(row);
      local.set(keyOf(tbl, id), { tbl, id, data, hash: fingerprint(stable(data)) });
    }
  }
  const changedHere = new Set([...local].filter(([k, r]) => hashes[k] !== r.hash).map(([k]) => k));
  const skipped = (k: string) => opts.noBookText && TEXT_TABLES.some((t) => k.startsWith(`${t}:`));
  const deletedHere = new Set(Object.keys(hashes).filter((k) => !local.has(k) && !skipped(k)));

  // 2. Elsewhere: rows changed since the last sync.
  const incoming = (await remote.pull(state.cursor)).filter((r) => !skipped(keyOf(r.tbl, r.id)));

  // Many books about to be removed from this phone: stop before changing anything, and ask.
  if (!opts.allowBookDeletes) {
    const going = incoming.filter((r) => r.tbl === 'books' && (r.deleted || !r.data) && local.has(keyOf('books', r.id)) && !changedHere.has(keyOf('books', r.id)));
    const books = local.size ? [...local.values()].filter((r) => r.tbl === 'books').length : 0;
    if (going.length > MANY_BOOKS || (books >= 4 && going.length * 4 >= books)) {
      return {
        sent: 0,
        received: 0,
        conflicts: 0,
        held: { books: going.map((r) => ({ id: r.id, title: String(local.get(keyOf('books', r.id))?.data.title ?? 'A book') })) },
      };
    }
  }
  const undo: SyncUndo['rows'] = [];
  let cursor = state.cursor;
  let received = 0;
  let conflicts = 0;
  for (const r of incoming) {
    if (r.updated_at && (!cursor || r.updated_at > cursor)) cursor = r.updated_at;
    if (!(r.tbl in SYNC_TABLES)) continue;
    const k = keyOf(r.tbl, r.id);
    const mine = local.get(k);
    const remoteHash = r.deleted || !r.data ? undefined : fingerprint(stable(r.data));
    // Already taken in an earlier sync (a pull starts at the last server time seen, so the newest rows come again).
    if (remoteHash ? state.hashes[k] === remoteHash : !(k in state.hashes) && !mine) continue;
    if (remoteHash && mine && remoteHash === mine.hash) {
      // Same on both sides already.
      hashes[k] = remoteHash;
      changedHere.delete(k);
      continue;
    }
    if (changedHere.has(k)) {
      // Changed on both sides: an edit beats a delete; otherwise the newer edit wins.
      conflicts++;
      const theirs = Number(r.data?.updatedAt ?? 0);
      const ours = Number(mine?.data.updatedAt ?? 0);
      if (r.deleted || !r.data || !(theirs > ours)) continue;
      changedHere.delete(k);
    }
    deletedHere.delete(k);
    undo.push({ tbl: r.tbl, id: r.id, before: mine?.data ?? null });
    if (r.deleted || !r.data) {
      await table(db, r.tbl).delete(r.id);
      delete hashes[k];
    } else {
      await table(db, r.tbl).put(decodeRow(r.data));
      hashes[k] = remoteHash!;
    }
    received++;
  }

  // 3. Send what changed here.
  const out: SyncRow[] = [
    ...[...changedHere].map((k) => {
      const r = local.get(k)!;
      return { tbl: r.tbl, id: r.id, data: r.data, deleted: false };
    }),
    ...[...deletedHere].map((k) => {
      const at = k.indexOf(':');
      return { tbl: k.slice(0, at) as SyncTable, id: k.slice(at + 1), data: null, deleted: true };
    }),
  ];
  if (out.length) await remote.push(out);
  for (const k of changedHere) hashes[k] = local.get(k)!.hash;
  for (const k of deletedHere) delete hashes[k];

  await db.settings.put({ key: STATE_KEY, value: { cursor, hashes, lastAt: Date.now() } satisfies SyncState });
  // What this sync changed here, so it can be undone. A sync that changed nothing keeps the earlier undo.
  if (undo.length) await db.settings.put({ key: UNDO_KEY, value: { at: Date.now(), rows: undo } satisfies SyncUndo });
  return { sent: out.length, received, conflicts };
}

/** Splits rows into requests of about 1 MB, so a whole library goes up in pieces the server accepts. */
export function batches(rows: SyncRow[], maxBytes = 1_000_000): SyncRow[][] {
  const out: SyncRow[][] = [];
  let current: SyncRow[] = [];
  let size = 0;
  for (const row of rows) {
    const bytes = JSON.stringify(row).length;
    if (current.length && size + bytes > maxBytes) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += bytes;
  }
  if (current.length) out.push(current);
  return out;
}
