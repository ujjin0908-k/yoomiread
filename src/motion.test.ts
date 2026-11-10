import { describe, expect, it } from 'vitest';
import { navKind } from './motion';

describe('navKind', () => {
  it('steps sideways between tabs, in the order of the tab bar', () => {
    expect(navKind([], ['library'])).toBe('tab-right');
    expect(navKind(['stats'], ['quotes'])).toBe('tab-left');
  });
  it('goes forward into a book and a chapter, and back out again', () => {
    expect(navKind(['library'], ['book', 'b1'])).toBe('forward');
    expect(navKind(['book', 'b1'], ['chapter', 'c1'])).toBe('forward');
    expect(navKind(['chapter', 'c1'], ['book', 'b1'])).toBe('back');
    expect(navKind(['settings'], [])).toBe('back');
  });
  it('fades between two chapters', () => {
    expect(navKind(['chapter', 'c1'], ['chapter', 'c2'])).toBe('fade');
  });
});
