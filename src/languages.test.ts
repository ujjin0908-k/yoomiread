import { describe, expect, it } from 'vitest';
import { guessGenre } from './genres';
import { isHeading } from './import/chapters';
import { chapterNumber } from './import/web';
import { guessSource, htmlLangOfText, LANGUAGES } from './languages';
import { estimateMinutes, guessLanguage, needsTranslation, readingMinutes } from './logic';
import { chapterMessages, glossaryScanMessages, parseTerms, titleMessages } from './translate/prompt';
import { titleBatchMessages } from './translate/run';

// Short sentences written for these tests.
const JA = '朝になると、ユキは窓を開けて静かな町を見下ろした。「今日こそ、あの塔に行くんだ」と彼女は小さくつぶやいた。'.repeat(8);
const KO = '아침이 되자 민준은 창문을 열고 조용한 도시를 내려다보았다. "오늘은 꼭 그 탑에 갈 거야." 그는 작게 중얼거렸다.'.repeat(8);
const ZH = '天亮的时候，林梅推开窗户，看着安静的小城。“今天一定要去那座塔。”她小声说道。'.repeat(8);

describe('telling the languages apart', () => {
  it('knows Japanese by its kana, Korean by its hangul, Chinese by Han alone', () => {
    expect(guessSource(JA)).toBe('ja');
    expect(guessSource(KO)).toBe('ko');
    expect(guessSource(ZH)).toBe('zh');
    expect(guessSource('The morning was quiet. '.repeat(20))).toBeUndefined();
    expect(guessLanguage(JA)).toBe('ja');
    expect(guessLanguage(KO)).toBe('ko');
    expect(guessLanguage(ZH)).toBe('zh');
    expect(guessLanguage('The morning was quiet. '.repeat(20))).toBe('en');
  });

  it('treats Japanese and Korean books as books to translate', () => {
    expect(needsTranslation({ language: 'ja' }, JA)).toBe(true);
    expect(needsTranslation({ language: 'ko' }, KO)).toBe(true);
  });

  it('sets the right lang for a name, letting the book decide for kanji-only names', () => {
    expect(htmlLangOfText('ユキ')).toBe('ja');
    expect(htmlLangOfText('민준')).toBe('ko');
    expect(htmlLangOfText('林梅')).toBe('zh');
    expect(htmlLangOfText('田中', 'ja')).toBe('ja');
    expect(htmlLangOfText('Yuki')).toBeUndefined();
  });

  it('counts reading time for kana and hangul by characters', () => {
    expect(readingMinutes('가'.repeat(1000))).toBe(2);
    expect(readingMinutes('あ'.repeat(1000))).toBe(2);
    expect(estimateMinutes(1000, 'ko')).toBe(2);
    expect(estimateMinutes(800, 'zh')).toBe(2);
  });
});

describe('instructions for Japanese and Korean books', () => {
  it('names the language, and leaves Chinese books exactly as before', () => {
    const base = { bookTitle: 'B', chapterTitle: 'C', text: 'x', glossary: [] };
    expect(chapterMessages({ ...base, source: LANGUAGES.ja })[0].content).toContain('You translate Japanese web novels');
    expect(chapterMessages({ ...base, source: LANGUAGES.ko })[0].content).toContain('"original" is the Korean text');
    expect(chapterMessages({ ...base, source: LANGUAGES.zh })).toEqual(chapterMessages(base));
    expect(chapterMessages(base)[0].content).toContain('You translate Chinese web novels');
  });

  it('asks for names romanised the way each language does it', () => {
    const scan = (source = LANGUAGES.zh) => glossaryScanMessages({ bookTitle: 'B', sample: 'x', known: [], source })[0].content;
    expect(scan(LANGUAGES.ja)).toContain('Hepburn');
    expect(scan(LANGUAGES.ko)).toContain('Revised Romanization');
    expect(scan()).toContain('pinyin');
    expect(titleMessages('東京の夜', undefined, LANGUAGES.ja)[0].content).toContain('Japanese book titles');
    expect(titleBatchMessages(['제3화 각성'], [], LANGUAGES.ko)[0].content).toContain('Korean web novel');
  });

  it('keeps names written in the book’s own script, and drops English ones', () => {
    const reply = [
      '{"original": "ユキ", "english": "Yuki", "kind": "person", "gender": "she"}',
      '{"original": "민준", "english": "Minjun", "kind": "person", "gender": "he"}',
      '{"original": "Yuki", "english": "Yuki", "kind": "person"}',
    ].join('\n');
    expect(parseTerms(reply, false, LANGUAGES.ja).map((t) => t.english)).toEqual(['Yuki']);
    expect(parseTerms(reply, false, LANGUAGES.ko).map((t) => t.english)).toEqual(['Minjun']);
  });
});

describe('Japanese and Korean chapters', () => {
  it('finds chapter headings in PDFs', () => {
    expect(isHeading('第12話 旅立ち')).toBe(true);
    expect(isHeading('プロローグ')).toBe(true);
    expect(isHeading('제3화 각성')).toBe(true);
    expect(isHeading('12화')).toBe(true);
    expect(isHeading('프롤로그')).toBe(true);
    expect(isHeading('第12話を読んだあと、彼は外に出た。')).toBe(false);
    expect(isHeading('12화를 보고 나서 그는 잠들었다.')).toBe(false);
  });

  it('reads chapter numbers from Korean titles', () => {
    expect(chapterNumber('제12화 귀환')).toBe(12);
    expect(chapterNumber('35화')).toBe(35);
    expect(chapterNumber('第7話')).toBe(7);
  });

  it('guesses the genre from Korean and Japanese words', () => {
    const hunter = '헌터들이 던전 게이트 앞에 모였다. 각성한 지 사흘 만에 그는 마왕의 기척을 느꼈다. '.repeat(12);
    expect(guessGenre(hunter)).toBe('fantasy');
    const isekai = '異世界に来た勇者は、冒険者ギルドで魔法を学び、ダンジョンへ向かった。'.repeat(20);
    expect(guessGenre(isekai)).toBe('fantasy');
  });
});
