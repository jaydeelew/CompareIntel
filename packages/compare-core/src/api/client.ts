import type { AuthStorage } from '../auth/types'

export interface ApiClientConfig {
  baseUrl: string
  authStorage: AuthStorage
  clientSource?: 'web' | 'extension'
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class CompareIntelApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  private async buildHeaders(skipAuth = false): Promise<Headers> {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (!skipAuth && this.config.authStorage.getAuthMode() === 'bearer') {
      const token = await this.config.authStorage.getAccessToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
    return headers
  }

  private async fetchWithAuth(
    path: string,
    init: RequestInit = {},
    skipAuth = false
  ): Promise<Response> {
    const headers = await this.buildHeaders(skipAuth)
    const existing = new Headers(init.headers)
    headers.forEach((v, k) => {
      if (!existing.has(k)) existing.set(k, v)
    })

    const credentials: RequestCredentials =
      this.config.authStorage.getAuthMode() === 'cookie' ? 'include' : 'omit'

    let response = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: existing,
      credentials,
    })

    if (response.status === 401 && this.config.authStorage.getAuthMode() === 'bearer') {
      const refreshed = await this.tryRefreshToken()
      if (refreshed) {
        const retryHeaders = await this.buildHeaders(skipAuth)
        const retryExisting = new Headers(init.headers)
        retryHeaders.forEach((v, k) => {
          if (!retryExisting.has(k)) retryExisting.set(k, v)
        })
        response = await fetch(`${this.config.baseUrl}${path}`, {
          ...init,
          headers: retryExisting,
          credentials: 'omit',
        })
      }
    }

    return response
  }

  private async tryRefreshToken(): Promise<boolean> {
    const refresh = await this.config.authStorage.getRefreshToken()
    if (!refresh) return false
    try {
      const res = await fetch(`${this.config.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
        credentials: 'omit',
      })
      if (!res.ok) return false
      const data = (await res.json()) as {
        access_token: string
        refresh_token: string
      }
      await this.config.authStorage.setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      })
      return true
    } catch {
      return false
    }
  }

  async get<T>(path: string, skipAuth = false): Promise<T> {
    const res = await this.fetchWithAuth(path, { method: 'GET' }, skipAuth)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError('Request failed', res.status, (body as { detail?: string }).detail)
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown, skipAuth = false): Promise<T> {
    const res = await this.fetchWithAuth(
      path,
      { method: 'POST', body: JSON.stringify(body) },
      skipAuth
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new ApiError('Request failed', res.status, (data as { detail?: string }).detail)
    }
    return res.json() as Promise<T>
  }

  async *stream(path: string, body: unknown): AsyncGenerator<string> {
    const payload = {
      ...body,
      ...(this.config.clientSource ? { client_source: this.config.clientSource } : {}),
    }
    const res = await this.fetchWithAuth(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new ApiError('Stream failed', res.status, (data as { detail?: string }).detail)
    }
    const reader = res.body?.getReader()
    if (!reader) throw new ApiError('No response body', 500)
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) yield line.slice(6)
      }
    }
    // Flush any remaining buffered SSE line
    if (buffer.startsWith('data: ')) yield buffer.slice(6)
  }
}
