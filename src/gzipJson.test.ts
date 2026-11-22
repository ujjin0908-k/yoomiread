import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { gzipJson } from './gzipJson';

describe('gzipJson', () => {
  it('reads the file whether or not the server already unpacked it', async () => {
    const json = JSON.stringify({ a: 'Dorothy' });
    expect(await gzipJson(new Response(gzipSync(json)))).toEqual({ a: 'Dorothy' });
    expect(await gzipJson(new Response(json))).toEqual({ a: 'Dorothy' });
  });
});
