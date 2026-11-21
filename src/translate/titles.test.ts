import { describe, expect, it } from 'vitest';
import type { GlossaryEntry } from '../types';
import { TITLE, SUMMARY, NEW_TERMS, cleanChapterTitle, splitReply } from './prompt';
import { parseTitleBatch, titleBatchMessages } from './run';

describe('chapter titles in English', () => {
  it('reads the title from a chapter reply, between the translation and the summary', () => {
    const reply = `Para one.\n\nPara two.\n${TITLE}\nInto the Dream\n${SUMMARY}\nSo far.\n${NEW_TERMS}\n`;
    const r = splitReply(reply);
    expect(r.title).toBe('Into the Dream');
    expect(r.text).toBe('Para one.\n\nPara two.');
    expect(r.summary).toBe('So far.');
  });

  it('still reads replies without a title', () => {
    expect(splitReply(`Text.\n${SUMMARY}\nSo far.`).title).toBeUndefined();
  });

  it('cleans a title', () => {
    expect(cleanChapterTitle('**Chapter 589: "Into the Dream"**')).toBe('Into the Dream');
    expect(cleanChapterTitle('\n  Side Story: Survivors\nextra')).toBe('Side Story: Survivors');
    expect(cleanChapterTitle('   ')).toBeUndefined();
  });

  it('asks for a batch with only the names in those titles, and reads numbered lines back', () => {
    const g = (original: string, english: string) => ({ id: original, bookId: 'b', original, english, kind: 'person', status: 'ok', locked: false, createdAt: 1, updatedAt: 1 }) as GlossaryEntry;
    const m = titleBatchMessages(['第589章 入梦', '第590章 程实的计划'], [g('程实', 'Cheng Shi'), g('秦薪', 'Qin Xin')]);
    expect(m[1].content).toContain('程实 = Cheng Shi');
    expect(m[1].content).not.toContain('秦薪');
    expect(m[1].content).toContain('2. 第590章 程实的计划');
    const back = parseTitleBatch('1. Into the Dream\n2) Cheng Shi’s Plan\n7. Out of range\nnoise', 2);
    expect([...back.entries()]).toEqual([
      [0, 'Into the Dream'],
      [1, 'Cheng Shi’s Plan'],
    ]);
  });
});
