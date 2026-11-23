import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { LANGUAGES, TARGETS, targetOf } from './languages';
import { fixMessages } from './translate/fixLine';
import { chapterMessages } from './translate/prompt';
import { keepTranslation, titleBatchMessages, translateChapter } from './translate/run';
import type { TranslateSettings } from './types';

const base = { bookTitle: 'B', chapterTitle: 'C', text: '你好', glossary: [] };

describe('translating into Spanish or French', () => {
  it('tells the translator the language, in every rule that names it', () => {
    const es = chapterMessages({ ...base, target: TARGETS.es, style: { tone: 'literary', honorifics: 'english' } })[0].content;
    expect(es).toContain('into natural, readable Spanish');
    expect(es).toContain('one paragraph in Spanish');
    expect(es).toContain('the chapter title in Spanish');
    expect(es).toContain('Literary Spanish');
    expect(es).toContain('titles of respect into natural Spanish');
    // The story-so-far summary stays in English: the app's guide and recaps are in English.
    expect(es).toContain('the story so far in English');
  });

  it('leaves English books exactly as before', () => {
    expect(chapterMessages({ ...base, target: TARGETS.en })).toEqual(chapterMessages(base));
    expect(targetOf({})).toBe(TARGETS.en);
  });

  it('puts chapter titles and line checks into the book’s language', () => {
    expect(titleBatchMessages(['第1章'], [], LANGUAGES.zh, TARGETS.fr)[0].content).toContain('into French');
    expect(fixMessages({ original: '你好', english: 'Bonjour', quote: 'Bonjour', target: TARGETS.fr })[0].content).toContain('translated into French');
  });
});

describe('a Spanish translation, end to end', () => {
  const realFetch = globalThis.fetch;
  afterEach(async () => {
    globalThis.fetch = realFetch;
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('asks in Spanish and remembers the translation is Spanish', async () => {
    await db.books.add({ id: 'b', title: 'B', author: '', language: 'zh', target: 'es', shelf: 'reading', createdAt: 1, updatedAt: 1 });
    const chapter = { id: 'c1', bookId: 'b', number: 1, title: '第1章', read: false, createdAt: 1 };
    await db.addChapters([{ chapter, text: '天亮了。' }]);
    let sent = '';
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      const piece = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
      return new Response(piece('Amaneció.\n\n===TITLE===\nCapítulo uno') + 'data: [DONE]\n\n', { status: 200 });
    }) as typeof fetch;
    const settings: TranslateSettings = { baseUrl: 'https://example.test/v1', apiKey: 'k', models: [{ id: 'm', label: 'M' }], defaultModel: 'm' };
    const run = await translateChapter(chapter, { settings, model: 'm' } as never);
    await keepTranslation(run);
    expect(sent).toContain('into natural, readable Spanish');
    expect((await db.translations.get('c1'))!.lang).toBe('es');
  });
});
