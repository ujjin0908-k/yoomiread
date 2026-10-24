import type { Session } from '../types';

export type Mood = 'happy' | 'idle' | 'sad' | 'high';

const DAY = 24 * 60 * 60 * 1000;
/** Reading longer than this in one day makes him a little dizzy. */
export const TOO_MUCH_MS = 90 * 60 * 1000;

/**
 * His mood from the reading sessions. Pure, so it can be tested and costs nothing to run.
 * High: a long day. Sad: no reading for two days. Happy: two or more chapters in three days.
 */
export function moodFrom(sessions: Session[], now: number): Mood {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const todayMs = sessions.filter((s) => s.startedAt >= startOfToday).reduce((sum, s) => sum + s.ms, 0);
  if (todayMs > TOO_MUCH_MS) return 'high';

  const last = sessions.reduce((latest, s) => Math.max(latest, s.startedAt), 0);
  if (!last || now - last > 2 * DAY) return 'sad';

  const recent = new Set(sessions.filter((s) => now - s.startedAt <= 3 * DAY).map((s) => s.chapterId));
  return recent.size >= 2 ? 'happy' : 'idle';
}
