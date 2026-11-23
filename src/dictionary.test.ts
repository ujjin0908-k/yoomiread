import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { japaneseBases, koreanBases, lookup, setDictionaryFetch } from './dictionary';

let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  // The real files the app ships.
  setDictionaryFetch(async (file) => {
    fetched.push(file);
    return new Response(readFileSync(`public/dict/${file}.json.gz`));
  });
});
afterEach(() => setDictionaryFetch((file) => fetch(`/dict/${file}.json.gz`)));

describe('Japanese dictionary (JMdict)', () => {
  it('finds a word and its reading', async () => {
    expect(await lookup('ja', '窓')).toMatchObject({ pron: 'まど', text: expect.stringMatching(/window/) });
  });

  it('finds the dictionary form of words as they appear in a story', async () => {
    expect(await lookup('ja', '開けて')).toMatchObject({ headword: '開ける', text: expect.stringMatching(/open/) });
    expect(await lookup('ja', 'つぶやいた')).toMatchObject({ headword: 'つぶやく', text: expect.stringMatching(/mutter|murmur/) });
    expect(await lookup('ja', '静かな')).toMatchObject({ headword: '静か', text: expect.stringMatching(/quiet/) });
    expect(await lookup('ja', '食べました')).toMatchObject({ headword: '食べる' });
    expect(await lookup('ja', '鳴っていた')).toMatchObject({ headword: '鳴る' });
  });

  it('loads the larger file only for a word that is not common', async () => {
    await lookup('ja', '窓');
    expect(fetched).toEqual(['ja']);
    expect(await lookup('ja', '冒険者')).toMatchObject({ text: expect.stringMatching(/adventurer/) });
    expect(fetched).toEqual(['ja', 'ja-more']);
  });

  it('guesses bases without inventing nonsense first', () => {
    expect(japaneseBases('書きます')).toContain('書く');
    expect(japaneseBases('読んだ')).toContain('読む');
    expect(japaneseBases('高かった')).toContain('高い');
    expect(japaneseBases('窓')[0]).toBe('窓');
  });
});

describe('Korean dictionary (Wiktionary via Kaikki)', () => {
  it('finds a word with its romanization and hanja', async () => {
    expect(await lookup('ko', '창문')).toMatchObject({ pron: expect.stringContaining('changmun'), text: expect.stringMatching(/window/) });
  });

  it('finds the dictionary word of a conjugated verb', async () => {
    expect(await lookup('ko', '먹었다')).toMatchObject({ headword: '먹다', text: expect.stringMatching(/eat/) });
    expect(await lookup('ko', '중얼거렸다')).toMatchObject({ headword: '중얼거리다', text: expect.stringMatching(/mutter/) });
    expect(await lookup('ko', '조용한')).toMatchObject({ headword: '조용하다' });
  });

  it('drops the particle on a noun', async () => {
    expect(await lookup('ko', '도시를')).toMatchObject({ headword: '도시', text: expect.stringMatching(/city/) });
    expect(await lookup('ko', '탑에서')).toMatchObject({ headword: '탑', text: expect.stringMatching(/tower/) });
    expect(koreanBases('민준은')).toContain('민준');
  });

  it('says nothing for a word it does not know', async () => {
    expect(await lookup('ko', '퀘퀘퀘퀘')).toBeUndefined();
  });
});

describe('English and Chinese still work', () => {
  it('looks up both', async () => {
    expect(await lookup('en', 'Window')).toBeDefined();
    expect(await lookup('zh', '窗户')).toBeDefined();
  });
});
