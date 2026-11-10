import { makeBackup } from './backup';
import { db } from './db';

/** When the last backup file was saved, and how often to be reminded. Stays on this phone. */
export interface BackupState {
  lastAt?: number;
  /** Days between reminders; 0 turns them off. */
  every: number;
  /** "Later" was tapped: no reminder before this time. */
  snoozeUntil?: number;
}

const KEY = 'backup';
const DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_BACKUP: BackupState = { every: 7 };

export async function loadBackupState(): Promise<BackupState> {
  return { ...DEFAULT_BACKUP, ...(((await db.settings.get(KEY))?.value as Partial<BackupState>) ?? {}) };
}

export async function saveBackupState(change: Partial<BackupState>): Promise<void> {
  await db.settings.put({ key: KEY, value: { ...(await loadBackupState()), ...change } });
}

/**
 * Whole days since the last backup when a reminder is due, otherwise undefined.
 * With no backup yet, the days count from the first book, so a new library is not nagged on day one.
 */
export function backupDue(state: BackupState, firstBookAt: number | undefined, now: number): number | undefined {
  if (!state.every || firstBookAt === undefined) return undefined;
  if (state.snoozeUntil && now < state.snoozeUntil) return undefined;
  const days = Math.floor((now - (state.lastAt ?? firstBookAt)) / DAY);
  return days >= state.every ? days : undefined;
}

export function snoozeBackup(now = Date.now()): Promise<void> {
  return saveBackupState({ snoozeUntil: now + DAY });
}

/**
 * Writes the backup file. On a phone the share sheet opens, where "Save to Files" keeps it off the app;
 * elsewhere it downloads. A web app cannot write to Files by itself, so this always needs one tap.
 */
export async function saveBackupFile(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = JSON.stringify(await makeBackup(await db.exportAll()));
  const name = `yoomiread-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'YoomiRead backup' });
      await saveBackupState({ lastAt: Date.now(), snoozeUntil: undefined });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Sharing is not allowed here: fall through to a plain download.
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  await saveBackupState({ lastAt: Date.now(), snoozeUntil: undefined });
  return 'downloaded';
}
