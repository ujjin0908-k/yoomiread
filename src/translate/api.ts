import { accountToken } from '../account';
import type { TranslateSettings } from '../types';
import type { ChatMessage } from './prompt';

export interface ChatResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  /** True when the provider stopped because it ran out of output space, so the text is cut short. */
  truncated?: boolean;
}

/** Output cap used when thinking is off: a translation is about 2,000 tokens, so this only stops runaway replies. */
const THINKING_OFF_MAX_TOKENS = 8000;

export class TranslateError extends Error {
  constructor(
    message: string,
    /** Worth trying again (network hiccup, overloaded provider). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Reads a server-sent-events body ("data: {...}" lines) from an OpenAI-compatible
 * chat endpoint, calling onText with each new piece of text.
 */
export async function readStream(body: ReadableStream<Uint8Array>, onText: (piece: string) => void): Promise<ChatResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let truncated = false;
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop()!;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          error?: { message?: string };
        };
        if (chunk.error) throw new TranslateError(chunk.error.message ?? 'The provider sent an error.', true);
        const piece = chunk.choices?.[0]?.delta?.content;
        if (piece) {
          text += piece;
          onText(piece);
        }
        if (chunk.choices?.[0]?.finish_reason === 'length') truncated = true;
        if (chunk.usage) usage = chunk.usage;
      } catch (e) {
        if (e instanceof TranslateError) throw e;
        // A partial or odd line: skip it.
      }
    }
    if (done) break;
  }
  return { text, inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens, truncated };
}

function endpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

/**
 * What a request is for, read from its instructions, so YoomiRead AI can show the owner which features cost what.
 * Only used for those totals; nothing depends on it.
 */
export function kindOf(messages: ChatMessage[]): string {
  const first = messages[0]?.content ?? '';
  if (/^You translate (Chinese web novels|the chapter titles)/.test(first)) return 'translate';
  if (/^You translate Chinese book titles/.test(first)) return 'title';
  if (/^You (prepare a glossary|list the characters)/.test(first)) return 'glossary';
  if (/^You keep a reader's guide/.test(first)) return 'world';
  if (/^You check one line/.test(first)) return 'fix';
  if (/^You keep character notes/.test(first)) return 'profiles';
  if (/\bcat\b/i.test(first.slice(0, 300))) return 'chat';
  return 'other';
}

/** YoomiRead AI: the request goes to our own server with the reader's sign-in, never with a provider key. */
async function hostedOnce(model: string, messages: ChatMessage[], settings: TranslateSettings, onText: (piece: string) => void, signal?: AbortSignal): Promise<ChatResult> {
  const token = await accountToken();
  if (!token) throw new TranslateError('Sign in to YoomiRead AI in Settings first.', false);
  let res: Response;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, messages, temperature: 0.3, kind: kindOf(messages), ...(settings.thinkingOff ? { reasoning_effort: 'none' } : {}) }),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new TranslateError('Could not reach YoomiRead AI. Check the internet and try again.', true);
  }
  if (!res.ok) {
    const said = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    if (res.status === 401) throw new TranslateError('Please sign in again (Settings → AI).', false);
    if (res.status === 402 || res.status === 400 || res.status === 413 || res.status === 503) throw new TranslateError(said ?? `YoomiRead AI said no (${res.status}).`, false);
    throw new TranslateError(said ?? `YoomiRead AI had a problem (${res.status}).`, res.status === 429 || res.status >= 500);
  }
  if (!res.body) throw new TranslateError('YoomiRead AI sent an empty answer.', true);
  return readStream(res.body, onText);
}

async function once(
  settings: TranslateSettings,
  model: string,
  messages: ChatMessage[],
  onText: (piece: string) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  if (settings.mode === 'hosted') return hostedOnce(model, messages, settings, onText, signal);
  let res: Response;
  try {
    res = await fetch(endpoint(settings.baseUrl), {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey.trim()}` },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.3,
        stream_options: { include_usage: true },
        ...(settings.thinkingOff ? { reasoning_effort: 'none', max_tokens: THINKING_OFF_MAX_TOKENS } : {}),
      }),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new TranslateError(
      'Could not reach the provider. Check the internet, the address in Settings, and that the provider allows requests from a web app.',
      true,
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const short = detail.slice(0, 200);
    if (res.status === 401 || res.status === 403) throw new TranslateError(`The provider refused the API key (${res.status}). ${short}`, false);
    if (res.status === 404) throw new TranslateError(`Model or address not found (404). Check the model id and address. ${short}`, false);
    if (res.status === 400) throw new TranslateError(`The provider rejected the request (400). ${short}`, false);
    throw new TranslateError(`The provider had a problem (${res.status}). ${short}`, res.status === 429 || res.status >= 500);
  }
  if (!res.body) throw new TranslateError('The provider sent an empty answer.', true);
  return readStream(res.body, onText);
}

/**
 * Sends one chat request and streams the answer. Retries up to twice on a hiccup,
 * but only if nothing has arrived yet, so text is never doubled.
 */
export async function chat(
  settings: TranslateSettings,
  model: string,
  messages: ChatMessage[],
  onText: (piece: string) => void = () => {},
  signal?: AbortSignal,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ChatResult> {
  if (settings.mode !== 'hosted' && (!settings.baseUrl.trim() || !settings.apiKey.trim())) {
    throw new TranslateError('Set up AI in Settings first.', false);
  }
  let received = false;
  const track = (piece: string) => {
    received = true;
    onText(piece);
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await once(settings, model, messages, track, signal);
      if (!result.text.trim()) throw new TranslateError('The provider answered with no text.', true);
      return result;
    } catch (e) {
      const retry = e instanceof TranslateError && e.retryable && !received && attempt < 2 && !signal?.aborted;
      if (!retry) throw e;
      await wait(1500 * (attempt + 1));
    }
  }
}
