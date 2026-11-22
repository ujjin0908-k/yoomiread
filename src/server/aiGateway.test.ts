import { describe, expect, it } from 'vitest';
import { costOf, handleAi, limitOf, monthStart, type GatewayEnv, type UsageRow } from './aiGateway';
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

/** A fake Supabase and AI provider; records what the gateway sent. */
function world(opts: { spent?: number; user?: string | null; upstream?: () => Response } = {}) {
  const rows: UsageRow[] = [];
  const upstreamBodies: Record<string, unknown>[] = [];
  const upstreamAuth: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.endsWith('/auth/v1/user')) {
      return opts.user === null || headers.get('authorization') !== 'Bearer good-token'
        ? new Response('no', { status: 401 })
        : new Response(JSON.stringify({ id: opts.user ?? 'u1' }));
    }
    if (url.startsWith('https://db.example/rest/v1/ai_usage?select')) return new Response(JSON.stringify(opts.spent ? [{ cost_usd: opts.spent }] : []));
    if (url === 'https://db.example/rest/v1/ai_usage' && init?.method === 'POST') {
      rows.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
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
    expect(w.rows).toEqual([{ user_id: 'u1', model: 'cheap', kind: 'translate', input_tokens: 1000, output_tokens: 500, cost_usd: costOf({ id: 'cheap', label: '', input: 1, output: 2 }, 1000, 500), estimated: false }]);
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
    const w = world({ spent: 0.5 });
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
    const w = world({ spent: 0.12 });
    const res = await handleAi(new Request('https://app.example/api/ai/usage', { headers: { authorization: 'Bearer good-token' } }), ENV, w.waitUntil, w.f);
    expect(await res.json()).toEqual({ spent: 0.12, limit: 0.5 });
  });

  it('counts the month in UTC and defaults the limit to $1', () => {
    expect(monthStart(new Date('2026-11-22T15:00:00Z'))).toBe('2026-11-01T00:00:00.000Z');
    expect(limitOf({})).toBe(1);
    expect(limitOf({ AI_MONTHLY_LIMIT_USD: '0' })).toBe(0);
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
