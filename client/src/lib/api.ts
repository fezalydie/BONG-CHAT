/** Error thrown by `api`/`apiForm`, carrying the HTTP status (0 = network failure). */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const NETWORK_ERROR = 'Network error — check your connection and try again.'
const UNEXPECTED_RESPONSE = 'The server sent an unexpected response. Please try again.'

/**
 * A 401 outside the auth bootstrap means the session has expired. Tell the app
 * so it can return to the login screen instead of sitting on a page that keeps
 * failing. `/auth/me` is excluded because "not signed in" is a normal answer
 * there (the provider handles it itself).
 */
function notifySessionExpired(path: string): void {
  if (path === '/auth/me' || path.startsWith('/auth/login') || path.startsWith('/auth/register')) return
  window.dispatchEvent(new CustomEvent('bongchat:unauthorized'))
}

async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError(NETWORK_ERROR, 0)
  }

  if (!res.ok) {
    let message = res.status >= 500 ? 'The server had a problem. Please try again.' : fallback
    try {
      // Errors are normally JSON; a proxy or gateway may return HTML instead.
      const body = await res.json()
      message = body?.error ?? body?.message ?? message
    } catch {
      // keep the friendly default
    }
    if (res.status === 401) notifySessionExpired(path)
    throw new ApiError(message, res.status)
  }

  // 204 and empty bodies are valid responses for a few endpoints.
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError(UNEXPECTED_RESPONSE, res.status)
  }
}

export function api<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(
    path,
    {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(init?.headers || {}),
      },
    },
    'Request failed',
  )
}

export function apiForm<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: formData, credentials: 'include' }, 'Upload failed')
}
