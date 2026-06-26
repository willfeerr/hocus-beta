import { env } from './env.js'

const order = ['debug', 'info', 'warn', 'error'] as const

type Level = typeof order[number]

function enabled(level: Level): boolean {
  return order.indexOf(level) >= order.indexOf(env.logLevel)
}

export const log = {
  debug(message: string, meta?: unknown) {
    if (enabled('debug')) console.debug(JSON.stringify({ level: 'debug', message, meta, ts: new Date().toISOString() }))
  },
  info(message: string, meta?: unknown) {
    if (enabled('info')) console.info(JSON.stringify({ level: 'info', message, meta, ts: new Date().toISOString() }))
  },
  warn(message: string, meta?: unknown) {
    if (enabled('warn')) console.warn(JSON.stringify({ level: 'warn', message, meta, ts: new Date().toISOString() }))
  },
  error(message: string, meta?: unknown) {
    if (enabled('error')) console.error(JSON.stringify({ level: 'error', message, meta, ts: new Date().toISOString() }))
  },
}
