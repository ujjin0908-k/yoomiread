// Cloudflare Pages Function: YoomiRead AI (src/server/aiGateway.ts). Settings live in the Cloudflare project's
// environment variables; AI_API_KEY and SUPABASE_SERVICE_KEY must be secrets.
import { handleAi, type GatewayEnv } from '../../../src/server/aiGateway';

export const onRequest = ({ request, env, waitUntil }: { request: Request; env: GatewayEnv; waitUntil: (p: Promise<unknown>) => void }) =>
  handleAi(request, env, waitUntil);
