// Offline dictionaries: English (ECDICT) and Chinese (CC-CEDICT), shortened and shipped with the app.
// Each file loads the first time it is needed, then stays on the phone for offline use.

import { gzipJson } from './gzipJson';

export interface Entry {
  /** Pinyin for Chinese words, phonetic spelling for English. */
  pron: string;
  /** Short meaning, one line per sense. */
  text: string;
}

type Dict = Record<string, [string, string]>;
const loaded: Partial<Record<'en' | 'zh', Promise<Dict>>> = {};

async function load(lang: 'en' | 'zh'): Promise<Dict> {
  loaded[lang] ??= (async () => {
    const res = await fetch(`/dict/${lang}.json.gz`);
    if (!res.ok) throw new Error('The dictionary could not be loaded.');
    return gzipJson<Dict>(res);
  })();
  return loaded[lang]!;
}

/** Looks a word up in the bundled dictionary. Undefined when the word is not in it. */
export async function lookup(lang: 'en' | 'zh', word: string): Promise<Entry | undefined> {
  const dict = await load(lang);
  const key = lang === 'en' ? word.toLowerCase() : word;
  const hit = dict[key];
  return hit ? { pron: hit[0], text: hit[1] } : undefined;
}
