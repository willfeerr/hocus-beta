import type { AppEnv } from './env.js'
import { log } from './log.js'

export interface CollaborationContext {
  userId: string
  readOnly: boolean
  permissions: string[]
  authMode: AppEnv['authMode']
  documentName: string
}

interface AuthenticatePayload {
  documentName: string
  token: string
  providerVersion?: string
  requestHeaders: Headers
  requestParameters: URLSearchParams
  connection: {
    readOnly: boolean
  }
}

function redactToken(token: string): string {
  if (!token) return ''
  if (token.length <= 8) return '********'
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

export async function authenticate(data: AuthenticatePayload, env: AppEnv): Promise<CollaborationContext> {
  if (env.authMode === 'none') {
    return {
      userId: 'anonymous',
      readOnly: false,
      permissions: ['read', 'write'],
      authMode: 'none',
      documentName: data.documentName,
    }
  }

  if (env.authMode === 'static') {
    if (!data.token || data.token !== env.hocuspocusToken) {
      log.warn('Rejected websocket auth with invalid static token', {
        documentName: data.documentName,
        token: redactToken(data.token),
      })
      throw new Error('Not authorized')
    }

    return {
      userId: 'static-token-user',
      readOnly: false,
      permissions: ['read', 'write'],
      authMode: 'static',
      documentName: data.documentName,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.authWebhookTimeoutMs)

  try {
    const response = await fetch(env.authEndpoint!, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: data.requestHeaders.get('authorization') || (data.token ? `Bearer ${data.token}` : ''),
        cookie: data.requestHeaders.get('cookie') || '',
        'x-hocuspocus-document': data.documentName,
        'x-hocuspocus-provider-version': data.providerVersion || '',
      },
      body: JSON.stringify({
        documentName: data.documentName,
        token: data.token,
        providerVersion: data.providerVersion,
        params: Object.fromEntries(data.requestParameters.entries()),
      }),
    })

    if (!response.ok) {
      log.warn('Rejected websocket auth through webhook', {
        documentName: data.documentName,
        status: response.status,
      })
      throw new Error('Not authorized')
    }

    const payload = await response.json().catch(() => ({} as Record<string, unknown>))
    const readOnly = Boolean(payload.readOnly)
    data.connection.readOnly = readOnly

    return {
      userId: String(payload.userId || payload.sub || 'webhook-user'),
      readOnly,
      permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : readOnly ? ['read'] : ['read', 'write'],
      authMode: 'webhook',
      documentName: data.documentName,
    }
  } finally {
    clearTimeout(timeout)
  }
}
