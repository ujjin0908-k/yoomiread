import { describe, expect, it } from 'vitest';
import { parseVerdicts } from './theories';

describe('parseVerdicts', () => {
  it('reads one verdict per line and keeps only chapters already read', () => {
    const reply = [
      '{"n": 1, "verdict": "right", "chapter": 12, "why": "Su Mo opened the gate."}',
      '{"n": 2, "verdict": "wrong", "chapter": 40, "why": "He stayed."}',
      '{"n": 3, "verdict": "open", "chapter": null, "why": "Not settled yet."}',
    ].join('\n');
    expect(parseVerdicts(reply, 3, 20)).toEqual([
      { n: 1, verdict: 'right', chapter: 12, why: 'Su Mo opened the gate.' },
      // Chapter 40 is past the reader: dropped, never shown.
      { n: 2, verdict: 'wrong', chapter: undefined, why: 'He stayed.' },
      { n: 3, verdict: 'open', chapter: undefined, why: 'Not settled yet.' },
    ]);
  });

  it('skips lines that are not verdicts, numbers out of range and repeats', () => {
    const reply = 'Sure! Here you go:\n{"n": 5, "verdict": "right"}\n{"n": 1, "verdict": "true", "why": "x"}\n{"n": 1, "verdict": "wrong"}\n```';
    expect(parseVerdicts(reply, 2, 10)).toEqual([{ n: 1, verdict: 'right', chapter: undefined, why: 'x' }]);
  });

  it('treats anything unclear as still open', () => {
    expect(parseVerdicts('{"n": 1, "verdict": "maybe", "why": "?"}', 1, 10)[0].verdict).toBe('open');
  });
});
