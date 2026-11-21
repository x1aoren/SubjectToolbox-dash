/**
 * 生产模式首次启动初始化（契约第 3 节）。
 *
 * 与演示播种（`seed.ts`）完全分开：这里绝不写入设备、遥测、反馈等演示数据，
 * 只准备一个可登录、可下发配置、可接收客户端上报的最小可用环境：
 *   1. 管理员 owner 账号（无用户时）+ data/initial-admin.txt
 *   2. 初始配置修订 #1 与 config_state（无已发布修订时）
 *   3. 生产客户端密钥 + data/initial-client-key.txt（无可用密钥时）
 *   4. 设置：关闭演示标记、默认禁止匿名上报，工作区/组织名可选覆盖
 *
 * 所有步骤都幂等：非首次启动不会重复创建账号/修订/密钥。
 */
import { chmodSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import {
  DATA_DIR,
  DEFAULT_SETTINGS,
  db,
  nowIso,
  setSetting,
  tx,
} from './db.js'
import { generatePassword, hashPassword, issueApiKey } from './auth.js'
import { LATEST_VERSION, LATEST_VERSION_CODE, TOOLS } from './catalog.js'
import { validateConfig, type RemoteConfig } from './config-domain.js'

export interface BootstrapResult {
  createdAdmin: boolean
  adminUsername: string
  adminFile: string | null
  createdRevision: boolean
  revisionVersionNo: number | null
  createdApiKey: boolean
  clientKeyFile: string | null
  demoDataWritten: false
}

function writeSecretFile(filename: string, content: string): string {
  const path = resolve(DATA_DIR, filename)
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(path, 0o600)
  } catch {
    // Windows 上 chmod 基本是空操作，忽略即可
  }
  return path
}

/** 生产模式初始配置：全工具启用、无公告、features=[]、release 取 catalog 最新版本。 */
function initialProductionConfig(): RemoteConfig {
  return validateConfig({
    maintenance: { enabled: false, message: '', startAt: null, endAt: null },
    release: {
      latestVersion: LATEST_VERSION,
      latestVersionCode: LATEST_VERSION_CODE,
      minSupportedVersion: '1.0.0',
      forceUpdate: false,
      updateNotes: '',
    },
    content: { version: '1', rollout: 100, notes: '' },
    tools: TOOLS.map((tool) => ({
      toolId: tool.id,
      enabled: true,
      minVersion: '1.0.0',
      channels: ['stable', 'beta'],
      disabledReason: '',
    })),
    announcements: [],
    features: [],
  })
}

function countOf(sql: string): number {
  return Number((db().prepare(sql).get() as { n: number }).n)
}

/**
 * 生产模式初始化。返回本次实际创建了哪些东西，供启动日志使用。
 */
export function bootstrapProduction(): BootstrapResult {
  const result: BootstrapResult = {
    createdAdmin: false,
    adminUsername: '',
    adminFile: null,
    createdRevision: false,
    revisionVersionNo: null,
    createdApiKey: false,
    clientKeyFile: null,
    demoDataWritten: false,
  }
  const database = db()

  /* ------------------------------ 设置 ------------------------------ */
  // allow_anonymous_ingest 单独处理：
  //   - 首次初始化（settings 里没有该键）默认写入 '0'（关闭）；
  //   - 之后不再覆盖，保留控制台里修改过的值（重启后仍保留）；
  //   - STB_ALLOW_ANONYMOUS=1 时每次启动强制写 '1'。
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (key === 'allow_anonymous_ingest') continue
    database.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(?,?)').run(key, value)
  }
  // 生产环境不允许演示数据标记：每次启动强制清空
  setSetting('demo_seeded_at', '')
  const allowAnonymousRow = database
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('allow_anonymous_ingest') as { value: string } | undefined
  if (process.env.STB_ALLOW_ANONYMOUS === '1') {
    if (allowAnonymousRow?.value !== '1') setSetting('allow_anonymous_ingest', '1')
  } else if (!allowAnonymousRow) {
    setSetting('allow_anonymous_ingest', '0')
  }
  const workspaceName = (process.env.STB_WORKSPACE_NAME ?? '').trim()
  if (workspaceName) setSetting('workspace_name', workspaceName.slice(0, 80))
  const orgName = (process.env.STB_ORG_NAME ?? '').trim()
  if (orgName) setSetting('org_name', orgName.slice(0, 120))

  /* ---------------------------- 管理员账号 --------------------------- */
  let ownerId = (
    database.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1").get() as
      | { id: string }
      | undefined
  )?.id

  if (countOf('SELECT COUNT(*) AS n FROM users') === 0) {
    const username = (process.env.STB_ADMIN_USER ?? '').trim() || 'admin'
    const envPassword = process.env.STB_ADMIN_PASSWORD
    const password =
      typeof envPassword === 'string' && envPassword.length > 0 ? envPassword : generatePassword(16)
    const createdAt = nowIso()
    ownerId = `usr_${randomBytes(10).toString('hex')}`
    database
      .prepare(
        `INSERT INTO users(id, username, display_name, email, role, password_hash, status,
           avatar_color, created_at, last_login_at, must_change_password)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        ownerId,
        username,
        '学校管理员',
        '',
        'owner',
        hashPassword(password),
        'active',
        '#3F6E5A',
        createdAt,
        null,
        1,
      )
    const host = process.env.HOST ?? '127.0.0.1'
    const port = Number(process.env.PORT ?? 8787) || 8787
    const loginUrl = (process.env.STB_PUBLIC_URL ?? `http://${host}:${port}`).replace(/\/+$/, '')
    const content = [
      'SubjectToolbox 运营控制台 · 生产环境初始管理员',
      '',
      `用户名：${username}`,
      `密码：${password}`,
      `登录地址：${loginUrl}`,
      '',
      `生成时间：${createdAt}`,
      '首次登录后请立即修改密码（该账号已标记为必须修改密码）。',
      '本文件包含敏感信息，请妥善保管并在初始化完成后删除或限制访问。',
    ].join('\n')
    result.createdAdmin = true
    result.adminUsername = username
    result.adminFile = writeSecretFile('initial-admin.txt', content)
  } else {
    result.adminUsername =
      (
        database.prepare('SELECT username FROM users ORDER BY created_at LIMIT 1').get() as
          | { username: string }
          | undefined
      )?.username ?? ''
  }

  /* ---------------------------- 初始配置修订 ------------------------- */
  const revisionCount = countOf('SELECT COUNT(*) AS n FROM config_revisions')
  if (revisionCount === 0) {
    const config = initialProductionConfig()
    const publishedAt = nowIso()
    tx(() => {
      const inserted = database
        .prepare(
          `INSERT INTO config_revisions(version_no, json, summary, published_by, published_by_name, published_at)
           VALUES(?,?,?,?,?,?)`,
        )
        .run(
          1,
          JSON.stringify(config, null, 2),
          '生产模式初始化：全部工具启用',
          null,
          '系统初始化',
          publishedAt,
        )
      database
        .prepare(
          `INSERT INTO config_state(id, draft_json, active_revision_id, updated_at, updated_by, updated_by_name)
           VALUES(1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             draft_json = excluded.draft_json,
             active_revision_id = excluded.active_revision_id,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by,
             updated_by_name = excluded.updated_by_name`,
        )
        .run(
          JSON.stringify(config, null, 2),
          Number(inserted.lastInsertRowid),
          publishedAt,
          null,
          '系统初始化',
        )
      setSetting('last_publish_at', publishedAt)
    })
    result.createdRevision = true
    result.revisionVersionNo = 1
  } else {
    // 防御性修复：修订存在但 config_state 缺失时，把最新修订设为线上版本
    const stateRow = database.prepare('SELECT id FROM config_state WHERE id = 1').get() as
      | { id: number }
      | undefined
    if (!stateRow) {
      const latest = database
        .prepare('SELECT id, version_no, json, published_at FROM config_revisions ORDER BY version_no DESC LIMIT 1')
        .get() as { id: number; version_no: number; json: string; published_at: string } | undefined
      if (latest) {
        database
          .prepare(
            `INSERT INTO config_state(id, draft_json, active_revision_id, updated_at, updated_by, updated_by_name)
             VALUES(1, ?, ?, ?, ?, ?)`,
          )
          .run(latest.json, latest.id, latest.published_at, null, '系统初始化')
      }
    }
  }

  /* --------------------------- 生产客户端密钥 ------------------------- */
  if (countOf('SELECT COUNT(*) AS n FROM api_keys WHERE revoked_at IS NULL') === 0) {
    const creatorId =
      ownerId ??
      (database.prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get() as
        | { id: string }
        | undefined)?.id
    const { row, secret } = issueApiKey('生产客户端密钥', creatorId ?? '')
    const content = [
      'SubjectToolbox 生产环境客户端接入密钥',
      '',
      `名称：${row.name}`,
      `密钥：${secret}`,
      `前缀：${row.prefix}`,
      `创建时间：${row.created_at}`,
      '',
      '在客户端请求头中携带：X-STB-Key: <密钥>',
      '本文件包含敏感信息，请妥善保管；密钥可在控制台「设置 → 接入密钥」中吊销或轮换。',
    ].join('\n')
    result.createdApiKey = true
    result.clientKeyFile = writeSecretFile('initial-client-key.txt', content)
  }

  return result
}

/** 生产模式启动日志（只在首次创建了东西时详细提示，避免每次启动都打印）。 */
export function logBootstrap(result: BootstrapResult): void {
  console.log('[boot] 生产模式：未写入演示数据')
  if (result.createdAdmin) {
    console.log(
      `[boot] 已创建管理员账号 ${result.adminUsername}，初始密码见 ${result.adminFile}（首次登录后请修改）`,
    )
  }
  if (result.createdRevision) {
    console.log(`[boot] 已创建初始配置修订 #${result.revisionVersionNo}（全部工具启用）`)
  }
  if (result.createdApiKey) {
    console.log(`[boot] 已生成生产客户端密钥，完整密钥见 ${result.clientKeyFile}`)
  }
}
