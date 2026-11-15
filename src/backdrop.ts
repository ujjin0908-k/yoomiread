import { db } from './db';
import { useLive } from './hooks';
import type { Picture } from './picture';

/**
 * A picture of the owner's own behind the pages while reading. The page colour lies over it, by `cover`
 * (0.5 shows the picture strongly, 0.95 is barely there), so the text stays easy to read.
 * Kept on this phone only, like the stickers: not part of a backup.
 */
export interface Backdrop {
  picture: Picture;
  cover: number;
}

const KEY = 'readerBackdrop';
export const DEFAULT_COVER = 0.8;

export async function saveBackdrop(value: Backdrop | undefined): Promise<void> {
  if (value) await db.settings.put({ key: KEY, value });
  else await db.settings.delete(KEY);
}

export function useBackdrop(): Backdrop | undefined {
  return useLive(async () => ((await db.settings.get(KEY))?.value as Backdrop | undefined) ?? null, [], 'backdrop') ?? undefined;
}
