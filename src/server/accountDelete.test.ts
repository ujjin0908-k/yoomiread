import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { handleAccountDelete } from './accountDelete';
import { YoomiDB } from '../db';
import { eraseThisPhone } from '../erase';

const ENV = { SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_KEY: 'service' };

function server(adminOk = true) {
  const calls: { url: string; method?: string; auth?: string }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('authorization') ?? '';
    calls.push({ url, method: init?.method, auth });
    if (url.endsWith('/auth/v1/user')) return auth === 'Bearer good' ? new Response(JSON.stringify({ id: 'u1', email_confirmed_at: 'x' })) : new Response('', { status: 401 });
    if (url.includes('/auth/v1/admin/users/')) return new Response(adminOk ? '{}' : 'no', { status: adminOk ? 200 : 500 });
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;
  return { f, calls };
}
const req = (token: string, body: unknown) =>
  new Request('https://app.example/api/account/delete', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

describe('Delete my account (server)', () => {
  it('deletes the signed-in reader with the service key, and nobody else', async () => {
    const s = server();
    const res = await handleAccountDelete(req('good', { confirm: 'DELETE' }), ENV, s.f);
    expect(res.status).toBe(200);
    const admin = s.calls.find((c) => c.url.includes('/admin/users/'))!;
    expect(admin).toMatchObject({ url: 'https://db.example/auth/v1/admin/users/u1', method: 'DELETE', auth: 'Bearer service' });
  });

  it('refuses without a sign-in, and without the typed word', async () => {
    const s = server();
    expect((await handleAccountDelete(req('bad', { confirm: 'DELETE' }), ENV, s.f)).status).toBe(401);
    expect((await handleAccountDelete(req('good', {}), ENV, s.f)).status).toBe(400);
    expect((await handleAccountDelete(req('good', { confirm: 'delete' }), ENV, s.f)).status).toBe(400);
    expect(s.calls.some((c) => c.url.includes('/admin/users/'))).toBe(false);
  });

  it('says plainly when the server could not delete it', async () => {
    const res = await handleAccountDelete(req('good', { confirm: 'DELETE' }), ENV, server(false).f);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/Nothing was removed/);
  });
});

describe('Also erase everything on this phone', () => {
  it('empties every table, settings and keys included', async () => {
    const db = new YoomiDB(`erase-${Math.random()}`);
    await db.books.add({ id: 'b', title: 'B', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 });
    await db.settings.put({ key: 'translate', value: { apiKey: 'secret' } });
    await eraseThisPhone(db);
    expect(await db.books.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
    await db.delete();
  });
});
