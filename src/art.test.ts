import { describe, expect, it } from 'vitest';
import { DEFAULT_ART_STYLE, picturePrompt } from './art';
import { FOOLISH_GAME } from './guides/foolish-game';
import { FOOLISH_GAME_LOOKS } from './guides/foolish-game-looks';

describe('pictures', () => {
  it('gives every person, place, god, group and path of the guide a picture description, and no description goes unused', () => {
    const world = FOOLISH_GAME.entries.filter((e) => e.kind !== 'term' || e.english.startsWith('Path of'));
    expect(world.filter((e) => !e.look).map((e) => e.english)).toEqual([]);
    const names = new Set(FOOLISH_GAME.entries.map((e) => e.english));
    expect(Object.keys(FOOLISH_GAME_LOOKS).filter((n) => !names.has(n))).toEqual([]);
  });

  it('copies a whole prompt: what it is, how it looks, the style and a wide format', () => {
    const prompt = picturePrompt({ english: 'Fishbone Hall', kind: 'place', look: 'A cathedral of fish bones.' }, FOOLISH_GAME.style);
    expect(prompt).toContain('A landscape illustration of a place: Fishbone Hall.');
    expect(prompt).toContain('A cathedral of fish bones.');
    expect(prompt).toContain('Elden Ring');
    expect(prompt).toContain('Wide landscape format');
    expect(picturePrompt({ english: 'X', kind: 'god', look: 'y' })).toContain(DEFAULT_ART_STYLE);
  });
});
