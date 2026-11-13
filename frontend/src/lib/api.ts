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

async function request<T>(path: string, init: RequestInit = {}, adminToken?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  // Sent only on administrator calls, never on ordinary ones.
  if (adminToken) headers['X-Admin-Token'] = adminToken

  const response = await fetch(`/api${path}`, { ...init, headers })
  const body: unknown = await response.json().catch(() => null) // 204 has no body
  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}

export function apiGet<T>(path: string, signal?: AbortSignal, adminToken?: string): Promise<T> {
  return request<T>(path, { signal }, adminToken)
}

export function apiPost<T>(path: string, data: unknown, adminToken?: string): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(data) }, adminToken)
}

export function apiPatch<T>(path: string, data: unknown, adminToken?: string): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }, adminToken)
}

export function apiDelete(path: string, adminToken?: string): Promise<void> {
  return request<void>(path, { method: 'DELETE' }, adminToken)
}
