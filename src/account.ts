import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

/**
 * The reader's account, for YoomiRead AI (src/server/aiGateway.ts): sign in with an email link, Google or Apple.
 * Uses Supabase. The project address and public key come from the build (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
 * without them there are no accounts and only "your own AI service" is offered.
 * The sign-in library loads only when accounts are used, so the app stays small for everyone else.
 */
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when this build can sign readers in. */
export const accountsAvailable = !!(URL_ && KEY_);

let client: Promise<SupabaseClient> | undefined;
let session: Session | null = null;
const listeners = new Set<() => void>();

function supabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const c = createClient(URL_!, KEY_!, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
    c.auth.onAuthStateChange((_event, s) => {
      session = s;
      listeners.forEach((l) => l());
    });
    return c;
  });
  return client;
}

/**
 * Called once at start: picks up a saved sign-in, and finishes one coming back from Google, Apple or the email link
 * (the address then carries ?code=…, which is removed afterwards so the app's own # address is kept).
 */
export async function startAccount(): Promise<void> {
  if (!accountsAvailable) return;
  const back = new URLSearchParams(location.search).has('code');
  if (!back && !hasSavedSession()) return;
  const c = await supabase();
  session = (await c.auth.getSession()).data.session;
  if (back) history.replaceState(null, '', location.pathname + location.hash);
  listeners.forEach((l) => l());
}

/** Supabase keeps the session in localStorage under sb-<project>-auth-token. */
function hasSavedSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch {
    return false;
  }
}

/** True while someone is signed in on this phone (as far as this page knows right now). */
export function signedIn(): boolean {
  return !!session;
}

/** The sign-in token for a request to YoomiRead AI, refreshed when needed. */
export async function accountToken(): Promise<string | undefined> {
  if (!accountsAvailable) return undefined;
  const c = await supabase();
  const s = (await c.auth.getSession()).data.session;
  session = s;
  return s?.access_token;
}

const back = () => `${location.origin}${location.pathname}${location.hash || '#settings'}`;

/** Sends a sign-in link to this email address. */
export async function signInWithEmail(email: string): Promise<void> {
  const c = await supabase();
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: back() } });
  if (error) throw new Error(error.message);
}

/** Goes to Google or Apple and comes back signed in. */
export async function signInWith(provider: 'google' | 'apple'): Promise<void> {
  const c = await supabase();
  const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: back() } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const c = await supabase();
  await c.auth.signOut();
  session = null;
  listeners.forEach((l) => l());
}

/** The signed-in reader's email (or undefined), kept up to date. */
export function useAccount(): { email?: string; signedIn: boolean } {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { email: session?.user.email ?? undefined, signedIn: !!session };
}
