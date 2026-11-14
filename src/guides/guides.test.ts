import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { mergeProfile } from '../translate/profiles';
import type { Book, GlossaryEntry } from '../types';
import { applyGuide, guideFor, parseGuide } from './index';
import { FOOLISH_GAME } from './foolish-game';

const book = (title: string) => ({ id: 'b', title }) as Book;
const row = (extra: Partial<GlossaryEntry>): GlossaryEntry => ({ id: 'x', bookId: 'b', original: 'X', english: 'X', kind: 'person', status: 'ok', locked: false, createdAt: 1, updatedAt: 1, ...extra });

describe('book guides', () => {
  beforeEach(async () => {
    await db.glossary.clear();
  });

  it('finds the built-in guide by the book title', () => {
    expect(guideFor(book('Foolish Game of the Gods'))).toBeDefined();
    expect(guideFor(book('The Foolish Game of Gods'))).toBeDefined();
    expect(guideFor(book('诸神愚戏'))).toBeDefined();
    expect(guideFor(book('Another Book'))).toBeUndefined();
  });

  it('has no repeated names within one kind', () => {
    for (const kind of ['person', 'place', 'god', 'group', 'term']) {
      const names = FOOLISH_GAME.entries.filter((e) => e.kind === kind).flatMap((e) => [e.english, ...(e.aliases ?? [])].map((n) => n.toLowerCase()));
      expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    }
  });

  it('fills in what is already there and adds the rest, approved', async () => {
    await db.glossary.bulkAdd([
      row({ id: 'cs', english: 'Cheng Shi', original: 'Cheng Shi', role: 'main', profile: { looks: [], about: [{ text: 'Mine', mine: true }], v: 2 } }),
      row({ id: 'fe', english: 'Fertility', original: 'Fertility', kind: 'god', note: 'my note' }),
    ]);
    const guide = parseGuide(
      JSON.stringify({
        book: 'Test',
        entries: [
          { english: 'Cheng Shi', original: '程实', kind: 'person', gender: 'he', about: ['Protagonist'], powers: ['Loom of Fate'] },
          { english: 'Birth', original: '诞育', kind: 'god', aliases: ['Fertility'], note: 'First god of Life', about: ['Rite: procreation'] },
          { english: 'Sea of Desire', original: '欲海', kind: 'place', note: "Corruption's domain" },
        ],
      }),
    );
    expect(await applyGuide('b', guide, 5)).toEqual({ added: 1, filled: 2 });
    const cs = await db.glossary.get('cs');
    expect(cs?.gender).toBe('he');
    expect(cs?.profile?.about).toEqual([{ text: 'Mine', mine: true }, { text: 'Protagonist', guide: true }]);
    expect(cs?.profile?.powers).toEqual([{ text: 'Loom of Fate', guide: true }]);
    const fe = await db.glossary.get('fe');
    expect(fe?.note).toBe('my note');
    expect(fe?.aliases).toContain('Birth');
    const sea = (await db.glossary.toArray()).find((g) => g.english === 'Sea of Desire');
    expect(sea?.status).toBe('ok');
    // Running it again adds nothing twice.
    expect(await applyGuide('b', guide, 6)).toEqual({ added: 0, filled: 3 });
    expect((await db.glossary.get('cs'))?.profile?.about).toHaveLength(2);
  });

  it('settles an old-style profile: old scene lines go, the owner\'s lines, quote and chapter mark stay', async () => {
    await db.glossary.add(row({ id: 'old', english: 'Cheng Shi', profile: { line: 'Priest', looks: [{ text: 'smiles', chapter: 4 }], about: [{ text: 'drinks wine', chapter: 7 }, { text: 'Mine', mine: true }], quote: { text: 'I won’t.', chapter: 9 }, upTo: 17 } }));
    await applyGuide('b', parseGuide(JSON.stringify({ entries: [{ english: 'Cheng Shi', kind: 'person', about: ['Protagonist'] }] })));
    const p = (await db.glossary.get('old'))?.profile;
    expect(p?.v).toBe(2);
    expect(p?.looks).toEqual([]);
    expect(p?.about.map((f) => f.text)).toEqual(['Mine', 'Protagonist']);
    expect([p?.line, p?.quote?.text, p?.upTo]).toEqual(['Priest', 'I won’t.', 17]);
  });

  it('keeps guide lines when an old-style profile is rebuilt and when lists are full', () => {
    const after = mergeProfile({ looks: [], about: [{ text: 'old scene line', chapter: 3 }, { text: 'Protagonist', guide: true }] }, undefined, 2, 1);
    expect(after.about).toEqual([{ text: 'Protagonist', guide: true }]);
  });

  it('corrects what an earlier guide added, so filling in again gives the Nature Cult its own entry', async () => {
    await db.glossary.add(row({ id: 'na', english: 'Natural Alliance', original: '自然教派', kind: 'group', aliases: ['Nature Sect', 'Naturalist Sect'] }));
    await applyGuide('b', FOOLISH_GAME);
    const groups = (await db.glossary.toArray()).filter((g) => g.kind === 'group');
    expect(groups.filter((g) => g.english === 'Natural Alliance')).toHaveLength(1);
    expect((await db.glossary.get('na'))?.original).toBe('Natural Alliance');
    expect(groups.find((g) => g.english === 'Nature Cult')?.original).toBe('自然教派');
    expect(groups.some((g) => g.english === 'Logic Association')).toBe(true);
  });

  it('says plainly when a file is not a guide', () => {
    expect(() => parseGuide('hello')).toThrow(/not JSON/);
    expect(() => parseGuide('{"x": 1}')).toThrow(/entries/);
  });
});
