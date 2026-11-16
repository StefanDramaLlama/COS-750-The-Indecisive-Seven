export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function json<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(path, { signal, ...(body !== undefined ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  } : {}) });
  const data = await response.json().catch(() => undefined);
  if (!response.ok || data === undefined) throw new ApiError(data?.error?.message ?? 'The studio could not load this request.', response.status);
  return data as T;
}
