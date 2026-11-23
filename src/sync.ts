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
}

/**
 * One sync: read what changed here, take what changed elsewhere, send what changed here. Safe to run again at any
 * time; a run cut short leaves nothing half done that the next run does not finish.
 */
export async function syncOnce(db: YoomiDB, remote: Remote): Promise<SyncResult> {
  const state = await loadSyncState(db);
  const hashes = { ...state.hashes };

  // 1. This device: every row, encoded, with its fingerprint.
  const local = new Map<string, { tbl: SyncTable; id: string; data: Record<string, unknown>; hash: string }>();
  for (const tbl of Object.keys(SYNC_TABLES) as SyncTable[]) {
    const pk = SYNC_TABLES[tbl];
    for (const row of await table(db, tbl).toArray()) {
      const id = String(row[pk]);
      const data = await encodeRow(row);
      local.set(keyOf(tbl, id), { tbl, id, data, hash: fingerprint(stable(data)) });
    }
  }
  const changedHere = new Set([...local].filter(([k, r]) => hashes[k] !== r.hash).map(([k]) => k));
  const deletedHere = new Set(Object.keys(hashes).filter((k) => !local.has(k)));

  // 2. Elsewhere: rows changed since the last sync.
  const incoming = await remote.pull(state.cursor);
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
