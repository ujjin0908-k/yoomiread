// Fetches one web page for the app, so the phone can import a chapter from a link.
// Only the sites listed here are reachable, and only over http or https on the normal ports.
// Add a site to ALLOWED_SITES before the app can import from it.
export const ALLOWED_SITES = ['page.kakao.com', 'series.naver.com'];

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

/** Returns the address to fetch, or an error saying why it is refused. */
export function checkWebUrl(raw: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'That is not a web address.';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only web addresses (http or https) can be fetched.';
  if (url.username || url.password) return 'Addresses with a login in them are not fetched.';
  if (url.port && url.port !== '80' && url.port !== '443') return 'Only the normal web ports can be fetched.';
  const host = url.hostname.toLowerCase();
  // Plain IP addresses and this machine itself are never fetched.
  if (/^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost' || host.endsWith('.local')) {
    return 'That address is not allowed.';
  }
  const allowed = ALLOWED_SITES.some((site) => host === site || host.endsWith(`.${site}`));
  if (!allowed) return `${host} is not on the list of sites the app can read.`;
  return url;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('The page is too large.');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(all);
}

export default async (request: Request): Promise<Response> => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

  const raw = new URL(request.url).searchParams.get('url') ?? '';
  let url = checkWebUrl(raw);
  if (typeof url === 'string') return json(400, { error: url });

  try {
    // Redirects are followed by hand so each new address is checked against the list too.
    for (let hop = 0; ; hop++) {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'accept-language': 'ko,zh;q=0.9,en;q=0.8',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop >= MAX_REDIRECTS) return json(502, { error: 'The site redirected too many times.' });
        const next = checkWebUrl(new URL(res.headers.get('location')!, url).href);
        if (typeof next === 'string') return json(400, { error: next });
        url = next;
        continue;
      }
      if (!res.ok) return json(502, { error: `The site answered ${res.status}.` });
      return json(200, { url: url.href, html: await readCapped(res) });
    }
  } catch (e) {
    const message = e instanceof Error && e.message === 'The page is too large.' ? e.message : 'Could not reach that site.';
    return json(502, { error: message });
  }
};
