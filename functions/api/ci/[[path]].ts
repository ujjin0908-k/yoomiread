// Cloudflare Pages Function: the same translation pass-through as the Netlify edge function.
// Route: /api/ci/v1/chat/completions, /api/ci/v1/messages and /api/ci/v1/models only.
import ciProxy from '../../../netlify/edge-functions/ci-proxy';

export const onRequest = ({ request }: { request: Request }) => ciProxy(request);
