/**
 * Reads a JSON file that is stored gzipped (`.json.gz`). Some servers send it as is, others mark it as compressed so
 * the browser unpacks it on the way; the first two bytes (1f 8b) tell which, so both work.
 */
export async function gzipJson<T>(res: Response): Promise<T> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const zipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = zipped
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}
