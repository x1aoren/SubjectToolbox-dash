/**
 * 启动时加载仓库根目录的 `.env`。
 *
 * 设计约束：
 * - 只读 **仓库根目录** 的 `.env`（默认 `<repo>/.env`，可用 `STB_ENV_FILE` 指向别的文件，
 *   方便测试或容器挂载）；
 * - **系统环境变量优先**：已存在的环境变量不会被 `.env` 覆盖，因此 systemd 的
 *   `Environment=` / `EnvironmentFile=`、Docker `-e`、当前 shell 的 `$env:XXX`
 *   永远比 `.env` 里的同名项优先；
 * - 文件不存在不是错误（生产可以继续用 systemd / 容器注入），缺文件时完全沿用系统环境与代码默认值；
 * - 每次进程启动只读一次，不监听文件变化；改 `.env` 后需要重启服务；
 * - 自带一个极小的 `.env` 解析器（不引第三方依赖）：支持 `#` 注释、`export KEY=value`、
 *   单/双引号、CRLF，并会去掉 Windows 记事本常见的 UTF-8 BOM；
 * - 本模块必须在任何业务模块读取 `process.env` 之前被求值（由 `env.ts` 首行 re-export 保证）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根目录（server/ 的上一级）。 */
export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** `.env` 的实际路径：默认仓库根目录，可用 STB_ENV_FILE 覆盖。 */
export const ENV_FILE_PATH =
  (process.env.STB_ENV_FILE ?? '').trim() || resolve(ROOT_DIR, '.env')

export interface EnvFileResult {
  /** 实际尝试读取的路径 */
  path: string
  /** 文件存在且成功读取 */
  loaded: boolean
  /** 本次从文件新增到 process.env 的变量个数（不含被系统环境变量优先覆盖的） */
  keys: number
  /** 文件里解析出的变量总数（含被系统环境变量覆盖的） */
  total: number
  /** 读取/解析失败信息（不影响服务启动） */
  error?: string
}

/**
 * 解析 `.env` 文本。
 *
 * 只覆盖实际会用到的简单语法：
 * - 空行、`# 注释` 忽略；
 * - `export KEY=value` 与 `KEY=value` 等价；
 * - 值两侧的单/双引号会被去掉；双引号内支持 `\n` `\r` `\t` `\"` `\\` 转义；
 * - 未加引号的值如果出现「空白 + #」，后面视为注释；
 * - 重复 KEY 以第一次出现为准（与常见 dotenv 行为一致）。
 */
export function parseEnvContent(raw: string): Map<string, string> {
  const entries = new Map<string, string>()
  const text = raw.replace(/^\uFEFF/, '')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed
    const eq = withoutExport.indexOf('=')
    if (eq <= 0) continue
    const key = withoutExport.slice(0, eq).trim()
    // 只接受常见 shell 变量名，避免把奇怪的行当成配置
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) continue
    let value = withoutExport.slice(eq + 1).trim()
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0]!
      const end = value.indexOf(quote, 1)
      const quoted = end > 0 ? value.slice(1, end) : value.slice(1)
      value = quote === '"'
        ? quoted
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
        : quoted
    } else {
      const commentAt = value.search(/\s#/)
      if (commentAt >= 0) value = value.slice(0, commentAt).trim()
    }
    if (!entries.has(key)) entries.set(key, value)
  }
  return entries
}

function loadEnvFile(): EnvFileResult {
  const path = ENV_FILE_PATH
  if (!existsSync(path)) return { path, loaded: false, keys: 0, total: 0 }

  try {
    const entries = parseEnvContent(readFileSync(path, 'utf8'))
    let added = 0
    for (const [key, value] of entries) {
      // 系统环境变量优先：已经存在的键（包括显式空字符串）不覆盖
      if (process.env[key] !== undefined) continue
      process.env[key] = value
      added += 1
    }
    return { path, loaded: true, keys: added, total: entries.size }
  } catch (error) {
    return {
      path,
      loaded: false,
      keys: 0,
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 进程启动时立即读取一次；后续所有 `process.env` 读取都能看到 `.env` 的值。 */
export const ENV_FILE_RESULT: EnvFileResult = loadEnvFile()

/** 打印 `.env` 加载结果（只输出路径与变量个数，绝不输出变量值/密码）。 */
export function logEnvFile(result: EnvFileResult = ENV_FILE_RESULT): void {
  if (result.loaded) {
    const covered = result.total - result.keys
    console.log(
      `[env] 已读取 .env：${result.path}（新增 ${result.keys} 个变量` +
        `${covered > 0 ? `，${covered} 个被系统环境变量优先覆盖` : ''}）`,
    )
    return
  }
  if (result.error) {
    console.log(`[env] 读取 .env 失败：${result.error}（继续使用系统环境变量与默认值）`)
    return
  }
  console.log(`[env] 未找到 .env（${result.path}），使用系统环境变量与代码默认值`)
}
