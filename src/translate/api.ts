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

async function once(
  settings: TranslateSettings,
  model: string,
  messages: ChatMessage[],
  onText: (piece: string) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
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
  if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
    throw new TranslateError('Add the provider address and API key in Settings first.', false);
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
