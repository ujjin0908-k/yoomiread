import { describe, expect, it } from 'vitest';
import { chunkAt, sayable, speechChunks } from './chunks';
import { toWav } from './player';

describe('read aloud pieces', () => {
  const text = 'Cheng Shi smiled. "You lost." He left.\n\n？\n\nDa Yi followed behind, brimming with excitement......';

  it('keeps sentences whole, joins short ones and skips lines with nothing to say', () => {
    const c = speechChunks(text);
    expect(c.map((x) => x.text)).toEqual(['Cheng Shi smiled. "You lost." He left.', 'Da Yi followed behind, brimming with excitement…']);
    // Positions point back into the chapter text.
    expect(text.slice(c[1].start, c[1].end)).toBe('Da Yi followed behind, brimming with excitement......');
  });

  it('cuts a long sentence at a comma, never over the limit', () => {
    const long = Array.from({ length: 20 }, (_, i) => `part ${i} of a very long sentence`).join(', ') + '.';
    const c = speechChunks(long, 120);
    expect(c.length).toBeGreaterThan(3);
    expect(c.every((x) => x.end - x.start <= 120)).toBe(true);
    expect(c.map((x) => long.slice(x.start, x.end)).join(' ').replace(/\s+/g, ' ')).toBe(long);
  });

  it('reads names without their brackets', () => {
    expect(sayable('The gaze of [Fate] and 【Deceit】...')).toBe('The gaze of Fate and Deceit…');
  });

  it('starts from the piece the reader is at', () => {
    const c = speechChunks(text);
    expect(chunkAt(c, 0)).toBe(0);
    expect(chunkAt(c, text.indexOf('Da Yi'))).toBe(1);
    expect(chunkAt(c, 10_000)).toBe(0);
  });
});

describe('toWav', () => {
  it('writes a 16-bit mono WAV header and the samples', () => {
    const wav = new DataView(toWav(new Float32Array([0, 1, -1]), 24000));
    const tag = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(at + i)));
    expect([tag(0), tag(8), tag(36)]).toEqual(['RIFF', 'WAVE', 'data']);
    expect(wav.getUint32(24, true)).toBe(24000);
    expect(wav.byteLength).toBe(44 + 6);
    expect([wav.getInt16(44, true), wav.getInt16(46, true), wav.getInt16(48, true)]).toEqual([0, 32767, -32768]);
  });
});
