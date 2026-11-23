// Cloudflare Pages Function: "Delete my account" (src/server/accountDelete.ts). Uses SUPABASE_SERVICE_KEY (a secret).
import { handleAccountDelete } from '../../../src/server/accountDelete';
import type { GatewayEnv } from '../../../src/server/aiGateway';

export const onRequest = ({ request, env }: { request: Request; env: GatewayEnv }) => handleAccountDelete(request, env);
