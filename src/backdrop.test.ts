import { describe, expect, it } from 'vitest';
import { mix } from './backdrop';

describe('status bar colour over a reading background', () => {
  it('mixes the page colour with the picture by how much of the picture shows', () => {
    expect(mix('#ffffff', [0, 0, 0], 0)).toBe('#ffffff');
    expect(mix('#ffffff', [0, 0, 0], 1)).toBe('#000000');
    expect(mix('#f7f3ea', [100, 80, 40], 0.2)).toBe('#dad2c3');
  });
});
