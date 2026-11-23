import { whoIs, type GatewayEnv } from './aiGateway';

/**
 * "Delete my account" (POST /api/account/delete). The sign-in account can only be removed with the server's service
 * key, so the app asks here. The database then removes everything tied to the account by itself (`on delete
 * cascade`): the synced library (`sync_rows`) and the AI cost records (`ai_usage`). The phone's own copy of the
 * library is the reader's choice, made in the app.
 */
export async function handleAccountDelete(request: Request, env: GatewayEnv, f: typeof fetch = fetch): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (new URL(request.url).pathname !== '/api/account/delete' || request.method !== 'POST') return json({ error: 'Not found.' }, 404);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_KEY) return json({ error: 'Accounts are not set up on this server.' }, 503);
  const user = await whoIs(request, env, f);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  // The word typed by the reader, so no stray request can delete an account.
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);
  const res = await f(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) return json({ error: 'The account could not be deleted. Nothing was removed; try again later.' }, 502);
  return json({ deleted: true });
}
