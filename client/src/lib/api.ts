export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })

  if (!res.ok) {
    let message = 'Request failed'
    try {
      const json = await res.json()
      message = json.error ?? json.message ?? message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}

export async function apiForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    let message = 'Upload failed'
    try {
      const json = await res.json()
      message = json.error ?? json.message ?? message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}
