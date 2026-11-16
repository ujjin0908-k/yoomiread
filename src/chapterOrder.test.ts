import { describe, expect, it } from 'vitest';
import { inOrder } from './chapterOrder';

describe('chapter order', () => {
  it('shows the list from the start, or newest first without changing the original', () => {
    const list = [1, 2, 3];
    expect(inOrder(list, 'start')).toEqual([1, 2, 3]);
    expect(inOrder(list, 'end')).toEqual([3, 2, 1]);
    expect(list).toEqual([1, 2, 3]);
  });
});
