import { useEffect, useState } from 'react';
import { accountsAvailable, currentUserId, onAccountChange, signedIn, supabaseClient } from './account';
import { PUBLIC } from './edition';
import { SAMPLE_TITLE } from './sample';
import { db } from './db';
import { newId } from './logic';
import { batches, keepBooks, lastSyncUndo, loadSyncState, syncOnce, undoLastSync, type Remote, type SyncRow } from './sync';

/**
 * When sync runs: when the app opens, every 5 minutes while it is open and online, when it is put away (best
 * effort), and on "Sync now". Only for a signed-in reader who has not turned sync off. One sync at a time.
 */
const ON_KEY = 'syncOn';
const TEXT_KEY = 'syncText';
/** The account this phone's library was last synced with (kept after sign-out, to notice a different account). */
const OWNER_KEY = 'syncOwner';
const DEVICE_KEY = 'syncDevice';
const EVERY = 5 * 60_000;

export interface SyncStatus {
  running: boolean;
  lastAt?: number;
  error?: string;
  /** The last sync stopped to ask: it would remove these books from this phone. */
  held?: { id: string; title: string }[];
  /** A different account than the one that last synced this phone is signed in: sync waits for the reader's choice. */
  otherAccount?: boolean;
  /** When the last sync that changed this phone ran, if it can be undone. */
  undoAt?: number;
  /** Sync has not started yet: the reader is asked once whether book text syncs too. */
  askText?: boolean;
}

let status: SyncStatus = { running: false };
const listeners = new Set<() => void>();
const tell = (change: Partial<SyncStatus>) => {
  status = { ...status, ...change };
  listeners.forEach((l) => l());
};

export async function syncOn(): Promise<boolean> {
  return ((await db.settings.get(ON_KEY))?.value as boolean | undefined) ?? true;
}
export async function setSyncOn(on: boolean): Promise<void> {
  await db.settings.put({ key: ON_KEY, value: on });
  if (on) void syncNow();
}

/**
 * Whether book text and translations sync too. The public app asks once (undefined until then, "off" preselected);
 * the owner's app syncs them without asking.
 */
export async function syncTextChoice(): Promise<boolean | undefined> {
  return ((await db.settings.get(TEXT_KEY))?.value as boolean | undefined) ?? (PUBLIC ? undefined : true);
}
export async function syncText(): Promise<boolean> {
  return (await syncTextChoice()) ?? false;
}
export async function setSyncText(on: boolean): Promise<void> {
  await db.settings.put({ key: TEXT_KEY, value: on });
  tell({ askText: false });
  void syncNow();
}

/** Books whose text always syncs: the free public-domain sample. */
async function sampleBookIds(): Promise<string[]> {
  return (await db.books.toArray()).filter((b) => b.sample || b.title === SAMPLE_TITLE).map((b) => b.id);
}

/** This phone's own name for the server, so it never takes back its own changes. */
async function deviceId(): Promise<string> {
  const saved = (await db.settings.get(DEVICE_KEY))?.value as string | undefined;
  if (saved) return saved;
  const id = newId();
  await db.settings.put({ key: DEVICE_KEY, value: id });
  return id;
}

/** The real server: the `sync_rows` table in Supabase (supabase/sync.sql). */
async function supabaseRemote(): Promise<Remote> {
  const c = await supabaseClient();
  const device = await deviceId();
  return {
    async push(rows: SyncRow[]) {
      for (const part of batches(rows)) {
        const { error } = await c.from('sync_rows').upsert(
          part.map((r) => ({ tbl: r.tbl, id: r.id, data: r.data, deleted: r.deleted, device })),
          { onConflict: 'user_id,tbl,id' },
        );
        if (error) throw new Error(error.message);
      }
    },
    async pull(since) {
      const out: SyncRow[] = [];
      for (let from = 0; ; from += 500) {
        let q = c.from('sync_rows').select('tbl,id,data,deleted,updated_at').neq('device', device).order('updated_at').range(from, from + 499);
        if (since) q = q.gte('updated_at', since);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        out.push(...((data ?? []) as SyncRow[]));
        if (!data || data.length < 500) return out;
      }
    },
  };
}

/** Runs one sync now, unless one is running or sync cannot run. */
export async function syncNow(opts: { allowBookDeletes?: boolean } = {}): Promise<void> {
  if (status.running || !accountsAvailable || !signedIn() || !(await syncOn())) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  // Another account on a phone that already synced with someone: merge nothing until the reader chooses.
  const owner = (await db.settings.get(OWNER_KEY))?.value as string | undefined;
  const me = currentUserId();
  if (owner && me && owner !== me && (await db.books.count()) > 0) {
    tell({ otherAccount: true });
    return;
  }
  // The first sync waits until the reader has said whether book text goes too, so nothing is sent before that.
  const text = await syncTextChoice();
  if (text === undefined) {
    tell({ askText: true });
    return;
  }
  tell({ running: true, error: undefined, held: undefined, otherAccount: false, askText: false });
  try {
    const r = await syncOnce(db, await supabaseRemote(), { allowBookDeletes: opts.allowBookDeletes, noBookText: !text, textAlways: await sampleBookIds() });
    if (me) await db.settings.put({ key: OWNER_KEY, value: me });
    const undo = await lastSyncUndo(db);
    tell({ running: false, lastAt: r.held ? status.lastAt : Date.now(), held: r.held?.books, undoAt: undo?.at });
  } catch (e) {
    tell({ running: false, error: e instanceof Error ? e.message : 'Sync failed.' });
  }
}

/** The reader's answer to "remove these books?": yes removes them; no sends them back to the server. */
export async function answerHeld(remove: boolean): Promise<void> {
  const held = status.held ?? [];
  tell({ held: undefined });
  if (remove) return syncNow({ allowBookDeletes: true });
  await keepBooks(db, held.map((b) => b.id));
  return syncNow();
}

/** The reader's answer when another account signed in: merge this phone's library into it, or stop syncing here. */
export async function answerOtherAccount(merge: boolean): Promise<void> {
  tell({ otherAccount: false });
  if (!merge) return setSyncOn(false);
  const me = currentUserId();
  if (me) await db.settings.put({ key: OWNER_KEY, value: me });
  return syncNow();
}

/** Puts back what the last sync changed on this phone, then syncs so the other devices get it back too. */
export async function undoSync(): Promise<number> {
  const n = await undoLastSync(db);
  tell({ undoAt: undefined });
  await syncNow();
  return n;
}

let started = false;
/** Starts the schedule (once). */
export function startSync(): void {
  if (started || !accountsAvailable) return;
  started = true;
  void loadSyncState(db).then((s) => tell({ lastAt: s.lastAt }));
  void lastSyncUndo(db).then((u) => tell({ undoAt: u?.at }));
  void syncNow();
  // Signed in: sync straight away. Signed out: forget what was synced, so another account on this phone starts
  // fresh (its first sync then merges this phone's library with that account's).
  onAccountChange(() => {
    if (signedIn()) void syncNow();
    else void db.settings.delete('sync').then(() => tell({ lastAt: undefined, error: undefined }));
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, EVERY);
  document.addEventListener('visibilitychange', () => void syncNow());
  window.addEventListener('online', () => void syncNow());
}

/** The sync status, kept up to date, for Settings. */
export function useSyncStatus(): SyncStatus {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return status;
}
