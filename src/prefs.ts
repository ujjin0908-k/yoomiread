import { useEffect, useState } from 'react';

export interface ReaderPrefs {
  /** 0 (small) to 4 (large). */
  size: number;
  font: 'serif' | 'sans' | 'garamond' | 'old';
  theme: 'paper' | 'sepia' | 'parchment' | 'mint' | 'night';
  spacing: 'snug' | 'normal' | 'airy';
  dropCap: boolean;
}

export const DEFAULT_PREFS: ReaderPrefs = { size: 2, font: 'serif', theme: 'paper', spacing: 'normal', dropCap: true };
export const FONT_SIZES = [16, 17.5, 19, 21, 23.5];
const KEY = 'yoomiread.reader';

function load(): ReaderPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Reader look, remembered on this device. */
export function useReaderPrefs(): [ReaderPrefs, (change: Partial<ReaderPrefs>) => void] {
  const [prefs, setPrefs] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Private mode: keep the choice for this visit only.
    }
  }, [prefs]);
  return [prefs, (change) => setPrefs((p) => ({ ...p, ...change }))];
}
