import { pictureToDataUrl } from './backup';
import { db, type YoomiDB } from './db';

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
/**
 * Builds the backup file (same JSON as makeBackup) a piece at a time: chapters are read a few at a time and each
 * piece goes into a Blob straight away. Building it as one big string held the whole library in memory several
 * times over, and Safari on iPhone killed the page ("A problem repeatedly occurred") on a large library.
 */
export async function backupBlob(source: YoomiDB = db, now = Date.now()): Promise<Blob> {
  const out = new BlobWriter();
  const list = async <T>(key: string, items: T[] | (() => AsyncIterable<T>), first = false) => {
    out.push(`${first ? '' : ','}${JSON.stringify(key)}:[`);
    let i = 0;
    const iter = typeof items === 'function' ? items() : items;
    for await (const item of iter) out.push((i++ ? ',' : '') + JSON.stringify(item));
    out.push(']');
  };
  out.push(`{"app":"yoomiread","version":4,"exportedAt":${now},`);
  const bookIds = (await source.books.toCollection().primaryKeys()) as string[];
  await list('books', async function* () {
    for (const id of bookIds) {
      const b = await source.books.get(id);
      if (!b) continue;
      yield {
        ...b,
        cover: await pictureToDataUrl(b.cover),
        backdrop: b.backdrop ? { cover: b.backdrop.cover, picture: await pictureToDataUrl(b.backdrop.picture) } : undefined,
      };
    }
  }, true);
  await list('chapters', async function* () {
    for (const bookId of bookIds) {
      const chapters = await source.chapters.where('bookId').equals(bookId).toArray();
      for (let i = 0; i < chapters.length; i += CHAPTERS_AT_ONCE) {
        const part = chapters.slice(i, i + CHAPTERS_AT_ONCE);
        const ids = part.map((c) => c.id);
        const [texts, translations] = await Promise.all([source.texts.bulkGet(ids), source.translations.bulkGet(ids)]);
        for (let j = 0; j < part.length; j++) {
          const t = translations[j];
          let translation;
          if (t) {
            const { chapterId: _c, bookId: _b, ...rest } = t;
            translation = rest;
          }
          yield { ...part[j], text: texts[j]?.text, translation };
        }
      }
    }
  });
  await list('notes', await source.notes.toArray());
  await list('sessions', await source.sessions.toArray());
  await list('glossary', async function* () {
    for (const g of await source.glossary.toArray()) yield { ...g, picture: await pictureToDataUrl(g.picture) };
  });
  await list('worldLinks', await source.worldLinks.toArray());
  await list('worldEvents', await source.worldEvents.toArray());
  out.push('}');
  return out.done('application/json');
}

const CHAPTERS_AT_ONCE = 20;

/** Collects text into a Blob, folding it into Blob parts every megabyte so the strings can be let go. */
class BlobWriter {
  private parts: Blob[] = [];
  private pending: string[] = [];
  private size = 0;
  push(s: string) {
    this.pending.push(s);
    this.size += s.length;
    if (this.size > 1 << 20) this.flush();
  }
  private flush() {
    if (this.pending.length) this.parts.push(new Blob(this.pending));
    this.pending = [];
    this.size = 0;
  }
  done(type: string): Blob {
    this.flush();
    return new Blob(this.parts, { type });
  }
}

let running: Promise<'shared' | 'downloaded' | 'cancelled'> | undefined;

/** One backup at a time: a second tap while it is still being built waits for the first instead of starting another. */
export function saveBackupFile(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  running ??= writeBackupFile().finally(() => (running = undefined));
  return running;
}

export function backupRunning(): boolean {
  return running !== undefined;
}

async function writeBackupFile(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = `yoomiread-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([await backupBlob()], name, { type: 'application/json' });
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
  const url = a.href;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  await saveBackupState({ lastAt: Date.now(), snoozeUntil: undefined });
  return 'downloaded';
}
