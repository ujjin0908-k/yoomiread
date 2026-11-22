import { describe, expect, it } from 'vitest';
import { GENRES, genreOf, guessGenre, kindLabel, kindsShown } from './genres';
import { parseWorldReply, searchKinds, worldMessages } from './translate/profiles';
import type { GlossaryEntry } from './types';

const chunk = [{ chapter: 3, text: 'Chapter text.' }];
const entry = (kind: GlossaryEntry['kind']) => ({ id: kind, bookId: 'b', original: kind, english: kind, kind, locked: false, status: 'ok', createdAt: 0, updatedAt: 0 }) as GlossaryEntry;
const system = (genre?: string, known: GlossaryEntry[] = []) =>
  worldMessages({ book: { id: 'b', title: 'Book', genre } as never, chunk, known })[0].content;

describe('genre presets', () => {
  it('leaves a book without a genre as it always was', () => {
    expect(genreOf({}).id).toBe('general');
    expect(genreOf(undefined).kinds).toEqual(['person', 'place', 'god', 'group', 'term']);
    const text = system();
    expect(text).toContain('"kind": "person|place|god|group|term"');
    expect(text).toContain('god: a god, deity or divine power');
  });

  it('names the kinds in the words of the genre', () => {
    const fantasy = genreOf({ genre: 'fantasy' });
    expect(kindLabel(fantasy, 'god', true)).toBe('Powers');
    expect(kindLabel(fantasy, 'group')).toBe('Faction');
    expect(kindLabel(genreOf({ genre: 'cultivation' }), 'group', true)).toBe('Sects & clans');
    expect(kindLabel(genreOf({ genre: 'mystery' }), 'term', true)).toBe('Clues');
  });

  it('every preset has a label and a search line for every kind', () => {
    for (const g of GENRES) {
      for (const k of ['person', 'place', 'god', 'group', 'term'] as const) {
        expect(g.label[k][0], `${g.id} ${k}`).toBeTruthy();
        expect(g.scan[k], `${g.id} ${k}`).toBeTruthy();
      }
      expect(g.kinds[0]).toBe('person');
    }
  });

  it('never hides entries a book already has', () => {
    const scifi = genreOf({ genre: 'scifi' });
    expect(kindsShown(scifi, [])).not.toContain('god');
    expect(kindsShown(scifi, ['god', 'person'])).toContain('god');
  });

  it('asks only for the kinds the genre uses', () => {
    const text = system('scifi');
    expect(text).toContain('"kind": "person|place|group|term"');
    expect(text).not.toContain('god:');
    expect(text).toContain('place: a planet, moon, station, ship');
    expect(text).toContain('"commands"');
    // A sci-fi book that already has a god keeps being asked about gods.
    expect(system('scifi', [entry('god')])).toContain('god: a god, AI or other great power');
    expect(searchKinds({ genre: 'romance' }, [])).toEqual(['person', 'place', 'group', 'term']);
  });

  it('turns a kind that was not asked for into a term', () => {
    const raw = [
      '{"new": "Eru", "english": "Eru", "kind": "god", "note": "Creator", "ch": 3}',
      '{"new": "Lyra", "english": "Lyra", "kind": "person", "gender": "she", "ch": 3}',
      '{"new": "X", "english": "X", "kind": "starship", "ch": 3}',
    ].join('\n');
    const { fresh } = parseWorldReply(raw, chunk, searchKinds({ genre: 'scifi' }, []));
    expect(fresh.map((f) => f.kind)).toEqual(['term', 'person', 'person']);
    // Without a list, every kind is allowed, as before.
    expect(parseWorldReply(raw, chunk).fresh[0].kind).toBe('god');
  });
});

describe('guessGenre', () => {
  const fill = (words: string) => `${words} The day went on as days do. `.repeat(40);

  it('spots each genre from its own words', () => {
    expect(guessGenre(fill('The elder of the sect watched the disciples cultivate their qi.'))).toBe('cultivation');
    expect(guessGenre(fill('The wizard cast a spell as the dragon flew over the kingdom.'))).toBe('fantasy');
    expect(guessGenre(fill('The starship left orbit around the planet with the fleet.'))).toBe('scifi');
    expect(guessGenre(fill('The detective studied the evidence from the crime scene; the suspect had an alibi.'))).toBe('mystery');
    expect(guessGenre(fill('Her boyfriend leaned in for a kiss and she started to blush.'))).toBe('romance');
    expect(guessGenre('他是宗门的弟子，每天修炼灵气，长老说他快要筑基了。'.repeat(40))).toBe('cultivation');
  });

  it('says nothing when the text is short or unclear', () => {
    expect(guessGenre('A dragon.')).toBeUndefined();
    expect(guessGenre(fill('She walked to the shop and bought some bread.'))).toBeUndefined();
    // Two genres at the same strength: no guess.
    expect(guessGenre(fill('The wizard met the detective.'))).toBeUndefined();
  });
});
