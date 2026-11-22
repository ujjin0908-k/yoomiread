import { useEffect, useState } from 'react';
import { accountsAvailable, onAccountChange, signedIn, supabaseClient } from './account';
import { db } from './db';
import { newId } from './logic';
import { batches, loadSyncState, syncOnce, type Remote, type SyncRow } from './sync';

/**
 * When sync runs: when the app opens, every 5 minutes while it is open and online, when it is put away (best
 * effort), and on "Sync now". Only for a signed-in reader who has not turned sync off. One sync at a time.
 */
const ON_KEY = 'syncOn';
const DEVICE_KEY = 'syncDevice';
const EVERY = 5 * 60_000;

export interface SyncStatus {
  running: boolean;
  lastAt?: number;
  error?: string;
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
export async function syncNow(): Promise<void> {
  if (status.running || !accountsAvailable || !signedIn() || !(await syncOn())) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  tell({ running: true, error: undefined });
  try {
    await syncOnce(db, await supabaseRemote());
    tell({ running: false, lastAt: Date.now() });
  } catch (e) {
    tell({ running: false, error: e instanceof Error ? e.message : 'Sync failed.' });
  }
}

let started = false;
/** Starts the schedule (once). */
export function startSync(): void {
  if (started || !accountsAvailable) return;
  started = true;
  void loadSyncState(db).then((s) => tell({ lastAt: s.lastAt }));
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
