#!/usr/bin/env node
import { Server } from '@hocuspocus/server'
import { env, validateEnv } from './env.js'
import { createExtensions } from './extensions.js'
import { authenticate, type CollaborationContext } from './auth.js'
import { log } from './log.js'

const startedAt = new Date()
let connectionCount = 0
let documentLoadCount = 0
let documentStoreCount = 0

function sendJson(response: import('node:http').ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function handleHttpRoute(data: { request: import('node:http').IncomingMessage; response: import('node:http').ServerResponse }): Promise<void> {
  const { request, response } = data
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  if (url.pathname === '/' || url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'hocuspocus-coolify-cli',
      name: env.name,
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    })
    return Promise.reject()
  }

  if (url.pathname === '/ready') {
    sendJson(response, 200, {
      ok: true,
      service: 'hocuspocus-coolify-cli',
      name: env.name,
      authMode: env.authMode,
      storageDriver: env.storageDriver,
      redisEnabled: env.redisEnabled,
      roomNameRegex: env.roomNameRegexSource,
      connections: connectionCount,
      documentLoads: documentLoadCount,
      documentStores: documentStoreCount,
      startedAt: startedAt.toISOString(),
    })
    return Promise.reject()
  }

  if (url.pathname === '/version') {
    sendJson(response, 200, {
      name: 'hocuspocus-coolify-cli',
      version: '0.1.0',
      hocuspocus: '4.x',
      node: process.version,
    })
    return Promise.reject()
  }

  return Promise.resolve()
}

async function main(): Promise<void> {
  validateEnv()

  const server = new Server<CollaborationContext>({
    name: env.name,
    port: env.port,
    quiet: true,
    timeout: env.timeout,
    debounce: env.debounce,
    maxDebounce: env.maxDebounce,
    websocketOptions: {
      maxPayload: env.maxPayloadBytes,
    },
    extensions: createExtensions(env) as never,

    async onRequest(data) {
      return handleHttpRoute(data)
    },

    async onConnect({ documentName }) {
      if (!env.roomNameRegex.test(documentName)) {
        log.warn('Rejected room name that does not match ROOM_NAME_REGEX', { documentName })
        throw new Error('Invalid document name')
      }
    },

    async onAuthenticate(data) {
      const context = await authenticate(data, env)
      log.debug('Authenticated websocket connection', {
        documentName: data.documentName,
        userId: context.userId,
        readOnly: context.readOnly,
        authMode: context.authMode,
      })
      return context
    },

    async connected({ documentName, context }) {
      connectionCount += 1
      log.info('Client connected', {
        documentName,
        userId: context?.userId,
        connections: connectionCount,
      })
    },

    async onDisconnect({ documentName, context }) {
      connectionCount = Math.max(0, connectionCount - 1)
      log.info('Client disconnected', {
        documentName,
        userId: context?.userId,
        connections: connectionCount,
      })
    },

    async afterLoadDocument({ documentName }) {
      documentLoadCount += 1
      log.debug('Document loaded', { documentName, documentLoadCount })
    },

    async onStoreDocument({ documentName }) {
      documentStoreCount += 1
      log.debug('Document store hook completed', { documentName, documentStoreCount })
    },

    async onListen() {
      log.info('Hocuspocus listening', {
        name: env.name,
        port: env.port,
        storageDriver: env.storageDriver,
        authMode: env.authMode,
        redisEnabled: env.redisEnabled,
      })
    },
  })

  const shutdown = async (signal: NodeJS.Signals) => {
    log.info(`Received ${signal}, flushing and shutting down`)
    try {
      await server.destroy()
      process.exit(0)
    } catch (error) {
      log.error('Error during graceful shutdown', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  server.listen()
}

main().catch((error) => {
  log.error('Failed to start Hocuspocus', error instanceof Error ? { message: error.message, stack: error.stack } : error)
  process.exit(1)
})
