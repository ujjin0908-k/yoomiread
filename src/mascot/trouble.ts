import { db } from '../db';
import type { Trouble } from './mood';

export const TROUBLE_KEY = 'mascot.trouble';

/** Remembers that a translation went wrong, so the cat can be cross about it. Stays on this phone. */
export async function noteTrouble(kind: Trouble['kind'], chapter: string, now = Date.now()): Promise<void> {
  await db.settings.put({ key: TROUBLE_KEY, value: { at: now, kind, chapter } satisfies Trouble });
}

/** A translation went through cleanly: nothing to be cross about any more. */
export async function clearTrouble(): Promise<void> {
  await db.settings.delete(TROUBLE_KEY);
}
