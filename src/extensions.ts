import { Logger } from '@hocuspocus/extension-logger'
import { Redis } from '@hocuspocus/extension-redis'
import { S3 } from '@hocuspocus/extension-s3'
import type { AppEnv } from './env.js'
import { createPostgresDatabaseExtension } from './storage/postgres.js'
import { log } from './log.js'

function redisOptionsFromUrl(redisUrl: string): Record<string, unknown> {
  const url = new URL(redisUrl)
  const db = url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : undefined

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  }
}

export function createExtensions(env: AppEnv): unknown[] {
  const extensions: unknown[] = [new Logger()]

  if (env.redisEnabled && env.redisUrl) {
    extensions.push(new Redis(redisOptionsFromUrl(env.redisUrl) as never))
    log.info('Redis realtime sync enabled')
  }

  if (env.storageDriver === 's3') {
    extensions.push(new S3({
      bucket: env.s3Bucket!,
      region: env.s3Region,
      endpoint: env.s3Endpoint,
      prefix: env.s3Prefix,
      forcePathStyle: env.s3ForcePathStyle,
      credentials: env.awsAccessKeyId && env.awsSecretAccessKey
        ? {
          accessKeyId: env.awsAccessKeyId,
          secretAccessKey: env.awsSecretAccessKey,
        }
        : undefined,
    }))
    log.info('S3/MinIO document storage enabled', {
      bucket: env.s3Bucket,
      endpoint: env.s3Endpoint || 'aws-default',
      prefix: env.s3Prefix,
    })
  }

  if (env.storageDriver === 'postgres') {
    extensions.push(createPostgresDatabaseExtension(env))
    log.info('PostgreSQL document storage enabled', { table: env.postgresTable })
  }

  if (env.storageDriver === 'memory') {
    log.warn('Memory storage enabled. Documents will be lost when the container restarts.')
  }

  return extensions
}
