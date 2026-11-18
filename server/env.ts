/**
 * 运行环境的判定。
 *
 * 这个文件只读 `process.env`，不依赖 db / auth / 任何业务模块，
 * 避免 `db.ts ← env.ts` 和其它模块之间出现循环依赖。
 */

/** 生产模式：不播种演示数据、不展示演示账号、不允许重建演示数据。 */
export const IS_PRODUCTION =
  process.env.STB_ENV === 'production' || process.env.NODE_ENV === 'production'

/**
 * 可选的数据目录覆盖（测试 / 容器部署用）。
 * 可以是绝对路径，也可以是相对仓库根目录的路径；为空表示使用 `<repo>/data`。
 */
export const DATA_DIR_OVERRIDE = (process.env.STB_DATA_DIR ?? '').trim()
