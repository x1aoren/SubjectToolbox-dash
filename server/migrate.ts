/**
 * 启动时的幂等数据迁移。
 *
 * 契约第 2.1 节：
 *  1. `device_tool_overrides` 缺 `reason` 列则补列（用户可见的停用原因）；
 *  2. 所有 `config_revisions.json` 与 `config_state.draft_json` 用 validateConfig 归一化后写回
 *     （补 `disabledReason`、按目录顺序重排 `tools`、补齐缺失工具）。
 *
 * 损坏的 JSON 跳过并保留原样：迁移失败不能阻止服务启动。
 */
import { db } from './db.js'
import { validateConfig } from './config-domain.js'

export interface MigrationResult {
  addedReasonColumn: boolean
  revisionsNormalized: number
  draftNormalized: boolean
  skipped: number
}

/** 把一份已存的配置 JSON 归一化；无法解析/校验时返回 null（调用方跳过）。 */
function normalizeConfigJson(json: string): string | null {
  try {
    return JSON.stringify(validateConfig(JSON.parse(json)), null, 2)
  } catch {
    return null
  }
}

function tableColumns(table: string): string[] {
  const rows = db().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

export function runMigrations(): MigrationResult {
  const result: MigrationResult = {
    addedReasonColumn: false,
    revisionsNormalized: 0,
    draftNormalized: false,
    skipped: 0,
  }
  const database = db()

  // 1) device_tool_overrides.reason
  try {
    if (!tableColumns('device_tool_overrides').includes('reason')) {
      database.exec(
        "ALTER TABLE device_tool_overrides ADD COLUMN reason TEXT NOT NULL DEFAULT ''",
      )
      result.addedReasonColumn = true
    }
  } catch (error) {
    // 并发启动等极端情况：列已存在或数据库不可写，都不应阻止启动
    console.error('[migrate] 补 device_tool_overrides.reason 列失败', error)
  }

  // 2) 归一化已发布修订
  try {
    const rows = database
      .prepare('SELECT id, json FROM config_revisions ORDER BY id')
      .all() as Array<{ id: number; json: string }>
    const update = database.prepare('UPDATE config_revisions SET json = ? WHERE id = ?')
    for (const row of rows) {
      const normalized = normalizeConfigJson(row.json)
      if (normalized === null) {
        result.skipped += 1
        continue
      }
      if (normalized !== row.json) {
        update.run(normalized, row.id)
        result.revisionsNormalized += 1
      }
    }
  } catch (error) {
    console.error('[migrate] 归一化 config_revisions 失败', error)
  }

  // 3) 归一化配置草稿
  try {
    const row = database.prepare('SELECT draft_json FROM config_state WHERE id = 1').get() as
      | { draft_json: string }
      | undefined
    if (row) {
      const normalized = normalizeConfigJson(row.draft_json)
      if (normalized === null) {
        result.skipped += 1
      } else if (normalized !== row.draft_json) {
        database.prepare('UPDATE config_state SET draft_json = ? WHERE id = 1').run(normalized)
        result.draftNormalized = true
      }
    }
  } catch (error) {
    console.error('[migrate] 归一化 config_state.draft_json 失败', error)
  }

  return result
}
