import { Command } from 'commander'
import dotenv from 'dotenv'

dotenv.config()

export type StorageDriver = 's3' | 'postgres' | 'memory'
export type AuthMode = 'none' | 'static' | 'webhook'

export interface AppEnv {
  nodeEnv: string
  name: string
  port: number
  timeout: number
  debounce: number
  maxDebounce: number
  maxPayloadBytes: number
  storageDriver: StorageDriver
  authMode: AuthMode
  allowNoAuthInProduction: boolean
  hocuspocusToken?: string
  authEndpoint?: string
  authWebhookTimeoutMs: number
  roomNameRegex: RegExp
  roomNameRegexSource: string
  redisUrl?: string
  redisEnabled: boolean
  postgresUrl?: string
  postgresTable: string
  s3Bucket?: string
  s3Region: string
  s3Endpoint?: string
  s3Prefix: string
  s3ForcePathStyle: boolean
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

const program = new Command()
  .name('hocuspocus-coolify')
  .description('Production-ready Hocuspocus service for Coolify')
  .option('-p, --port <number>', 'HTTP/WebSocket port')
  .option('--name <name>', 'Hocuspocus instance name')
  .option('--storage <driver>', 'Storage driver: s3, postgres, memory')
  .option('--auth <mode>', 'Auth mode: none, static, webhook')
  .option('--redis-url <url>', 'Redis URL used for horizontal sync')
  .option('--postgres-url <url>', 'PostgreSQL connection string')
  .option('--s3-bucket <bucket>', 'S3/MinIO bucket name')
  .allowUnknownOption(false)

program.parse(process.argv)
const options = program.opts<Record<string, string | undefined>>()

function integer(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`)
  }
  return parsed
}

function boolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase())
}

function enumValue<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  const resolved = (value || process.env[name] || fallback) as T
  if (!allowed.includes(resolved)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')}. Received: ${resolved}`)
  }
  return resolved
}

const storageDriver = enumValue<StorageDriver>('STORAGE_DRIVER', options.storage, ['s3', 'postgres', 'memory'], 's3')
const authMode = enumValue<AuthMode>('AUTH_MODE', options.auth, ['none', 'static', 'webhook'], 'static')
const roomNameRegexSource = process.env.ROOM_NAME_REGEX || '^[a-zA-Z0-9:._-]{1,240}$'

export const env: AppEnv = {
  nodeEnv: process.env.NODE_ENV || 'development',
  name: options.name || process.env.HOCUSPOCUS_NAME || `hocuspocus-${process.pid}`,
  port: Number(options.port || process.env.PORT || 1234),
  timeout: integer('HOCUSPOCUS_TIMEOUT_MS', 60_000),
  debounce: integer('HOCUSPOCUS_DEBOUNCE_MS', 2_000),
  maxDebounce: integer('HOCUSPOCUS_MAX_DEBOUNCE_MS', 10_000),
  maxPayloadBytes: integer('HOCUSPOCUS_MAX_PAYLOAD_BYTES', 10 * 1024 * 1024),
  storageDriver,
  authMode,
  allowNoAuthInProduction: boolean('ALLOW_NO_AUTH_IN_PRODUCTION', false),
  hocuspocusToken: process.env.HOCUSPOCUS_TOKEN,
  authEndpoint: process.env.AUTH_ENDPOINT,
  authWebhookTimeoutMs: integer('AUTH_WEBHOOK_TIMEOUT_MS', 5_000),
  roomNameRegex: new RegExp(roomNameRegexSource),
  roomNameRegexSource,
  redisUrl: options.redisUrl || process.env.REDIS_URL,
  redisEnabled: boolean('REDIS_ENABLED', Boolean(options.redisUrl || process.env.REDIS_URL)),
  postgresUrl: options.postgresUrl || process.env.DATABASE_URL || process.env.POSTGRES_URL,
  postgresTable: process.env.POSTGRES_DOCUMENTS_TABLE || 'hocuspocus_documents',
  s3Bucket: options.s3Bucket || process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
  s3Endpoint: process.env.S3_ENDPOINT,
  s3Prefix: process.env.S3_PREFIX || 'hocuspocus-documents/',
  s3ForcePathStyle: boolean('S3_FORCE_PATH_STYLE', Boolean(process.env.S3_ENDPOINT)),
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  logLevel: (process.env.LOG_LEVEL || 'info') as AppEnv['logLevel'],
}

export function validateEnv(): void {
  if (!Number.isInteger(env.port) || env.port <= 0) {
    throw new Error(`PORT must be a positive integer. Received: ${env.port}`)
  }

  if (env.authMode === 'none' && env.nodeEnv === 'production' && !env.allowNoAuthInProduction) {
    throw new Error('AUTH_MODE=none is blocked in production. Set AUTH_MODE=static/webhook or ALLOW_NO_AUTH_IN_PRODUCTION=true for temporary tests.')
  }

  if (env.authMode === 'static' && !env.hocuspocusToken) {
    throw new Error('AUTH_MODE=static requires HOCUSPOCUS_TOKEN.')
  }

  if (env.authMode === 'webhook' && !env.authEndpoint) {
    throw new Error('AUTH_MODE=webhook requires AUTH_ENDPOINT.')
  }

  if (env.storageDriver === 's3' && !env.s3Bucket) {
    throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET.')
  }

  if (env.storageDriver === 'postgres' && !env.postgresUrl) {
    throw new Error('STORAGE_DRIVER=postgres requires DATABASE_URL or POSTGRES_URL.')
  }
}
