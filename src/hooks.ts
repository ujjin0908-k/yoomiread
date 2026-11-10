import { liveQuery } from 'dexie';
import { useEffect, useRef, useState } from 'react';
import { animatePage, markIntent, navKind } from './motion';

/** Re-runs the query whenever the data it reads changes. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
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
    const onChange = () => {
      const from = shown.current;
      const to = read();
      shown.current = to;
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
