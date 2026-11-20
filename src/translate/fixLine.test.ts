import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { fixMessages, pairAt, parseFix, replaceAt, saveFix } from './fixLine';

const zh = '大乙一脸振奋的跟在后面。\n可除了“姥姥的”之外，他实在找不到什么更能表达出当下心情的话。\n可随即他又看向屈言。';
const en = 'Da Yi followed behind, brimming with excitement.\n\nBut apart from "Granny\'s—", he truly couldn\'t find anything better.\n\nThen he glanced at Qu Yan.';

describe('check the original', () => {
  it('pairs an English paragraph with the Chinese one it came from', () => {
    const at = en.indexOf('Granny');
    const pair = pairAt(zh, en, at);
    expect(pair).toMatchObject({ index: 1, exact: true });
    expect(pair?.original).toContain('姥姥的');
  });

  it('makes a best guess when the paragraph counts differ', () => {
    const pair = pairAt(zh + '\n多出来的一段。', en, en.indexOf('Qu Yan'));
    expect(pair?.exact).toBe(false);
    expect(pair?.original).toBe('多出来的一段。');
  });

  it('trusts only Chinese that is really in the paragraph', () => {
    const para = '可除了“姥姥的”之外';
    expect(parseFix('Sure: {"original": "姥姥的", "literal": "grandma\'s", "meaning": "a mild curse", "suggestion": "Damn", "kind": "term"}', para)).toMatchObject({
      original: '姥姥的',
      suggestion: 'Damn',
      kind: 'term',
    });
    expect(parseFix('{"original": "奶奶的"}', para)).toBeUndefined();
    expect(parseFix('not json', para)).toBeUndefined();
  });

  it('sends the selection, the English and the Chinese paragraph', () => {
    const m = fixMessages({ original: '中文', english: 'English', quote: 'Granny' });
    expect(m[1].content).toContain('Selected English: Granny');
    expect(m[1].content).toContain('Original paragraph: 中文');
  });

  it('replaces exactly the selected words', () => {
    expect(replaceAt('apart from "Granny\'s—", he', 12, 20, 'Damn')).toBe('apart from "Damn—", he');
  });
});

describe('saveFix', () => {
  beforeEach(async () => {
    await Promise.all([db.translations.clear(), db.glossary.clear()]);
  });

  it('changes the chapter and adds a locked glossary entry, or updates the one with the same Chinese', async () => {
    await db.translations.add({ chapterId: 'c', bookId: 'b', text: 'He said "Granny\'s—" again.', model: 'm', createdAt: 1 });
    await saveFix({ chapterId: 'c', bookId: 'b', start: 9, end: 17, replacement: 'Damn', entry: { original: '姥姥的', english: 'Damn', note: 'a curse', kind: 'term' } });
    expect((await db.translations.get('c'))?.text).toBe('He said "Damn—" again.');
    const [g] = await db.glossary.toArray();
    expect(g).toMatchObject({ original: '姥姥的', english: 'Damn', status: 'ok', locked: true, kind: 'term' });

    await saveFix({ chapterId: 'c', bookId: 'b', start: 0, end: 0, entry: { original: '姥姥的', english: 'Hell', kind: 'term' } });
    const all = await db.glossary.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].english).toBe('Hell');
    expect(all[0].note).toBe('a curse');
  });
});
