import { describe, expect, it } from 'vitest';
import { chunkAt, sayable, speechChunks } from './chunks';
import { englishVoices } from './player';

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

describe('phone voices', () => {
  it('keeps English voices, Premium first, then Enhanced, then the rest, each once', () => {
    const v = (name: string, lang = 'en-US', voiceURI = name) => ({ name, lang, voiceURI });
    const list = englishVoices([v('Samantha'), v('Ting-Ting', 'zh-CN'), v('Ava (Premium)'), v('Daniel', 'en-GB'), v('Evan (Enhanced)'), v('Samantha')]);
    expect(list.map((x) => x.name)).toEqual(['Ava (Premium)', 'Evan (Enhanced)', 'Samantha', 'Daniel']);
  });

  it('leaves out the novelty and robotic voices, and finds Premium by the id', () => {
    const v = (name: string, voiceURI = name, lang = 'en-US') => ({ name, lang, voiceURI });
    const list = englishVoices([
      v('Albert', 'com.apple.speech.synthesis.voice.Albert'),
      v('Bad News'),
      v('Grandma (English (US))', 'com.apple.eloquence.en-US.Grandma'),
      v('Zoe', 'com.apple.voice.premium.en-US.Zoe'),
      v('Samantha', 'com.apple.voice.compact.en-US.Samantha'),
    ]);
    expect(list.map((x) => x.name)).toEqual(['Zoe', 'Samantha']);
  });
});
