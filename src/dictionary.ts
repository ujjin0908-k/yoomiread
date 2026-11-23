// Offline dictionaries, shortened and shipped with the app (credits in public/dict/NOTICE.txt and Settings):
// English (ECDICT), Chinese (CC-CEDICT), Japanese (JMdict, in two files: common words, then the rest) and Korean
// (Wiktionary via Kaikki, with inflected forms pointing to their dictionary word).
// Each file loads the first time it is needed, then stays on the phone for offline use.

import { gzipJson } from './gzipJson';

export interface Entry {
  /** Pinyin for Chinese, the kana reading for Japanese, the romanization (and hanja) for Korean, phonetics for English. */
  pron: string;
  /** Short meaning, one line per sense. */
  text: string;
  /** The dictionary word, when the tapped word was a form of it (食べた → 食べる, 먹었다 → 먹다). */
  headword?: string;
}

type Dict = Record<string, [string, string]>;
type DictFile = 'en' | 'zh' | 'ja' | 'ja-more' | 'ko';
const loaded: Partial<Record<DictFile, Promise<Dict>>> = {};

/** Fetches a dictionary file. `get` can be replaced in tests. */
let get = (file: DictFile) => fetch(`/dict/${file}.json.gz`);
export function setDictionaryFetch(f: typeof get): void {
  get = f;
  for (const k of Object.keys(loaded) as DictFile[]) delete loaded[k];
}

async function load(file: DictFile): Promise<Dict> {
  loaded[file] ??= (async () => {
    const res = await get(file);
    if (!res.ok) throw new Error('The dictionary could not be loaded.');
    return gzipJson<Dict>(res);
  })().catch((e) => {
    delete loaded[file];
    throw e;
  });
  return loaded[file]!;
}

/** Languages a word can be looked up in from the reader. */
export type LookupLanguage = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr';

/**
 * Dictionary forms a conjugated Japanese word could come from, nearest first (つぶやいた → つぶやく, 開けて → 開ける,
 * 静かな → 静か). Rough rules on purpose: every guess is checked against the dictionary, so a wrong one costs nothing.
 */
export function japaneseBases(word: string): string[] {
  const out = [word];
  const stems: string[] = [];
  const add = (stem: string, ends: string[]) => {
    ends.forEach((e) => out.push(stem + e));
    stems.push(stem);
  };
  const rules: [RegExp, string[]][] = [
    [/(ませんでした|ません|ました|ます|ましょう)$/, ['る', 'う', 'く', 'す', 'つ', 'ぬ', 'む', 'ぶ', 'ぐ']],
    [/(なかった|ない|なくて)$/, ['る', 'う']],
    [/(っていた|ってい|った|って)$/, ['う', 'つ', 'る']],
    [/(んでいた|んだ|んで)$/, ['む', 'ぶ', 'ぬ']],
    [/(いていた|いた|いて)$/, ['く']],
    [/(いでいた|いだ|いで)$/, ['ぐ']],
    [/(していた|した|して|します|しない)$/, ['する', 'す']],
    [/(ていた|ている|てる|た|て|られる|られた|させる|れる|よう)$/, ['る']],
    [/(かった|くて|くない|く|さ|そう|すぎる)$/, ['い']],
    [/(な|に|だ|だった|です|でした)$/, ['']],
  ];
  for (const [re, ends] of rules) {
    const m = re.exec(word);
    if (m && m.index > 0) add(word.slice(0, m.index), ends);
  }
  // Godan stems before ます/ない: 書き → 書く, 書か → 書く.
  const iRow: Record<string, string> = { き: 'く', ぎ: 'ぐ', し: 'す', ち: 'つ', に: 'ぬ', び: 'ぶ', み: 'む', り: 'る', い: 'う' };
  const aRow: Record<string, string> = { か: 'く', が: 'ぐ', さ: 'す', た: 'つ', な: 'ぬ', ば: 'ぶ', ま: 'む', ら: 'る', わ: 'う' };
  for (const stem of stems) {
    const last = stem.slice(-1);
    if (iRow[last]) out.push(stem.slice(0, -1) + iRow[last]);
    if (aRow[last]) out.push(stem.slice(0, -1) + aRow[last]);
  }
  // The bare stem last (書き is also a noun, but 書く is the better guess).
  out.push(...stems.filter(Boolean));
  return [...new Set(out)];
}

/** Korean particles and endings that attach to a word (민준은, 도시를, 탑에서), longest first. */
const KO_PARTICLES = ['으로부터', '에게서', '한테서', '이라고', '께서', '에서', '에게', '한테', '으로', '까지', '부터', '처럼', '보다', '마다', '이랑', '하고', '이나', '라고',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '로', '와', '과', '랑', '나', '야', '아'];

/** The word, then the word without a particle (도시를 → 도시). */
export function koreanBases(word: string): string[] {
  const out = [word];
  for (const p of KO_PARTICLES) if (word.length > p.length && word.endsWith(p)) out.push(word.slice(0, -p.length));
  return [...new Set(out)];
}

const entryOf = (hit: [string, string], headword?: string): Entry => ({ pron: hit[0], text: hit[1], headword });

/** Looks a word up in the bundled dictionary. Undefined when the word is not in it. */
export async function lookup(lang: LookupLanguage, word: string): Promise<Entry | undefined> {
  if (lang === 'en' || lang === 'zh') {
    const hit = (await load(lang))[lang === 'en' ? word.toLowerCase() : word];
    return hit ? entryOf(hit) : undefined;
  }
  // Spanish and French: no offline dictionary yet (the word sheet links to RAE and Larousse).
  if (lang === 'es' || lang === 'fr') return undefined;
  if (lang === 'ko') {
    const dict = await load('ko');
    for (const base of koreanBases(word)) {
      const hit = dict[base];
      if (!hit) continue;
      // An inflected form points to its dictionary word: "=먹다".
      if (hit[0].startsWith('=')) {
        const head = hit[0].slice(1);
        const main = dict[head];
        if (main) return entryOf(main, head);
        continue;
      }
      return entryOf(hit, base === word ? undefined : base);
    }
    return undefined;
  }
  // Japanese: common words first; the larger file loads only when a word is not among them.
  const bases = japaneseBases(word);
  for (const file of ['ja', 'ja-more'] as const) {
    const dict = await load(file);
    for (const base of bases) {
      const hit = dict[base];
      if (hit) return entryOf(hit, base === word ? undefined : base);
    }
  }
  return undefined;
}
