// Single access layer for the API. Every HTTP call goes through here.

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`API error ${status}`)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`/api${path}`, { ...init, headers })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal })
}

export function apiPatch<T>(path: string, data: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(data) })
}
