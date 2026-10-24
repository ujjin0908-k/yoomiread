// Cloudflare Pages Function: the page reader for the link import (only the sites on its list).
import fetchPage from '../../netlify/edge-functions/fetch-page';

export const onRequest = ({ request }: { request: Request }) => fetchPage(request);
