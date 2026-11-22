/**
 * YoomiRead AI: the server side of AI that works without the reader's own key (runs as a Cloudflare Pages Function,
 * see functions/api/ai/[[path]].ts). It never ships in the app bundle.
 *
 * - Who: every request carries the reader's sign-in token; Supabase confirms who it is.
 * - What: only models on the server's list, with a cap on request and answer size.
 * - How much: every call is recorded with its tokens and cost (table `ai_usage`), so the owner can see real expenses
 *   before deciding prices. A monthly safety limit per reader (AI_MONTHLY_LIMIT_USD) stops runaway use; it is not a price.
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

/** The first moment of this calendar month, UTC, as an ISO string. */
export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

export const costOf = (m: GatewayModel, input: number, output: number) => (input * m.input + output * m.output) / 1_000_000;

/** Who is asking: the Supabase user for the sign-in token, or undefined. */
async function whoIs(request: Request, env: GatewayEnv, f: Fetch): Promise<{ id: string } | undefined> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return undefined;
  const res = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!res.ok) return undefined;
  const user = (await res.json().catch(() => undefined)) as { id?: string } | undefined;
  return user?.id ? { id: user.id } : undefined;
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

async function record(row: UsageRow, env: GatewayEnv, f: Fetch): Promise<void> {
  await f(`${env.SUPABASE_URL}/rest/v1/ai_usage`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY!,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

/**
 * Passes the provider's streamed answer through to the phone unchanged, and reads the token counts on the way.
 * `done` resolves once the stream ends, with the counts (or undefined when the provider sent none).
 */
export function watchUsage(body: ReadableStream<Uint8Array>): { stream: ReadableStream<Uint8Array>; done: Promise<{ input: number; output: number; chars: number } | undefined> } {
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: { input: number; output: number } | undefined;
  let chars = 0;
  let finish!: (v: { input: number; output: number; chars: number } | undefined) => void;
  const done = new Promise<{ input: number; output: number; chars: number } | undefined>((r) => (finish = r));
  const read = (line: string) => {
    const data = line.trim().replace(/^data:\s*/, '');
    if (!data.startsWith('{')) return;
    try {
      const chunk = JSON.parse(data) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; choices?: { delta?: { content?: string } }[] };
      chars += chunk.choices?.[0]?.delta?.content?.length ?? 0;
      if (chunk.usage && (chunk.usage.prompt_tokens || chunk.usage.completion_tokens)) {
        usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 };
      }
    } catch {
      // Not a whole JSON line: ignore.
    }
  };
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(piece, out) {
        out.enqueue(piece);
        buffer += decoder.decode(piece, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        lines.forEach(read);
      },
      flush() {
        if (buffer) read(buffer);
        finish(usage ? { ...usage, chars } : chars ? { input: -1, output: -1, chars } : undefined);
      },
    }),
  );
  return { stream, done };
}

/** About one token per 4 characters of English, 1 per Chinese character: used only when the provider sends no counts. */
const roughTokens = (text: string) => Math.ceil(text.length / 3);

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

  const limit = limitOf(env);
  const spent = await spentThisMonth(user.id, env, f, now);
  if (spent >= limit) return fail(402, "You have used this month's AI allowance. It starts again on the 1st.");

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
    // The provider's own message may name our account or key: the reader gets a plain one.
    const status = upstream.status === 429 ? 429 : 502;
    return fail(status, status === 429 ? 'The AI is busy. Try again in a minute.' : 'The AI service had a problem. Try again.');
  }
  const kind = KINDS.includes(body.kind as (typeof KINDS)[number]) ? (body.kind as string) : 'other';
  const { stream, done } = watchUsage(upstream.body);
  waitUntil(
    done.then((u) => {
      const estimated = !u || u.input < 0;
      const input = estimated ? Math.ceil(size / 3) : u!.input;
      const output = estimated ? (u ? roughTokens('x'.repeat(u.chars)) : 0) : u!.output;
      return record({ user_id: user.id, model: model.id, kind, input_tokens: input, output_tokens: output, cost_usd: costOf(model, input, output), estimated }, env, f);
    }),
  );
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}
