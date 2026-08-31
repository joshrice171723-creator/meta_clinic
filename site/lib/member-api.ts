export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function memberRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(`/api/backend/${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', headers });
  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new ApiError(typeof payload.error === 'string' ? payload.error : 'We couldn’t complete that request. Please try again.', response.status);
  return payload as T;
}

export async function memberMutation<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { csrf_token } = await memberRequest<{ csrf_token: string }>('csrf');
  return memberRequest<T>(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf_token }, body: body === undefined ? undefined : JSON.stringify(body) });
}
