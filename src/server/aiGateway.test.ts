import { describe, expect, it } from 'vitest';
import { costOf, dailyLimitOf, handleAi, limitOf, monthStart, type GatewayEnv } from './aiGateway';
import { kindOf } from '../translate/api';

const ENV: GatewayEnv = {
  AI_BASE_URL: 'https://ai.example/v1',
  AI_API_KEY: 'server-secret',
  AI_MODELS: JSON.stringify([{ id: 'cheap', label: 'Cheap', input: 1, output: 2 }]),
  AI_MONTHLY_LIMIT_USD: '0.5',
  SUPABASE_URL: 'https://db.example',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_KEY: 'service',
};

const sse = (...lines: string[]) =>
  new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l)); c.close(); } }), { status: 200 });

interface Row { id: number; user_id: string; model: string; kind: string; input_tokens: number; output_tokens: number; cost_usd: number; estimated: boolean; pending: boolean }

/**
 * A fake Supabase and AI provider. `ai_reserve` behaves like the SQL function: it checks the limits and inserts a
 * pending row in one step (JavaScript runs it without interruption, like the database lock).
 */
function world(opts: { spentBefore?: number; user?: { confirmed?: boolean } | null; upstream?: () => Response } = {}) {
  const rows: Row[] = [];
  let nextId = 1;
  if (opts.spentBefore) rows.push({ id: nextId++, user_id: 'u1', model: 'cheap', kind: 'other', input_tokens: 0, output_tokens: 0, cost_usd: opts.spentBefore, estimated: false, pending: false });
  const upstreamBodies: Record<string, unknown>[] = [];
  const upstreamAuth: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.endsWith('/auth/v1/user')) {
      if (opts.user === null || headers.get('authorization') !== 'Bearer good-token') return new Response('no', { status: 401 });
      return new Response(JSON.stringify({ id: 'u1', email_confirmed_at: opts.user?.confirmed === false ? null : '2026-11-01T00:00:00Z' }));
    }
    if (url.endsWith('/rest/v1/rpc/ai_reserve')) {
      const b = JSON.parse(String(init?.body)) as { p_user: string; p_amount: number; p_month_limit: number; p_day_limit: number; p_model: string; p_kind: string };
      const all = rows.reduce((n, r) => n + r.cost_usd, 0);
      if (all + b.p_amount > b.p_day_limit) return new Response(JSON.stringify({ error: 'day' }));
      const mine = rows.filter((r) => r.user_id === b.p_user).reduce((n, r) => n + r.cost_usd, 0);
      if (mine + b.p_amount > b.p_month_limit) return new Response(JSON.stringify({ error: 'month' }));
      const id = nextId++;
      rows.push({ id, user_id: b.p_user, model: b.p_model, kind: b.p_kind, input_tokens: 0, output_tokens: 0, cost_usd: b.p_amount, estimated: true, pending: true });
      return new Response(JSON.stringify({ id }));
    }
    const byId = /\/rest\/v1\/ai_usage\?id=eq\.(\d+)$/.exec(url);
    if (byId && init?.method === 'PATCH') {
      Object.assign(rows.find((r) => r.id === Number(byId[1]))!, JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    }
    if (byId && init?.method === 'DELETE') {
      rows.splice(rows.findIndex((r) => r.id === Number(byId[1])), 1);
      return new Response(null, { status: 204 });
    }
    if (url.startsWith('https://db.example/rest/v1/ai_usage?select')) return new Response(JSON.stringify(rows.map((r) => ({ cost_usd: r.cost_usd }))));
    if (url === 'https://ai.example/v1/chat/completions') {
      upstreamBodies.push(JSON.parse(String(init?.body)));
      upstreamAuth.push(headers.get('authorization') ?? '');
      return (opts.upstream ?? (() =>
        sse(
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":500}}\n\n',
          'data: [DONE]\n\n',
        )))();
    }
    return new Response('unexpected ' + url, { status: 500 });
  }) as typeof fetch;
  const waits: Promise<unknown>[] = [];
  return { f, rows, upstreamBodies, upstreamAuth, waits, waitUntil: (p: Promise<unknown>) => void waits.push(p) };
}

const chatRequest = (body: Record<string, unknown>, token = 'good-token') =>
  new Request('https://app.example/api/ai/chat', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ok = { model: 'cheap', messages: [{ role: 'user', content: 'Translate: 你好' }], kind: 'translate' };

describe('YoomiRead AI gateway', () => {
  it('streams the answer through, with the server key, and records the cost', async () => {
    const w = world();
    const res = await handleAi(chatRequest(ok), ENV, w.waitUntil, w.f);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"Hel"');
    await Promise.all(w.waits);
    expect(w.upstreamAuth).toEqual(['Bearer server-secret']);
    expect(w.upstreamBodies[0]).toMatchObject({ model: 'cheap', stream: true, max_tokens: 16000 });
    expect(w.rows).toEqual([{ id: 1, user_id: 'u1', model: 'cheap', kind: 'translate', input_tokens: 1000, output_tokens: 500, cost_usd: costOf({ id: 'cheap', label: '', input: 1, output: 2 }, 1000, 500), estimated: false, pending: false }]);
    expect(w.rows[0].cost_usd).toBeCloseTo(0.002);
  });

  it('estimates the cost when the provider sends no token counts', async () => {
    const w = world({ upstream: () => sse('data: {"choices":[{"delta":{"content":"abcdef"}}]}\n\n', 'data: [DONE]\n\n') });
    await (await handleAi(chatRequest(ok), ENV, w.waitUntil, w.f)).text();
    await Promise.all(w.waits);
    expect(w.rows[0]).toMatchObject({ estimated: true, output_tokens: 2 });
    expect(w.rows[0].input_tokens).toBeGreaterThan(0);
  });

  it('refuses someone not signed in, and never calls the provider', async () => {
    const w = world();
    expect((await handleAi(chatRequest(ok, 'bad-token'), ENV, w.waitUntil, w.f)).status).toBe(401);
    expect(w.upstreamBodies).toHaveLength(0);
  });

  it('stops at the monthly limit', async () => {
    const w = world({ spentBefore: 0.5 });
    const res = await handleAi(chatRequest(ok), ENV, w.waitUntil, w.f);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toMatch(/allowance/);
    expect(w.upstreamBodies).toHaveLength(0);
  });

  it('only allows the models on its list, real chats, and requests of a sane size', async () => {
    const w = world();
    expect((await handleAi(chatRequest({ ...ok, model: 'expensive' }), ENV, w.waitUntil, w.f)).status).toBe(400);
    expect((await handleAi(chatRequest({ ...ok, messages: [{ role: 'tool', content: 'x' }] }), ENV, w.waitUntil, w.f)).status).toBe(400);
    expect((await handleAi(chatRequest({ ...ok, messages: [{ role: 'user', content: 'x'.repeat(200_001) }] }), ENV, w.waitUntil, w.f)).status).toBe(413);
    expect(w.upstreamBodies).toHaveLength(0);
  });

  it('hides the provider’s own error text from the reader', async () => {
    const w = world({ upstream: () => new Response('account acct_123 over quota', { status: 500 }) });
    const res = await handleAi(chatRequest(ok), ENV, w.waitUntil, w.f);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('acct_123');
  });

  it('lists its models and limit without sign-in, and says plainly when it is not set up', async () => {
    const w = world();
    const res = await handleAi(new Request('https://app.example/api/ai/models'), ENV, w.waitUntil, w.f);
    expect(await res.json()).toEqual({ models: [{ id: 'cheap', label: 'Cheap', input: 1, output: 2 }], limit: 0.5 });
    expect((await handleAi(new Request('https://app.example/api/ai/models'), { ...ENV, AI_API_KEY: '' }, w.waitUntil, w.f)).status).toBe(503);
  });

  it('tells a reader their own use this month', async () => {
    const w = world({ spentBefore: 0.12 });
    const res = await handleAi(new Request('https://app.example/api/ai/usage', { headers: { authorization: 'Bearer good-token' } }), ENV, w.waitUntil, w.f);
    expect(await res.json()).toEqual({ spent: 0.12, limit: 0.5 });
  });

  it('counts the month in UTC and defaults the limit to $1', () => {
    expect(monthStart(new Date('2026-11-22T15:00:00Z'))).toBe('2026-11-01T00:00:00.000Z');
    expect(limitOf({})).toBe(1);
    expect(limitOf({ AI_MONTHLY_LIMIT_USD: '0' })).toBe(0);
  });
});

describe('YoomiRead AI gateway: trust step', () => {
  it('records a cancelled answer instead of letting it go free', async () => {
    const enc = new TextEncoder();
    let push!: ReadableStreamDefaultController<Uint8Array>;
    const w = world({ upstream: () => new Response(new ReadableStream<Uint8Array>({ start: (c) => void (push = c) })) });
    const res = await handleAi(chatRequest(ok), ENV, w.waitUntil, w.f);
    push.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"' + 'x'.repeat(30) + '"}}]}\n\n'));
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await Promise.all(w.waits);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ pending: false, estimated: true, output_tokens: 10 });
    expect(w.rows[0].input_tokens).toBeGreaterThan(0);
  });

  it('lets only as many requests through at once as the limit allows', async () => {
    // Each call reserves its input plus 8,000 answer tokens at $2 per million: about $0.016. A $0.02 limit fits one.
    const w = world();
    const env = { ...ENV, AI_MONTHLY_LIMIT_USD: '0.02' };
    const results = await Promise.all([1, 2, 3].map(() => handleAi(chatRequest(ok), env, w.waitUntil, w.f)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 402, 402]);
    expect(w.upstreamBodies).toHaveLength(1);
  });

  it('stops everyone at the daily ceiling', async () => {
    const w = world({ spentBefore: 5 });
    const res = await handleAi(chatRequest(ok), { ...ENV, AI_MONTHLY_LIMIT_USD: '100', AI_DAILY_LIMIT_USD: '5' }, w.waitUntil, w.f);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/resting for today/);
    expect(w.upstreamBodies).toHaveLength(0);
    expect(dailyLimitOf({})).toBe(20);
  });

  it('needs a confirmed email before any AI', async () => {
    const w = world({ user: { confirmed: false } });
    const res = await handleAi(chatRequest(ok), ENV, w.waitUntil, w.f);
    expect(res.status).toBe(403);
    expect(w.upstreamBodies).toHaveLength(0);
    expect(w.rows).toHaveLength(0);
  });

  it('gives the reservation back when the AI call fails', async () => {
    const w = world({ upstream: () => new Response('down', { status: 503 }) });
    await handleAi(chatRequest(ok), ENV, w.waitUntil, w.f);
    await Promise.all(w.waits);
    expect(w.rows).toHaveLength(0);
  });
});

describe('kindOf', () => {
  it('names what a request is for, from its instructions', () => {
    expect(kindOf([{ role: 'system', content: 'You translate Chinese web novels into natural, readable English.' }])).toBe('translate');
    expect(kindOf([{ role: 'system', content: "You keep a reader's guide to the people and the world" }])).toBe('world');
    expect(kindOf([{ role: 'system', content: 'You keep character notes for a reader of a novel.' }])).toBe('profiles');
    expect(kindOf([{ role: 'system', content: 'You are a friendly cat in a wizard hat' }])).toBe('chat');
    expect(kindOf([{ role: 'user', content: 'hello' }])).toBe('other');
  });
});
