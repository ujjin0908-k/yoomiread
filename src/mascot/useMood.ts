import { db } from '../db';
import { useLive } from '../hooks';
import { moodFrom, type Mood, type Trouble } from './mood';
import { TROUBLE_KEY } from './trouble';

/** His mood right now, and what he is cross about when he is angry. Undefined until the data has loaded. */
export function useMood(): { mood?: Mood; trouble?: Trouble } {
  const data = useLive(
    async () => ({
      sessions: await db.sessions.toArray(),
      trouble: (await db.settings.get(TROUBLE_KEY))?.value as Trouble | undefined,
    }),
    [],
  );
  if (!data) return {};
  const mood = moodFrom(data.sessions, Date.now(), data.trouble);
  return { mood, trouble: mood === 'angry' ? data.trouble : undefined };
}
