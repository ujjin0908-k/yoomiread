import type { Mood } from './mood';

/** Things he says when tapped. Written here, so they cost nothing. */
export const LINES: Record<Mood, string[]> = {
  happy: [
    'You are on a roll. I can feel the story pulling you along!',
    'Two chapters in a few days. My pointy hat is wiggling with joy.',
    'Keep going. I will keep the lamp lit.',
  ],
  idle: [
    'Shall we read a little together?',
    'This chapter is waiting for you. No rush.',
    'I will sit right here and listen while you read.',
  ],
  sad: [
    'It has been quiet. I miss the story.',
    'My pipe has gone cold without you.',
    'Come back when you are ready. The lamp is still on.',
  ],
  high: [
    'You have been reading for ages. Rest your eyes, friend.',
    'Ooh, the words are dancing. Maybe a walk now?',
    'Too much story at once. Water, then back to it.',
  ],
};

/** Picks one line for a chapter, the same one every time for that chapter. */
export function lineFor(mood: Mood, seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const list = LINES[mood];
  return list[h % list.length];
}
