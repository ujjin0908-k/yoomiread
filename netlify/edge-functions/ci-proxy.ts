// Passes the app's translation requests to the provider on the same site, so the browser never
// calls the provider directly (it blocks that). The API key comes from the phone, in the request header.
const UPSTREAM = 'https://api.cheaperinference.com';
const ALLOWED = /^\/api\/ci\/v1\/(chat\/completions|messages|models)$/;

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  if (!ALLOWED.test(url.pathname)) return new Response('not found', { status: 404 });

  const headers = new Headers();
  for (const name of ['authorization', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(UPSTREAM + url.pathname.replace(/^\/api\/ci/, ''), {
    method: request.method,
    headers,
    body: request.method === 'GET' ? undefined : request.body,
  });
  // Pass the answer through as it arrives, so the phone shows text while it streams.
  return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' } });
};
