// Cloudflare Pages Function: the page reader for the link import (only the sites on its list).
// A public deployment (VITE_EDITION=public in the project's settings) does not read other sites at all.
import fetchPage from '../../netlify/edge-functions/fetch-page';

export const onRequest = ({ request, env }: { request: Request; env?: Record<string, string | undefined> }) =>
  env?.VITE_EDITION === 'public'
    ? new Response(JSON.stringify({ error: 'Reading web pages is not part of this app.' }), { status: 404, headers: { 'content-type': 'application/json' } })
    : fetchPage(request);
