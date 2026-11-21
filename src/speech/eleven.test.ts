import { describe, expect, it } from 'vitest';
import { speechChunks } from './chunks';
import { chapterCost, chunkAtTime, partOfChunk, partsOf, timeOfChunk } from './eleven';

const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here and it has some words in it.`).join('\n\n');
const chunks = speechChunks(text);

describe('ElevenLabs parts', () => {
  it('groups sentences into parts under the limit, in order, never splitting one', () => {
    const parts = partsOf(chunks, 300);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.every((p) => p.text.length <= 300)).toBe(true);
    expect(parts[0].from).toBe(0);
    expect(parts.at(-1)!.to).toBe(chunks.length);
    for (let i = 1; i < parts.length; i++) expect(parts[i].from).toBe(parts[i - 1].to);
  });

  it('finds the part of a sentence, and the sentence at a time in a part', () => {
    const parts = partsOf(chunks, 300);
    const p = partOfChunk(parts, 7);
    expect(7).toBeGreaterThanOrEqual(parts[p].from);
    expect(7).toBeLessThan(parts[p].to);
    expect(chunkAtTime(chunks, parts[0], 0)).toBe(0);
    expect(chunkAtTime(chunks, parts[0], 0.999)).toBe(parts[0].to - 1);
    const t = timeOfChunk(chunks, parts[p], 7);
    expect(chunkAtTime(chunks, parts[p], t + 0.001)).toBe(7);
  });

  it('prices a chapter with Flash: half a credit and $0.04 per 1,000 characters', () => {
    const cost = chapterCost([{ from: 0, to: 1, text: 'x'.repeat(10_000) }]);
    expect(cost).toEqual({ chars: 10_000, credits: 5_000, dollars: 0.4 });
  });
});
