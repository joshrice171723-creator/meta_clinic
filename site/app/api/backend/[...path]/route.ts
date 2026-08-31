import { allowedEndpoint, backendConfig, railsRequest, sessionCookie } from '@/lib/backend';

export const dynamic = 'force-dynamic';
const jsonError = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const path = parts.join('/');
  if (!allowedEndpoint(path, request.method)) return jsonError('Not found.', 404);
  let frontend: string;
  try { frontend = backendConfig().frontend; }
  catch { return jsonError('This service is not connected yet. Please check back soon.', 503); }

  const headers = new Headers({ Cookie: sessionCookie(request.headers.get('cookie') || '') });
  let body: string | undefined;
  if (request.method !== 'GET') {
    if (request.headers.get('origin') !== frontend) return jsonError('This request could not be verified.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return jsonError('JSON is required.', 415);
    // Bound both the declared and streamed payload, including multibyte input.
    if (Number(request.headers.get('content-length')) > 20000) return jsonError('Message is too large.', 413);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 20000) { await reader.cancel(); return jsonError('Message is too large.', 413); }
        chunks.push(value);
      }
    }
    const combined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    body = new TextDecoder().decode(combined);
    if (body) { try { JSON.parse(body); } catch { return jsonError('Invalid request.', 400); } }
    headers.set('Content-Type', 'application/json');
    headers.set('X-CSRF-Token', request.headers.get('x-csrf-token') || '');
  }

  const query = new URL(request.url).searchParams;
  const before = path === 'inquiries' ? query.get('before') : null;
  if (before && !/^[1-9]\d*$/.test(before)) return jsonError('Invalid page.', 400);
  try {
    const upstream = await railsRequest(path + (before ? `?before=${before}` : ''), { method: request.method, headers, body });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    for (const cookie of upstream.headers.getSetCookie()) {
      if (cookie.startsWith('_apply_session=')) responseHeaders.append('Set-Cookie', cookie);
    }
    if (upstream.status === 204) return new Response(null, { status: 204, headers: responseHeaders });
    if (!upstream.headers.get('content-type')?.includes('application/json')) return jsonError('We couldn’t complete that request. Please try again.', 502);
    responseHeaders.set('Content-Type', 'application/json');
    return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return jsonError('This service is temporarily unavailable. Your request has not been confirmed; please try again later.', 503);
  }
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
