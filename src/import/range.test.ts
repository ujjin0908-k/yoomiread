import { describe, expect, it } from 'vitest';
import { guessNumbers, inRange, placeNumbers, rangeLabel } from './range';
import { scriptOnlyReason } from './web';

describe('guessNumbers', () => {
  it('reads numbers from titles and counts on for titles without one', () => {
    expect(guessNumbers(['Chapter 521: Fate', 'Side story', '第523章 命运', 'Ch. 524'])).toEqual([521, 522, 523, 524]);
  });
  it('starts at 1 when the first titles have no number', () => {
    expect(guessNumbers(['Prologue', 'The start'])).toEqual([1, 2]);
  });
});

describe('inRange', () => {
  const nums = [519, 520, 521, 522, 1488];
  it('keeps both ends', () => expect(inRange(nums, 520, 522)).toEqual([1, 2, 3]));
  it('works with one end open', () => expect(inRange(nums, 521)).toEqual([2, 3, 4]));
  it('accepts the ends swapped', () => expect(inRange(nums, 522, 521)).toEqual([2, 3]));
});

describe('placeNumbers', () => {
  it('keeps free numbers and moves taken ones to the end', () => {
    expect(placeNumbers([520, 521, 522], [1, 2, 520])).toEqual([521, 522, 523]);
    expect(placeNumbers([3, 600], [1, 2, 600])).toEqual([3, 601]);
  });
  it('never gives two chapters the same number', () => {
    expect(placeNumbers([5, 5, 5], [])).toEqual([5, 6, 7]);
  });
});

describe('rangeLabel', () => {
  it('names the ends', () => expect(rangeLabel([523, 521, 600])).toBe('chapters 521 to 600'));
  it('handles one chapter', () => expect(rangeLabel([7])).toBe('chapter 7'));
});

describe('scriptOnlyReason', () => {
  it('explains WTR-LAB and points to the file import', () => {
    expect(scriptOnlyReason('https://wtr-lab.com/en/novel/10931/the-fool-of-the-gods/chapter-520')).toMatch(/From a file/);
  });
  it('says nothing for other sites', () => expect(scriptOnlyReason('https://futiledevices.blog/x')).toBeUndefined());
});
