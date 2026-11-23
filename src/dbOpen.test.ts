import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { guardVersions, type OpenHooks } from './dbOpen';

const opened: Dexie[] = [];
afterEach(async () => {
  for (const d of opened.splice(0)) d.close();
});

function hooks() {
  const log: string[] = [];
  let tried = false;
  const h: OpenHooks = {
    reload: () => void log.push('reload'),
    update: async () => void log.push('update'),
    tried: { get: () => tried, set: () => void (tried = true) },
    say: (t) => void log.push(`say: ${t}`),
  };
  return { h, log };
}
const at = (name: string, version: number) => {
  const d = new Dexie(name);
  d.version(version).stores({ books: 'id' });
  opened.push(d);
  return d;
};

describe('app and saved books at different versions', () => {
  it('an older copy of the app still opens data a newer version upgraded (no empty library, no reload)', async () => {
    // Dexie 4 opens newer data from older code instead of failing, so this is the common case and it is safe.
    const name = `v-${Math.random()}`;
    const newer = at(name, 6);
    await newer.open();
    await newer.table('books').put({ id: 'kept' });
    newer.close();
    const { h, log } = hooks();
    const older = at(name, 5);
    await guardVersions(older, h);
    expect(await older.table('books').get('kept')).toEqual({ id: 'kept' });
    expect(log).toEqual([]);
  });

  it('if opening ever fails on a version mismatch, it updates and reloads once, then explains instead of looping', async () => {
    const { h, log } = hooks();
    const fake = { on: () => undefined, open: () => Promise.reject(Object.assign(new Error('old'), { name: 'VersionError' })) } as unknown as Dexie;
    await guardVersions(fake, h);
    expect(log).toEqual(['say: Updating YoomiRead…', 'update', 'reload']);
    await guardVersions(fake, h);
    expect(log[3]).toMatch(/older than your saved books/);
    expect(log.filter((l) => l === 'reload')).toHaveLength(1);
  });

  it('an open copy lets a newer version upgrade the data, then reloads', async () => {
    const name = `v-${Math.random()}`;
    const { h, log } = hooks();
    const old = at(name, 5);
    await guardVersions(old, h);
    const newer = at(name, 6);
    await newer.open(); // Would wait forever if the old copy held on.
    expect(log).toEqual(['reload']);
    expect(newer.verno).toBe(6);
  });

  it('opens normally when the versions match', async () => {
    const { h, log } = hooks();
    await guardVersions(at(`v-${Math.random()}`, 5), h);
    expect(log).toEqual([]);
  });
});
