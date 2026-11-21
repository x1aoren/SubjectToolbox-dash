import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import staticPlugin from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT, closeDb } from './db.js'
import { IS_PRODUCTION, logEnvFile } from './env.js'
import { runMigrations } from './migrate.js'
import { bootstrapProduction, logBootstrap } from './bootstrap.js'
import { ensureSeeded } from './seed.js'
import { authRoutes } from './routes/auth.js'
import { overviewRoutes } from './routes/overview.js'
import { telemetryRoutes } from './routes/telemetry.js'
import { feedbackRoutes } from './routes/feedback.js'
import { configRoutes } from './routes/config.js'
import { auditRoutes, userRoutes } from './routes/users.js'
import { systemRoutes } from './routes/system.js'
import { toolSyncRoutes } from './routes/tool-sync.js'
import { clientRoutes } from './routes/client.js'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'
const WEB_DIST = resolve(ROOT, 'dist/web')

async function main(): Promise<void> {
  // 启动信息第一行：说明 .env 的加载结果（只打路径与数量，不打变量值）
  logEnvFile()

  // 启动流程最前面：幂等迁移（补 device_tool_overrides.reason 列 + 归一化已存配置）
  const migration = runMigrations()
  if (
    migration.addedReasonColumn ||
    migration.revisionsNormalized > 0 ||
    migration.draftNormalized ||
    migration.skipped > 0
  ) {
    console.log(
      `[migrate] 补列 ${migration.addedReasonColumn ? 'device_tool_overrides.reason' : '无'} · ` +
        `修订归一化 ${migration.revisionsNormalized} 条 · 草稿归一化 ${migration.draftNormalized ? '是' : '否'} · ` +
        `损坏跳过 ${migration.skipped} 条`,
    )
  }

  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  })

  await app.register(cookie)

  // 允许带 application/json 但内容为空的请求（例如「吊销密钥」这类无参数 POST）
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    void request
    const text = typeof body === 'string' ? body.trim() : ''
    if (text === '') {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(text))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'same-origin')
    if (request.url.startsWith('/api') || request.url.startsWith('/v1')) {
      reply.header('Cache-Control', 'no-store')
    }
    return payload
  })

  app.setErrorHandler((error, request, reply) => {
    const failure = error as { statusCode?: number; code?: string; message?: string }
    const statusCode =
      typeof failure.statusCode === 'number' && failure.statusCode >= 400 ? failure.statusCode : 500
    const code = failure.code ?? (statusCode === 500 ? 'internal_error' : 'request_error')
    if (statusCode >= 500) {
      console.error(`[api] ${request.method} ${request.url}`, error)
    }
    reply.status(statusCode).send({
      error: {
        code,
        message: statusCode >= 500 ? '服务器内部错误，请稍后再试' : failure.message ?? '请求失败',
      },
    })
  })

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/v1')) {
      reply.status(404).send({ error: { code: 'not_found', message: '接口不存在' } })
      return
    }
    if (existsSync(resolve(WEB_DIST, 'index.html'))) {
      reply.type('text/html; charset=utf-8').send(readFileSync(resolve(WEB_DIST, 'index.html')))
      return
    }
    reply
      .type('text/html; charset=utf-8')
      .send(
        '<!doctype html><meta charset="utf-8"><title>SubjectToolbox Console</title><body style="font-family:system-ui;padding:48px"><h1>前端尚未构建</h1><p>开发模式请访问 Vite 地址（默认 http://127.0.0.1:5173），或执行 <code>pnpm build</code> 后重试。</p></body>',
      )
  })

  await app.register(authRoutes)
  await app.register(overviewRoutes)
  await app.register(telemetryRoutes)
  await app.register(feedbackRoutes)
  await app.register(configRoutes)
  await app.register(userRoutes)
  await app.register(auditRoutes)
  await app.register(systemRoutes)
  await app.register(toolSyncRoutes)
  await app.register(clientRoutes)

  if (existsSync(WEB_DIST)) {
    await app.register(staticPlugin, { root: WEB_DIST, prefix: '/' })
  }

  if (IS_PRODUCTION) {
    // 生产模式：不写演示数据，只创建最小可用的管理员 / 配置修订 / 客户端密钥
    logBootstrap(bootstrapProduction())
  } else {
    const seed = ensureSeeded()
    if (seed.seeded) {
      console.log('[boot] 首次启动，已写入学科工具箱演示数据')
      console.log(`[boot] 演示账号与客户端密钥见 ${seed.credentials}`)
    }
  }

  await app.listen({ port: PORT, host: HOST })
  const lines = [
    '',
    '  学科工具箱 · 运营控制台',
    `  运行模式 ${IS_PRODUCTION ? '生产环境（不播种演示数据）' : '开发 / 演示环境'}`,
    `  控制台   http://${HOST}:${PORT}`,
    `  客户端   http://${HOST}:${PORT}/v1/health`,
    `  前端产物 ${existsSync(WEB_DIST) ? '已托管 dist/web' : '未构建（开发模式请用 Vite）'}`,
    '',
  ]
  console.log(lines.join('\n'))

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[boot] 收到 ${signal}，正在关闭…`)
    await app.close()
    closeDb()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error) => {
  console.error('[boot] 启动失败', error)
  process.exit(1)
})
