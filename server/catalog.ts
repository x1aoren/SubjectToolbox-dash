/**
 * SubjectToolbox 的目录数据（学科、工具、版本）。
 *
 * 这里的 id、标题、摘要、学科配色都直接对应 STB 工程里的
 * `app/.../ToolRegistrations.kt` 与各 feature 模块的 `ToolSpec`，
 * 后台用它来标注遥测、配置开关与反馈归因，两边不需要再维护第二套命名。
 */

export type SubjectId =
  | 'chinese'
  | 'math'
  | 'english'
  | 'chemistry'
  | 'biology'
  | 'geography'
  | 'other'

export interface Subject {
  id: SubjectId
  name: string
  short: string
  /** 与 STB `Subject.accent` 的 ARGB 值同色 */
  accent: string
  order: number
}

export const SUBJECTS: Subject[] = [
  { id: 'chinese', name: '语文', short: '语', accent: '#9C4438', order: 0 },
  { id: 'math', name: '数学', short: '数', accent: '#34558B', order: 1 },
  { id: 'english', name: '英语', short: '英', accent: '#2E7D6F', order: 2 },
  { id: 'chemistry', name: '化学', short: '化', accent: '#6B4A8F', order: 3 },
  { id: 'biology', name: '生物', short: '生', accent: '#2E7D32', order: 4 },
  { id: 'geography', name: '地理', short: '地', accent: '#9A6B1F', order: 5 },
  { id: 'other', name: '通用', short: '通', accent: '#546E7A', order: 6 },
]

export const SUBJECT_BY_ID = new Map(SUBJECTS.map((s) => [s.id, s]))

export interface Tool {
  id: string
  subjectId: SubjectId
  title: string
  summary: string
  glyph: string
  /** 演示流量权重，按 STB 各工具的实际使用频度排序 */
  weight: number
}

export const TOOLS: Tool[] = [
  {
    id: 'chinese.poetry',
    subjectId: 'chinese',
    title: '古诗词',
    summary: '必背篇目 · 注释赏析 · 背诵模式',
    glyph: '诗',
    weight: 17,
  },
  {
    id: 'chinese.dictionary',
    subjectId: 'chinese',
    title: '汉语词典',
    summary: '字词释义 · 拼音检索 · 本地生词本',
    glyph: '典',
    weight: 15,
  },
  {
    id: 'math.function',
    subjectId: 'math',
    title: '函数编辑器',
    summary: '多曲线 · 显隐式切换 · 滑块与定义域',
    glyph: '函',
    weight: 13,
  },
  {
    id: 'english.dictionary',
    subjectId: 'english',
    title: '词典',
    summary: '英汉释义 · 音标例句 · 本地生词本',
    glyph: '词',
    weight: 15,
  },
  {
    id: 'english.grammar',
    subjectId: 'english',
    title: '语法',
    summary: '薄冰大学英语语法 · 49 篇专题 · 全文检索',
    glyph: '法',
    weight: 6,
  },
  {
    id: 'chemistry.equation',
    subjectId: 'chemistry',
    title: '化学方程式',
    summary: '508 条方程式 · 检索 · 自动配平',
    glyph: '式',
    weight: 7,
  },
  {
    id: 'chemistry.periodic',
    subjectId: 'chemistry',
    title: '元素周期表',
    summary: '118 种元素 · 点按查看详情',
    glyph: '表',
    weight: 6,
  },
  {
    id: 'biology.diagram',
    subjectId: 'biology',
    title: '交互示意图',
    summary: '细胞分裂等交互动画',
    glyph: '图',
    weight: 4,
  },
  {
    id: 'geography.diagram',
    subjectId: 'geography',
    title: '交互示意图',
    summary: '地球自转 · 昼夜交替与线速度',
    glyph: '图',
    weight: 4,
  },
  {
    id: 'other.textbook',
    subjectId: 'other',
    title: '电子教材',
    summary: '人教社官网 · 各科电子课本 · 需联网',
    glyph: '材',
    weight: 5,
  },
  {
    id: 'other.formula',
    subjectId: 'other',
    title: '公式大全',
    summary: '281 条公式 · 变量说明 · 万能搜索',
    glyph: '公',
    weight: 8,
  },
]

export const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]))

export function toolsOfSubject(subjectId: SubjectId): Tool[] {
  return TOOLS.filter((t) => t.subjectId === subjectId)
}

/* ------------------------------------------------------------------ */
/* 版本                                                                */
/* ------------------------------------------------------------------ */

export type ChangeKind = 'NEW' | 'IMPROVE' | 'FIX'

export interface ChangeItem {
  kind: ChangeKind
  text: string
}

export interface ReleaseNote {
  versionName: string
  versionCode: number
  date: string
  headline: string
  changes: ChangeItem[]
}

/** 与 STB `core/model/Changelog.kt` 一致的发布记录（新 → 旧）。 */
export const RELEASES: ReleaseNote[] = [
  {
    versionName: '1.1.0',
    versionCode: 2,
    date: '2026-11-14',
    headline: '函数编辑器大更新，语文新增汉语词典',
    changes: [
      { kind: 'NEW', text: '语文·汉语词典：收录《现代汉语词典》第 7 版 70,113 条词条，支持汉字、词语、拼音与释义检索；繁体和异体写法会自动跳到对应词条。' },
      { kind: 'NEW', text: '汉语词条页展示拼音、繁体、异体和分段释义，义项序号与词性单独标色；本地生词本可收藏常查词条，词库升级时自动保留。' },
      { kind: 'NEW', text: '「更新日志」页与版本升级提示上线：每个版本只提示一次，设置 → 关于可随时回看。' },
      { kind: 'NEW', text: '函数定义域：表达式后面直接写 {0,10} 就能限定（一侧留空表示无界），也能用「定义域」对话框设置。' },
      { kind: 'NEW', text: '字号新增 0.85×「较小」档，和标准、较大、特大同一行切换。' },
      { kind: 'NEW', text: '双击表达式输入框可以唤起系统键盘，方便粘贴内容、输入键位上没有的符号。' },
      { kind: 'IMPROVE', text: '主页工具卡片只保留工具名，去掉下方的小字描述，卡片高度更紧凑。' },
      { kind: 'IMPROVE', text: '函数编辑器整体翻新：显式 / 隐式手动切换、参数滑块可增删并单独设范围与步进、开方所见即所得。' },
      { kind: 'IMPROVE', text: '光标落在上标还是根号里一眼可辨，拖动时手柄旁浮出「基线 / 上标 / 根号内」。' },
      { kind: 'IMPROVE', text: '学科分区标题、工具卡片和显隐管理里的单字徽章换成 Lucide 图标，共 15 枚。' },
      { kind: 'FIX', text: '修复切换曲线后光标拖不动、点一下输入框还会把上一条曲线的表达式覆盖掉的问题。' },
      { kind: 'FIX', text: '修复两条曲线偶尔共用同一个编号、改一条两条一起变；报错栏固定占位。' },
      { kind: 'NEW', text: '化学·方程式从 165 条扩到 508 条，按碱金属、常见金属、卤族、氮族、碳族、氧族与有机反应补齐，逐条校验原子守恒。' },
      { kind: 'NEW', text: '公式大全从 116 条扩充到 281 条（数学 143 · 物理 99 · 化学 39），每条都带变量说明、适用条件和备注。' },
      { kind: 'FIX', text: '修复英语词典只输入一个汉字查不到内容的问题（如「水」）；搜索结果可以「加载更多」。' },
    ],
  },
  {
    versionName: '1.0.0',
    versionCode: 1,
    date: '2026-11-08',
    headline: '首个正式版本',
    changes: [
      { kind: 'NEW', text: '语文·古诗词：61 篇新课标必背篇目，按册选择，带注释、赏析与背诵模式。' },
      { kind: 'NEW', text: '数学·函数编辑器：最多 6 条曲线同坐标系，圆/椭圆等隐式方程，缩放平移与共享参数滑块。' },
      { kind: 'NEW', text: '英语·词典：ECDICT 77 万词条离线查询，音标、考试标签、词形变化与本地生词本。' },
      { kind: 'NEW', text: '化学·方程式：165 条方程式检索、化学式下标排版与自动配平，另有 118 元素周期表。' },
      { kind: 'NEW', text: '生物 / 地理·交互示意图：细胞分裂与地球自转两组可交互的示意图，索引页可搜索。' },
      { kind: 'NEW', text: '通用·公式大全：116 条数理化公式，KaTeX 排版与符号搜索；电子教材内嵌人教社官网。' },
      { kind: 'NEW', text: '个性化：深浅色、字号、工具置顶、学科与工具显隐管理、最近使用，全部配置只存本机。' },
    ],
  },
]

export const LATEST_VERSION = RELEASES[0].versionName
export const LATEST_VERSION_CODE = RELEASES[0].versionCode

/* ------------------------------------------------------------------ */
/* 渠道与校园                                                          */
/* ------------------------------------------------------------------ */

export const CHANNELS = [
  { id: 'stable', name: '稳定版', description: '面向全校平板推送的正式渠道' },
  { id: 'beta', name: '内测版', description: '教研组与开发机先行验证' },
] as const

export const SCHOOLS = [
  '市第二中学',
  '实验中学',
  '育才中学',
  '第一中学',
  '外国语学校',
]

export const GRADES = ['高一', '高二', '高三']

/** 常见校园平板，型号与 STB 现场设备一致 */
export const DEVICE_MODELS: Array<{ model: string; manufacturer: string; os: string; sdk: number }> = [
  { model: 'MatePad 11', manufacturer: 'HUAWEI', os: 'Android 12', sdk: 31 },
  { model: 'MatePad SE', manufacturer: 'HUAWEI', os: 'Android 12', sdk: 31 },
  { model: 'Mi Pad 6', manufacturer: 'Xiaomi', os: 'Android 13', sdk: 33 },
  { model: 'Mi Pad 5', manufacturer: 'Xiaomi', os: 'Android 12', sdk: 31 },
  { model: 'HONOR Pad 9', manufacturer: 'HONOR', os: 'Android 13', sdk: 33 },
  { model: 'HONOR Pad X8', manufacturer: 'HONOR', os: 'Android 12', sdk: 31 },
  { model: 'Lenovo TB-X606F', manufacturer: 'Lenovo', os: 'Android 10', sdk: 29 },
  { model: 'Lenovo Tab M10', manufacturer: 'Lenovo', os: 'Android 11', sdk: 30 },
  { model: 'SM-X110', manufacturer: 'samsung', os: 'Android 14', sdk: 34 },
  { model: 'OPPO Pad Air', manufacturer: 'OPPO', os: 'Android 13', sdk: 33 },
]
