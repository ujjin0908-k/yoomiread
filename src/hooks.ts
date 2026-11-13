import { noteRoute } from './trail';
import { liveQuery } from 'dexie';
import { useEffect, useRef, useState } from 'react';
import { afterPageChange, animatePage, markIntent, navKind } from './motion';

/** The last result of each named query, so a page opened again shows its data at once. */
const remembered = new Map<string, unknown>();
const idFor = (key: string, deps: unknown[]) => `${key}|${deps.map(String).join('|')}`;

/** Runs a named query once and keeps its result, so the page that uses it opens complete the first time too. */
export async function rememberAhead<T>(key: string, query: () => Promise<T>, deps: unknown[] = []): Promise<void> {
  const id = idFor(key, deps);
  if (remembered.has(id)) return;
  try {
    remembered.set(id, await query());
  } catch {
    // Only a head start: the page reads it again anyway.
  }
}

/**
 * Re-runs the query whenever the data it reads changes.
 *
 * With a `key`, the last result is remembered: a page opened again draws with it straight away instead of empty,
 * so a page change shows the finished page, and the fresh result is applied once the page change is over (it is
 * almost always the same data, and redrawing a big page mid-animation is what made screen changes stutter).
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], key?: string): T | undefined {
  const id = key === undefined ? undefined : idFor(key, deps);
  const [value, setValue] = useState<T | undefined>(() => (id ? (remembered.get(id) as T | undefined) : undefined));
  useEffect(() => {
    let live = true;
    const sub = liveQuery(query).subscribe({
      next: (fresh) => {
        const hadOne = id !== undefined && remembered.has(id);
        if (id) remembered.set(id, fresh);
        const apply = () => live && setValue(fresh);
        if (hadOne) afterPageChange(apply);
        else apply();
      },
      error: (e) => console.error(e),
    });
    return () => {
      live = false;
      sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Tiny hash router: #/book/<id>, #/chapter/<id>, #/settings. */
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  const shown = useRef(parts);
  useEffect(() => {
    noteRoute(shown.current);
    const onChange = () => {
      const from = shown.current;
      const to = read();
      shown.current = to;
      noteRoute(to);
      animatePage(
        navKind(from, to),
        () => {
          setParts(to);
          window.scrollTo(0, 0);
        },
        from,
        to,
      );
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parts;
}

export function go(path: string): void {
  markIntent();
  window.location.hash = path;
}

/** True while the phone has no connection. Updates as soon as the connection changes. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
