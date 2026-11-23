/**
 * YoomiRead AI: the server side of AI that works without the reader's own key (runs as a Cloudflare Pages Function,
 * see functions/api/ai/[[path]].ts). It never ships in the app bundle.
 *
 * - Who: every request carries the reader's sign-in token; Supabase confirms who it is.
 * - What: only models on the server's list, with a cap on request and answer size.
 * - How much: before each call the most it can likely cost is reserved in one locked database step (`ai_reserve`), so
 *   calls at the same moment cannot pass the limits; afterwards the reservation becomes the real cost, also when the
 *   reader stops the answer. Limits: per reader per month (AI_MONTHLY_LIMIT_USD) and for everyone per day
 *   (AI_DAILY_LIMIT_USD, the kill switch). They are safety caps, not prices. Email accounts must be confirmed.
 * The provider key stays on the server (AI_API_KEY) and is never sent to the phone.
 */

export interface GatewayEnv {
  /** OpenAI-compatible base address of the AI provider, ending in /v1. */
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  /** JSON list: [{"id": "...", "label": "...", "input": 0.07, "output": 0.33}], prices in US$ per million tokens. */
  AI_MODELS?: string;
  /** US$ per reader per calendar month (UTC). Default 1. */
  AI_MONTHLY_LIMIT_USD?: string;
  /** US$ for all readers together per day (UTC): the kill switch. Default 20. */
  AI_DAILY_LIMIT_USD?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  /** Server only: writes usage rows. */
  SUPABASE_SERVICE_KEY?: string;
}

export interface GatewayModel {
  id: string;
  label: string;
  input: number;
  output: number;
}

/** Largest request accepted, in characters of message text (a long chapter plus glossary is about 40,000). */
export const MAX_REQUEST_CHARS = 200_000;
/** Largest answer asked of the model, in tokens. */
export const MAX_ANSWER_TOKENS = 16_000;
const KINDS = ['translate', 'glossary', 'profiles', 'world', 'title', 'chat', 'fix', 'other'] as const;

type Fetch = typeof fetch;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, error: string) => json({ error }, status);

export function modelsOf(env: GatewayEnv): GatewayModel[] {
  try {
    const list = JSON.parse(env.AI_MODELS ?? '[]') as Partial<GatewayModel>[];
    return list
      .filter((m) => typeof m.id === 'string' && m.id && typeof m.input === 'number' && typeof m.output === 'number')
      .map((m) => ({ id: m.id!, label: typeof m.label === 'string' && m.label ? m.label : m.id!, input: m.input!, output: m.output! }));
  } catch {
    return [];
  }
}

export const limitOf = (env: GatewayEnv) => {
  const n = Number(env.AI_MONTHLY_LIMIT_USD);
  return Number.isFinite(n) && n >= 0 && env.AI_MONTHLY_LIMIT_USD !== undefined && env.AI_MONTHLY_LIMIT_USD !== '' ? n : 1;
};

export const dailyLimitOf = (env: GatewayEnv) => {
  const n = Number(env.AI_DAILY_LIMIT_USD);
  return env.AI_DAILY_LIMIT_USD !== undefined && env.AI_DAILY_LIMIT_USD !== '' && Number.isFinite(n) && n >= 0 ? n : 20;
};

/** What a call is reserved at before it runs: its input, plus room for a long answer (8,000 tokens). */
export const RESERVE_ANSWER_TOKENS = 8_000;

/** The first moment of this calendar month, UTC, as an ISO string. */
export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

export const costOf = (m: GatewayModel, input: number, output: number) => (input * m.input + output * m.output) / 1_000_000;

/** Who is asking: the Supabase user for the sign-in token, or undefined. */
async function whoIs(request: Request, env: GatewayEnv, f: Fetch): Promise<{ id: string; confirmed: boolean } | undefined> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return undefined;
  const res = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!res.ok) return undefined;
  const user = (await res.json().catch(() => undefined)) as { id?: string; email_confirmed_at?: string | null; confirmed_at?: string | null } | undefined;
  // Google and Apple accounts come confirmed; an email account counts once its link was opened.
  return user?.id ? { id: user.id, confirmed: !!(user.email_confirmed_at || user.confirmed_at) } : undefined;
}

/** US$ this reader has used this month. */
export async function spentThisMonth(userId: string, env: GatewayEnv, f: Fetch, now = new Date()): Promise<number> {
  const url = `${env.SUPABASE_URL}/rest/v1/ai_usage?select=cost_usd&user_id=eq.${encodeURIComponent(userId)}&at=gte.${encodeURIComponent(monthStart(now))}`;
  const res = await f(url, { headers: { apikey: env.SUPABASE_SERVICE_KEY!, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
  if (!res.ok) throw new Error(`usage read failed (${res.status})`);
  const rows = (await res.json()) as { cost_usd: number }[];
  return rows.reduce((n, r) => n + (Number(r.cost_usd) || 0), 0);
}

export interface UsageRow {
  user_id: string;
  model: string;
  kind: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  estimated: boolean;
}

const serviceHeaders = (env: GatewayEnv) => ({
  apikey: env.SUPABASE_SERVICE_KEY!,
  authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  'content-type': 'application/json',
});

/**
 * Reserves the most a call can likely cost, in one locked step on the database (`ai_reserve` in
 * supabase/ai_usage.sql), so calls sent at the same moment cannot all pass the limits.
 */
export async function reserve(
  userId: string,
  amount: number,
  model: string,
  kind: string,
  env: GatewayEnv,
  f: Fetch,
): Promise<{ id: number } | { error: 'month' | 'day' }> {
  const res = await f(`${env.SUPABASE_URL}/rest/v1/rpc/ai_reserve`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify({ p_user: userId, p_amount: amount, p_month_limit: limitOf(env), p_day_limit: dailyLimitOf(env), p_model: model, p_kind: kind }),
  });
  if (!res.ok) throw new Error(`reserve failed (${res.status})`);
  return (await res.json()) as { id: number } | { error: 'month' | 'day' };
}

/** Replaces a reservation with what the call really used. */
async function settle(id: number, row: Omit<UsageRow, 'user_id' | 'model' | 'kind'>, env: GatewayEnv, f: Fetch): Promise<void> {
  await f(`${env.SUPABASE_URL}/rest/v1/ai_usage?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(env), prefer: 'return=minimal' },
    body: JSON.stringify({ ...row, pending: false }),
  });
}

/** Drops a reservation for a call that never reached the AI. */
async function release(id: number, env: GatewayEnv, f: Fetch): Promise<void> {
  await f(`${env.SUPABASE_URL}/rest/v1/ai_usage?id=eq.${id}`, { method: 'DELETE', headers: serviceHeaders(env) });
}

/**
 * Passes the provider's streamed answer through to the phone unchanged, and reads the token counts on the way.
 * `done` resolves once the stream ends, with the counts (or undefined when the provider sent none).
 */
export interface Seen {
  /** Token counts from the provider, when it sent them. */
  usage?: { input: number; output: number };
  /** Characters of answer text that passed through. */
  chars: number;
  /** True when the reader stopped the answer (or the connection broke) before the end. */
  cut: boolean;
}

export function watchUsage(body: ReadableStream<Uint8Array>): { stream: ReadableStream<Uint8Array>; done: Promise<Seen> } {
  const decoder = new TextDecoder();
  const upstream = body.getReader();
  let buffer = '';
  const seen: Seen = { chars: 0, cut: false };
  let finish!: (v: Seen) => void;
  let finished = false;
  const done = new Promise<Seen>((r) => (finish = r));
  const end = (cut: boolean) => {
    if (finished) return;
    finished = true;
    if (buffer) read(buffer);
    finish({ ...seen, cut });
  };
  const read = (line: string) => {
    const data = line.trim().replace(/^data:\s*/, '');
    if (!data.startsWith('{')) return;
    try {
      const chunk = JSON.parse(data) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; choices?: { delta?: { content?: string } }[] };
      seen.chars += chunk.choices?.[0]?.delta?.content?.length ?? 0;
      if (chunk.usage && (chunk.usage.prompt_tokens || chunk.usage.completion_tokens)) {
        seen.usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 };
      }
    } catch {
      // Not a whole JSON line: ignore.
    }
  };
  // Pulled piece by piece, so a reader who stops the answer (cancel) still ends the count, and the provider is told.
  const stream = new ReadableStream<Uint8Array>({
    async pull(out) {
      let piece: ReadableStreamReadResult<Uint8Array>;
      try {
        piece = await upstream.read();
      } catch (e) {
        end(true);
        throw e;
      }
      if (piece.done) {
        end(false);
        out.close();
        return;
      }
      out.enqueue(piece.value);
      buffer += decoder.decode(piece.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      lines.forEach(read);
    },
    async cancel(reason) {
      end(true);
      await upstream.cancel(reason).catch(() => undefined);
    },
  });
  return { stream, done };
}


/**
 * Handles /api/ai/models, /api/ai/usage and /api/ai/chat. `waitUntil` keeps the usage write alive after the answer
 * has been sent (Cloudflare's context.waitUntil).
 */
export async function handleAi(
  request: Request,
  env: GatewayEnv,
  waitUntil: (p: Promise<unknown>) => void,
  f: Fetch = fetch,
  now = new Date(),
): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/ai\/?/, '');
  const models = modelsOf(env);
  if (!env.AI_BASE_URL || !env.AI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_KEY || !models.length) {
    return fail(503, 'YoomiRead AI is not set up on this server.');
  }
  if (path === 'models' && request.method === 'GET') return json({ models, limit: limitOf(env) });

  const user = await whoIs(request, env, f);
  if (!user) return fail(401, 'Please sign in again.');

  if (path === 'usage' && request.method === 'GET') {
    return json({ spent: await spentThisMonth(user.id, env, f, now), limit: limitOf(env) });
  }
  if (path !== 'chat' || request.method !== 'POST') return fail(404, 'Not found.');

  const body = (await request.json().catch(() => undefined)) as
    | { model?: string; messages?: { role?: string; content?: unknown }[]; temperature?: number; kind?: string; reasoning_effort?: string }
    | undefined;
  const model = models.find((m) => m.id === body?.model);
  if (!body || !model) return fail(400, 'That model is not offered.');
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const valid = messages.length > 0 && messages.every((m) => ['system', 'user', 'assistant'].includes(String(m.role)) && typeof m.content === 'string');
  if (!valid) return fail(400, 'The request is not a chat.');
  const size = messages.reduce((n, m) => n + (m.content as string).length, 0);
  if (size > MAX_REQUEST_CHARS) return fail(413, 'That request is too long.');

  if (!user.confirmed) return fail(403, 'Confirm your email first: open the link we sent you, then try again.');

  // Reserve the most this call can likely cost before calling, so calls at the same moment cannot pass the limits.
  const kind = KINDS.includes(body.kind as (typeof KINDS)[number]) ? (body.kind as string) : 'other';
  const inputEstimate = Math.ceil(size / 3);
  const held = await reserve(user.id, costOf(model, inputEstimate, RESERVE_ANSWER_TOKENS), model.id, kind, env, f);
  if ('error' in held) {
    return held.error === 'day'
      ? fail(503, 'YoomiRead AI is resting for today. Try again tomorrow.')
      : fail(402, "You have used this month's AI allowance. It starts again on the 1st.");
  }

  const upstream = await f(`${env.AI_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify({
      model: model.id,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.3,
      max_tokens: MAX_ANSWER_TOKENS,
      ...(body.reasoning_effort === 'none' ? { reasoning_effort: 'none' } : {}),
    }),
  });
  if (!upstream.ok || !upstream.body) {
    waitUntil(release(held.id, env, f));
    // The provider's own message may name our account or key: the reader gets a plain one.
    const status = upstream.status === 429 ? 429 : 502;
    return fail(status, status === 429 ? 'The AI is busy. Try again in a minute.' : 'The AI service had a problem. Try again.');
  }
  const { stream, done } = watchUsage(upstream.body);
  waitUntil(
    done.then((seen) => {
      // The provider's counts when it sent them; otherwise an estimate (a stopped answer is still billed by the provider).
      const estimated = !seen.usage;
      const input = seen.usage?.input ?? inputEstimate;
      const output = seen.usage?.output ?? Math.ceil(seen.chars / 3);
      return settle(held.id, { input_tokens: input, output_tokens: output, cost_usd: costOf(model, input, output), estimated }, env, f);
    }),
  );
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}
