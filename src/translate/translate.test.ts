import { describe, expect, it } from 'vitest';
import type { GlossaryEntry, TranslateSettings } from '../types';
import { chat, readStream, TranslateError } from './api';
import { chapterMessages, costOf, estimateTokens, NEW_TERMS, parseTerms, pronounWarnings, splitReply } from './prompt';

const entry = (over: Partial<GlossaryEntry>): GlossaryEntry => ({
  id: over.original ?? 'x',
  bookId: 'b1',
  original: '梅',
  english: 'Mei',
  kind: 'person',
  gender: 'she',
  locked: false,
  status: 'ok',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      // Split oddly on purpose: pieces must be stitched back together.
      const all = lines.map((l) => `data: ${l}\n\n`).join('');
      for (let i = 0; i < all.length; i += 7) c.enqueue(enc.encode(all.slice(i, i + 7)));
      c.close();
    },
  });
}

const delta = (s: string) => JSON.stringify({ choices: [{ delta: { content: s } }] });

describe('prompt', () => {
  it('uses only approved glossary entries, with pronouns', () => {
    const msgs = chapterMessages({
      bookTitle: 'B',
      chapterTitle: '第一章',
      text: '梅走了。',
      glossary: [entry({}), entry({ original: '渡口', english: 'the Ferry', kind: 'place', gender: undefined, status: 'review' })],
    });
    expect(msgs[1].content).toContain('梅 = Mei (she)');
    expect(msgs[1].content).not.toContain('渡口');
    expect(msgs[0].content).toContain(NEW_TERMS);
  });
});

describe('reading the reply', () => {
  it('splits the translation from new terms and tidies paragraphs', () => {
    const reply = `Mei walked on.\n\n\nThe river was quiet.\n${NEW_TERMS}\n{"original": "船夫", "english": "the ferryman", "kind": "person", "gender": "he"}\n`;
    const { text, terms } = splitReply(reply);
    expect(text).toBe('Mei walked on.\n\nThe river was quiet.');
    expect(terms).toEqual([{ original: '船夫', english: 'the ferryman', kind: 'person', gender: 'he', note: undefined }]);
  });

  it('copes with no marker, bullets, junk and duplicates', () => {
    expect(splitReply('Just text.').terms).toEqual([]);
    const terms = parseTerms('- {"original":"灯","english":"lantern","kind":"weird"}\nnot json\n{"original":"灯","english":"again"}\n{"english":"no original"}');
    expect(terms).toEqual([{ original: '灯', english: 'lantern', kind: 'term', gender: undefined, note: undefined }]);
  });

  it('drops gender for places and terms', () => {
    expect(parseTerms('{"original":"河","english":"River","kind":"place","gender":"she"}')[0].gender).toBeUndefined();
  });
});

describe('cost', () => {
  it('estimates tokens for Chinese text and prices them', () => {
    const { input, output } = estimateTokens('字'.repeat(4000));
    expect(input).toBeGreaterThan(4000);
    expect(output).toBeGreaterThan(3000);
    // Haiku on the owner's provider: a 4,000-character chapter is well under a cent.
    const cost = costOf({ id: 'h', label: 'h', inputPrice: 0.066, outputPrice: 0.332 }, input, output)!;
    expect(cost).toBeGreaterThan(0.0005);
    expect(cost).toBeLessThan(0.01);
    expect(costOf({ id: 'x', label: 'x' }, 1, 1)).toBeUndefined();
  });
});

describe('pronoun check', () => {
  const g = [entry({}), entry({ original: '少年', english: 'Lan', gender: 'he' })];
  it('flags a person whose pronouns flip', () => {
    const text = 'Mei lifted his lantern. He smiled.\n\nMei said he would wait. His coat was wet.';
    expect(pronounWarnings(text, g)[0]).toContain('Mei is "she"');
  });
  it('ignores paragraphs with two people, and correct ones', () => {
    expect(pronounWarnings('Mei and Lan crossed. He laughed. He waved. His hat flew.', g)).toEqual([]);
    expect(pronounWarnings('Mei raised her lantern. She waited.', g)).toEqual([]);
  });
});

describe('streaming', () => {
  it('stitches split chunks and reads usage', async () => {
    const got: string[] = [];
    const r = await readStream(
      sse([delta('Mei '), delta('walked.'), JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }), '[DONE]']),
      (p) => got.push(p),
    );
    expect(r).toEqual({ text: 'Mei walked.', inputTokens: 12, outputTokens: 3 });
    expect(got.join('')).toBe('Mei walked.');
  });

  it('turns an error event into a TranslateError', async () => {
    await expect(readStream(sse([JSON.stringify({ error: { message: 'overloaded' } })]), () => {})).rejects.toThrow('overloaded');
  });
});

describe('chat retries', () => {
  const settings: TranslateSettings = { baseUrl: 'https://example.test/v1', apiKey: 'k', models: [], defaultModel: 'm' };
  const realFetch = globalThis.fetch;

  it('retries a 503 before any text arrived, then succeeds', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1 ? new Response('busy', { status: 503 }) : new Response(sse([delta('ok'), '[DONE]']), { status: 200 });
    }) as typeof fetch;
    try {
      const r = await chat(settings, 'm', [], () => {}, undefined, async () => {});
      expect(r.text).toBe('ok');
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('does not retry a refused key, and says why', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('nope', { status: 401 });
    }) as typeof fetch;
    try {
      await expect(chat(settings, 'm', [], () => {}, undefined, async () => {})).rejects.toThrow(/refused the API key/);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('asks for settings when the key is missing', async () => {
    await expect(chat({ ...settings, apiKey: ' ' }, 'm', [])).rejects.toBeInstanceOf(TranslateError);
  });
});
