/**
 * 运行环境的判定。
 *
 * 首行的 re-export 同时建立了对 `load-env` 的模块依赖：ESM 会先求值 `load-env`，
 * 它会读取仓库根目录的 `.env`（系统环境变量优先、文件可缺省），然后才执行本文件。
 * 因此下面以及其它模块读到的 `process.env` 已经包含 `.env` 的值。
 * 这个加载顺序是 ESM 模块求值规则保证的，不要随意调整。
 *
 * 本文件只读 `process.env`，不依赖 db / auth / 任何业务模块，
 * 避免 `db.ts ← env.ts` 和其它模块之间出现循环依赖。
 */
export { ENV_FILE_PATH, ENV_FILE_RESULT, logEnvFile } from './load-env.js'

/** 生产模式：不播种演示数据、不展示演示账号、不允许重建演示数据。 */
export const IS_PRODUCTION =
  process.env.STB_ENV === 'production' || process.env.NODE_ENV === 'production'

/**
 * 可选的数据目录覆盖（测试 / 容器部署用）。
 * 可以是绝对路径，也可以是相对仓库根目录的路径；为空表示使用 `<repo>/data`。
 */
export const DATA_DIR_OVERRIDE = (process.env.STB_DATA_DIR ?? '').trim()
