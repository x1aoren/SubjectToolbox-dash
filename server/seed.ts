import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEVICE_MODELS,
  GRADES,
  LATEST_VERSION,
  LATEST_VERSION_CODE,
  RELEASES,
  SCHOOLS,
  TOOLS,
  TOOL_BY_ID,
} from './catalog.js'
import { DATA_DIR, DEFAULT_SETTINGS, SCHEMA, db, nowIso, tx } from './db.js'
import { hashPassword, issueApiKey } from './auth.js'

/* ------------------------------------------------------------------ */
/* 随机数：固定种子，保证每次重建演示数据形状一致                        */
/* ------------------------------------------------------------------ */

type Rng = () => number

function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(20261115)

function randInt(min: number, max: number, random: Rng = rng): number {
  return min + Math.floor(random() * (max - min + 1))
}

function pick<T>(items: readonly T[], random: Rng = rng): T {
  return items[Math.floor(random() * items.length)]!
}

function weighted<T>(entries: ReadonlyArray<readonly [T, number]>, random: Rng = rng): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let point = random() * total
  for (const [value, weight] of entries) {
    point -= weight
    if (point <= 0) return value
  }
  return entries[entries.length - 1]![0]
}

function randomHex(length: number, random: Rng = rng): string {
  const alphabet = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(random() * 16)]
  return out
}

/* ------------------------------------------------------------------ */
/* 时间：后台以 UTC ISO 存储，展示时统一按 Asia/Shanghai 换算            */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function daysAgoMs(daysAgo: number): number {
  return Date.now() - daysAgo * DAY_MS
}

function atLocalHour(dayStartMs: number, hour: number, minute = 0): number {
  return dayStartMs + hour * 3_600_000 + minute * 60_000
}

/* ------------------------------------------------------------------ */
/* 演示账号                                                            */
/* ------------------------------------------------------------------ */

interface SeedUser {
  username: string
  displayName: string
  email: string
  role: 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer'
  password: string
  color: string
  lastLoginDaysAgo: number
  createdAt: string
}

export const SEED_USERS: SeedUser[] = [
  {
    username: 'admin',
    displayName: '胡城玮',
    email: 'huchengwei@stb.edu.cn',
    role: 'owner',
    password: 'STB-admin-2026',
    color: '#3F6E5A',
    lastLoginDaysAgo: 0,
    createdAt: '2026-10-08T01:20:00.000Z',
  },
  {
    username: 'chenwei',
    displayName: '陈伟',
    email: 'chenwei@stb.edu.cn',
    role: 'admin',
    password: 'STB-admin-2026',
    color: '#34558B',
    lastLoginDaysAgo: 0,
    createdAt: '2026-10-12T02:00:00.000Z',
  },
  {
    username: 'liuyan',
    displayName: '刘妍',
    email: 'liuyan@stb.edu.cn',
    role: 'operator',
    password: 'STB-team-2026',
    color: '#6B4A8F',
    lastLoginDaysAgo: 0,
    createdAt: '2026-10-15T06:40:00.000Z',
  },
  {
    username: 'zhaolei',
    displayName: '赵磊',
    email: 'zhaolei@stb.edu.cn',
    role: 'analyst',
    password: 'STB-team-2026',
    color: '#9A6B1F',
    lastLoginDaysAgo: 1,
    createdAt: '2026-10-20T03:10:00.000Z',
  },
  {
    username: 'wangjing',
    displayName: '王静',
    email: 'wangjing@stb.edu.cn',
    role: 'viewer',
    password: 'STB-team-2026',
    color: '#546E7A',
    lastLoginDaysAgo: 3,
    createdAt: '2026-10-24T07:45:00.000Z',
  },
]

/* ------------------------------------------------------------------ */
/* 反馈语料                                                            */
/* ------------------------------------------------------------------ */

type FeedbackType = 'bug' | 'feature' | 'content' | 'other'
type FeedbackStatus = 'pending' | 'in_progress' | 'resolved' | 'closed'
type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent'

interface FeedbackTemplate {
  type: FeedbackType
  title: string
  body: string
  toolId?: string
  tags: string[]
  priority?: FeedbackPriority
}

const FEEDBACK_TEMPLATES: FeedbackTemplate[] = [
  {
    type: 'bug',
    title: '函数编辑器里 y=1/x 在 x=0 附近画出一条竖线',
    body: '在函数编辑器输入 y=1/x，缩放之后 x=0 的位置会出现一条竖直的线，看起来像是连着左右两支。数学课上老师说这样容易误导，希望断点处能断开。',
    toolId: 'math.function',
    tags: ['函数编辑器', '绘图'],
    priority: 'high',
  },
  {
    type: 'feature',
    title: '希望函数编辑器支持极坐标与参数方程',
    body: '课本里有 r=2sinθ 和 x=cos t, y=sin t 这类图形，现在只能拆成隐式方程近似画。如果能在显式/隐式之外再加「极坐标」和「参数方程」两种模式就太好了。',
    toolId: 'math.function',
    tags: ['函数编辑器', '需求'],
  },
  {
    type: 'content',
    title: '《沁园春·长沙》「层林尽染」的注释想更详细些',
    body: '背诵模式很好用，但注释只有一句。能不能补充一下「层林尽染」的意象分析？我们语文老师让大家写赏析，现有的赏析篇幅偏短。',
    toolId: 'chinese.poetry',
    tags: ['古诗词', '内容校对'],
  },
  {
    type: 'bug',
    title: '电子教材在校园网下一直转圈打不开',
    body: '在教室连校园网打开电子教材，页面一直加载不出来；切到手机热点就能打开。别的同学也遇到过，可能是校园网代理的问题。',
    toolId: 'other.textbook',
    tags: ['电子教材', '网络'],
    priority: 'urgent',
  },
  {
    type: 'feature',
    title: '英语词典能不能加真人发音',
    body: '离线词库很好用，但早读想跟读单词，只有音标没有声音。哪怕内置一小份常用词的离线音频也可以。',
    toolId: 'english.dictionary',
    tags: ['英语词典', '需求'],
  },
  {
    type: 'bug',
    title: '汉语词典查「饕餮」返回空白页',
    body: '输入「饕餮」可以搜到词条，但点进去是空白页，返回再进还是空白。同班的平板都是这样，版本 1.1.0。',
    toolId: 'chinese.dictionary',
    tags: ['汉语词典', '崩溃'],
    priority: 'high',
  },
  {
    type: 'content',
    title: 'Fe3O4 与 CO 反应的配平结果和老师讲的不一样',
    body: '方程式里 Fe3O4 + CO → Fe + CO2，自动配平给的是 1、4、3、4。我们老师写的也是这个，但页面上的生成条件标注成了「高温」，教材里还有「加热」的描述，想确认一下应该以哪个为准。',
    toolId: 'chemistry.equation',
    tags: ['化学方程式', '内容校对'],
  },
  {
    type: 'feature',
    title: '希望支持导出和导入个性化设置',
    body: '换新平板之后，置顶、字号、隐藏的工具全部要重新设置一遍。如果能生成一个配置文件或者二维码，扫一下就能恢复就好了。',
    tags: ['个性化', '需求'],
  },
  {
    type: 'bug',
    title: '字号调到 1.3× 后设置页右侧按钮被裁掉',
    body: '在设置 → 显示管理里把字号切到「特大」，右侧的开关会被屏幕边缘裁掉一半，只能点到一半。横屏竖屏都试过。',
    tags: ['设置', '布局'],
    priority: 'high',
  },
  {
    type: 'other',
    title: '建议增加减数分裂各时期的连续动画',
    body: '现在的细胞分裂图可以切阶段看，但是不能自动播放。希望能加一个「播放」按钮，把前期到末期的染色体变化连续演示出来。',
    toolId: 'biology.diagram',
    tags: ['生物', '需求'],
  },
  {
    type: 'content',
    title: '地球自转示意图的线速度数值与教材不一致',
    body: '示意图里赤道线速度标的是 465 m/s，和课本一致；但 30°N 标的是 403 m/s，我们老师算出来应该是 402 m/s 左右，建议核对一下取整规则。',
    toolId: 'geography.diagram',
    tags: ['地理', '内容校对'],
  },
  {
    type: 'bug',
    title: '更新日志弹窗每次启动都弹出来',
    body: '明明已经点过「知道了」，第二天开机还是会弹。版本是 1.1.0，同寝室两台平板都这样。',
    tags: ['更新提示'],
    priority: 'high',
  },
  {
    type: 'feature',
    title: '古诗词希望增加默写模式和错字本',
    body: '背诵模式点句子显示下一句很好用，但默写的时候还是得用纸。如果能逐句输入、自动比对，并把写错的篇目记下来，就更适合考前复习了。',
    toolId: 'chinese.poetry',
    tags: ['古诗词', '需求'],
  },
  {
    type: 'feature',
    title: '公式大全加一个收藏夹',
    body: '281 条公式里常用的其实就十几条，每次都要按学科翻。希望能收藏，收藏的公式排在最前面。',
    toolId: 'other.formula',
    tags: ['公式大全', '需求'],
  },
  {
    type: 'bug',
    title: '英语词典生词本里点单词会闪退',
    body: '在生词本里点开一个收藏的单词，界面闪一下就退回主页。清缓存后能进一次，退出再进又闪退。设备是 MatePad 11。',
    toolId: 'english.dictionary',
    tags: ['英语词典', '崩溃'],
    priority: 'urgent',
  },
  {
    type: 'other',
    title: '希望能有一个全局搜索直接定位到某一篇古文',
    body: '现在要背哪篇得先记住它在哪一册。如果主页搜索框能直接搜篇名并跳转，会省很多时间。',
    tags: ['搜索', '需求'],
  },
  {
    type: 'content',
    title: '元素周期表里 118 号元素的中文名显示成方框',
    body: '元素周期表最后一个元素 Oganesson，中文名显示为「口口」两个方框，点开详情也是。应该是字体缺少生僻字。',
    toolId: 'chemistry.periodic',
    tags: ['元素周期表', '字体'],
    priority: 'high',
  },
  {
    type: 'bug',
    title: '横竖屏切换后函数编辑器画布变黑',
    body: '正在画函数的时候把平板转成竖屏，画布会变成全黑，只有坐标轴还在。再转回横屏也不恢复，得退出工具重进。',
    toolId: 'math.function',
    tags: ['函数编辑器', '布局'],
    priority: 'high',
  },
  {
    type: 'feature',
    title: '电子教材希望支持缓存已打开的课本',
    body: '教室网络不稳定，每次翻页都要重新加载。如果能缓存最近看过的几页，断网时也能继续看。',
    toolId: 'other.textbook',
    tags: ['电子教材', '需求'],
  },
  {
    type: 'bug',
    title: '部分设备深色模式切换后文字仍是黑色',
    body: '系统是深色，App 里也切到深色，但主页卡片标题还是黑字，几乎看不清。字号是标准档。',
    tags: ['深色模式', '显示'],
    priority: 'high',
  },
  {
    type: 'other',
    title: '学校希望统计各班使用情况，能否提供导出',
    body: '年级组想了解各班使用各学科工具的频率，方便安排教研。后台如果能按班级导出使用次数就帮大忙了。',
    tags: ['统计', '需求'],
  },
  {
    type: 'content',
    title: '语法「虚拟语气」章节有一处例句时态写错',
    body: '专题 32 第 4 个例句：If I were you, I will accept the offer. were 后面应该是 would。麻烦核对一下讲义原文。',
    toolId: 'english.grammar',
    tags: ['语法', '内容校对'],
    priority: 'high',
  },
  {
    type: 'bug',
    title: '化学方程式自动配平点击后没有反应',
    body: '输入 H2 + O2 → H2O，点「自动配平」按钮没反应，也不报错。手动输系数倒是可以。',
    toolId: 'chemistry.equation',
    tags: ['化学方程式', '配平'],
  },
  {
    type: 'feature',
    title: '古诗词按册筛选后希望能记住上次选择',
    body: '每次进古诗词都回到「全部篇目」，我平时只看必修上册，每次都要重新点一遍。',
    toolId: 'chinese.poetry',
    tags: ['古诗词', '需求'],
  },
  {
    type: 'other',
    title: '建议增加物理学科和力学公式专题',
    body: '现在公式大全里数理化都有，但物理公式混在「通用」里。希望能单独成科，再加一个受力分析的专题。',
    toolId: 'other.formula',
    tags: ['物理', '需求'],
  },
  {
    type: 'bug',
    title: '首次启动复制词库很慢，等了二十多秒',
    body: '新平板第一次打开 App，转圈了二十多秒才进主页，差点以为卡死了。建议加一个进度提示。',
    tags: ['性能', '首启'],
    priority: 'high',
  },
  {
    type: 'feature',
    title: '希望工具卡片可以长按拖拽排序',
    body: '置顶功能已经有了，但只能置顶，不能调整学科内工具的顺序。想把自己常用的排前面。',
    tags: ['主页', '需求'],
  },
  {
    type: 'content',
    title: '英语词典「look forward to」没有例句',
    body: '查到短语了，但释义只有一句中文，也没有例句和搭配。查其他单词都有例句的。',
    toolId: 'english.dictionary',
    tags: ['英语词典', '内容'],
  },
  {
    type: 'bug',
    title: '搜索框输入拼音时输入法候选框被键盘挡住',
    body: '汉语词典里用拼音搜词，候选框浮在键盘上方但被遮住一半，选词很困难。设备是联想 Tab M10。',
    toolId: 'chinese.dictionary',
    tags: ['汉语词典', '输入法'],
  },
  {
    type: 'other',
    title: '反馈入口藏得太深，建议放到设置首屏',
    body: '想提意见得先点设置、再滑到最下面找「关于」，很容易错过。可以像更新日志一样放到设置第一屏。',
    tags: ['反馈', '需求'],
  },
  {
    type: 'feature',
    title: '汉语词典希望支持手写查字',
    body: '遇到不会读的字，拼音输入用不了。如果能手写识别或者按部首查字会方便很多。',
    toolId: 'chinese.dictionary',
    tags: ['汉语词典', '需求'],
  },
  {
    type: 'bug',
    title: '元素周期表点按后详情弹窗偶尔不显示',
    body: '连续快速点了几个元素之后，详情卡片就不弹了，得等几秒再点才行。',
    toolId: 'chemistry.periodic',
    tags: ['元素周期表', '交互'],
  },
  {
    type: 'content',
    title: '公式大全里「向心加速度」的适用条件描述不准确',
    body: '公式写的是 a = v²/r，条件写「匀速圆周运动」。其实变速圆周运动时法向加速度也能用这个式子，建议区分法向和切向。',
    toolId: 'other.formula',
    tags: ['公式大全', '内容校对'],
  },
  {
    type: 'feature',
    title: '希望生物示意图支持缩放和标注导出',
    body: '上课想截取细胞分裂某一期做课件，现在只能整页截图。如果能把当前阶段导出成图片就方便了。',
    toolId: 'biology.diagram',
    tags: ['生物', '需求'],
  },
  {
    type: 'bug',
    title: '更新日志里 1.1.0 的条目在平板上显示不全',
    body: '更新日志页里「函数编辑器整体翻新」那条太长，最后几个字被截断了，看不到完整内容。',
    tags: ['更新日志', '布局'],
  },
  {
    type: 'other',
    title: '希望增加一个「最近使用」的记录周期设置',
    body: '现在是默认关闭的，打开之后会一直记着。如果能设置只保留最近一周，会更符合教室公用平板的场景。',
    tags: ['个性化', '需求'],
  },
]

const STAFF_REPLIES: Record<FeedbackStatus, string[]> = {
  pending: [],
  in_progress: [
    '收到，已经复现了这个问题，正在排查原因，有结论会在这里回复你。',
    '感谢反馈，我们已经在内部登记并安排处理，请留意后续版本更新。',
    '已定位到大概的范围，正在修复中，预计下个版本带上，先谢谢你的耐心。',
  ],
  resolved: [
    '这个问题已经在 1.1.0 的后续补丁里修复，更新到最新版本后即可正常使用，感谢反馈。',
    '已修复并随新版本发布，麻烦更新后再试一下；如果还有问题，直接在这里回复即可。',
    '确认是旧版本的渲染缺陷，新版已改为分段解析，历史记录也一并清理了，感谢你的细致反馈。',
  ],
  closed: [
    '该反馈已合并到同类的改进项中统一处理，这里先关闭，后续进展会在公告里同步。',
    '按内容团队的校对结论，原文表述无误，这次先按「无需修改」关闭；如果还发现其他问题欢迎继续反馈。',
  ],
}

const INTERNAL_NOTES = [
  '已复现：校园网出口对 webview 的 https 证书做了替换，需要客户端放行我们自己的 CA。',
  '和数据组确认过，指标口径按「同一设备 30 分钟内算一次会话」，不是按打开次数。',
  '和教研组对过，教材版本按统编版 2025 年印刷本为准。',
  '这个问题和 #1203 是同一个根因，等下一版一起发。',
  '联系了设备管理员，两台平板系统时间不准，先让学校统一校时。',
  '文案已经给语文组老师看过，等她们回意见再改。',
  '建议排到 1.2.0，优先级不高，先记录。',
]

/* ------------------------------------------------------------------ */
/* 远程配置                                                            */
/* ------------------------------------------------------------------ */

function buildConfig(options: { includeDraftExtras: boolean }) {
  const toolEntries = TOOLS.map((tool) => ({
    toolId: tool.id,
    enabled: true,
    minVersion: '1.0.0',
    channels: ['stable', 'beta'],
    message:
      tool.id === 'other.textbook'
        ? '需要连接网络访问人教社官网'
        : tool.id === 'geography.diagram'
          ? '底图待校方确认合规来源，目前仅提供示意图'
          : '',
  }))

  const announcements = [
    {
      id: 'ann-001',
      title: '1.1.0 已发布：函数编辑器与汉语词典更新',
      body: '新版带来汉语词典（70,113 条）、函数定义域、较小字号与更新日志。请在「设置 → 关于」查看完整说明，建议在 Wi-Fi 环境下更新。',
      level: 'info',
      channels: ['stable', 'beta'],
      enabled: true,
      pinned: true,
      startAt: '2026-11-14T00:00:00.000Z',
      endAt: '2026-12-15T00:00:00.000Z',
    },
    {
      id: 'ann-002',
      title: '电子教材需先完成校园网认证',
      body: '近期部分教室反馈电子教材打不开。请先打开浏览器完成校园网统一认证，再回到 App 内使用电子教材。',
      level: 'warning',
      channels: ['stable'],
      enabled: true,
      pinned: false,
      startAt: '2026-11-01T00:00:00.000Z',
      endAt: '2027-01-31T00:00:00.000Z',
    },
  ]

  if (options.includeDraftExtras) {
    announcements.push({
      id: 'ann-004',
      title: '期中考试期间答疑与技术支持安排',
      body: '11 月 20 日至 11 月 30 日，信息技术组每天 16:30–18:00 在综合楼三层值班，也可继续通过 App 内「意见反馈」提交问题。',
      level: 'info',
      channels: ['stable', 'beta'],
      enabled: true,
      pinned: false,
      startAt: '2026-11-20T00:00:00.000Z',
      endAt: '2026-11-30T16:00:00.000Z',
    })
  }

  const textbook = toolEntries.find((entry) => entry.toolId === 'other.textbook')
  if (options.includeDraftExtras && textbook) {
    textbook.message = '需连接校园网并完成统一认证后访问人教社官网'
  }

  return {
    maintenance: {
      enabled: false,
      message: '',
      startAt: null as string | null,
      endAt: null as string | null,
    },
    release: {
      latestVersion: LATEST_VERSION,
      latestVersionCode: LATEST_VERSION_CODE,
      minSupportedVersion: '1.0.0',
      forceUpdate: false,
      updateNotes: `${RELEASES[0]!.headline}：新增汉语词典 70,113 条、函数定义域与 0.85× 字号；函数编辑器整体翻新。`,
    },
    content: {
      version: '2026.11.14',
      rollout: 100,
      notes: '随 1.1.0 发布：汉语词典词库、语法 49 篇校对、方程式扩充至 508 条、公式扩充至 281 条。',
    },
    tools: toolEntries,
    announcements,
    features: [
      { key: 'telemetry.enabled', enabled: true, description: '客户端匿名遥测上报总开关' },
      { key: 'feedback.enabled', enabled: true, description: '意见反馈入口与提交接口' },
      { key: 'textbook.online', enabled: true, description: '电子教材联网访问人教社官网' },
      { key: 'home.recents.default', enabled: false, description: '新设备是否默认开启「最近使用」' },
      { key: 'update.notice.enabled', enabled: true, description: '版本升级提示弹窗' },
      { key: 'content.hotfix', enabled: false, description: '内容热修通道（实验）' },
    ],
  }
}

/* ------------------------------------------------------------------ */
/* 生成器                                                              */
/* ------------------------------------------------------------------ */

interface SeedDevice {
  id: string
  model: string
  manufacturer: string
  os: string
  sdk: number
  version: string
  versionCode: number
  channel: string
  school: string
  grade: string
  firstSeen: number
  lastSeen: number
  sessions: number
  opens: number
  /** 模拟流失：这台设备在这之后不再活跃 */
  churnedAt: number | null
}

const HOUR_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [7, 3],
  [8, 6],
  [9, 8],
  [10, 8],
  [11, 7],
  [12, 4],
  [14, 6],
  [15, 8],
  [16, 8],
  [17, 7],
  [18, 5],
  [19, 7],
  [20, 8],
  [21, 5],
  [22, 2],
]

const TOOL_WEIGHTS = TOOLS.map((tool) => [tool.id, tool.weight] as const)

function versionAt(device: SeedDevice, atMs: number): { version: string; code: number } {
  if (atMs >= Date.parse('2026-11-14T00:00:00.000Z')) {
    return { version: device.version, code: device.versionCode }
  }
  if (atMs >= Date.parse('2026-11-08T00:00:00.000Z')) {
    return { version: '1.0.0', code: 1 }
  }
  // 公开版发布前是内测渠道，1.0.0 之前的构建统一记为 0.9.9
  return { version: '0.9.9', code: 0 }
}

export function seedDatabase(options: { reset: boolean }): {
  devices: number
  events: number
  feedback: number
  errors: number
  credentials: string
} {
  if (options.reset) {
    const database = db()
    database.exec('PRAGMA foreign_keys = OFF;')
    for (const table of [
      'sessions',
      'feedback_messages',
      'feedback',
      'attachments',
      'device_tools',
      'client_tools',
      'device_tool_overrides',
      'errors',
      'events',
      'devices',
      'config_revisions',
      'config_state',
      'audit_logs',
      'api_keys',
      'users',
      'settings',
    ]) {
      database.exec(`DELETE FROM ${table};`)
    }
    database.exec("DELETE FROM sqlite_sequence;")
    database.exec('PRAGMA foreign_keys = ON;')
  } else {
    db().exec(SCHEMA)
  }

  const database = db()
  const now = Date.now()
  const startedAt = now

  tx(() => {
    /* ----------------------------- 设置 ----------------------------- */
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      database.prepare('INSERT INTO settings(key, value) VALUES(?,?)').run(key, value)
    }
    database
      .prepare('UPDATE settings SET value = ? WHERE key = ?')
      .run(new Date(now).toISOString(), 'demo_seeded_at')

    /* ----------------------------- 账号 ----------------------------- */
    const userIds = new Map<string, string>()
    const insertUser = database.prepare(
      `INSERT INTO users(id, username, display_name, email, role, password_hash, status,
        avatar_color, created_at, last_login_at, must_change_password)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    for (const account of SEED_USERS) {
      const id = `usr_${randomHex(10)}`
      userIds.set(account.username, id)
      insertUser.run(
        id,
        account.username,
        account.displayName,
        account.email,
        account.role,
        hashPassword(account.password),
        'active',
        account.color,
        account.createdAt,
        iso(daysAgoMs(account.lastLoginDaysAgo)),
        0,
      )
    }
    const ownerId = userIds.get('admin')!
    const chenweiId = userIds.get('chenwei')!
    const liuyanId = userIds.get('liuyan')!

    /* ---------------------------- 接入密钥 --------------------------- */
    const { secret: demoKey } = issueApiKey('STB 安卓客户端 · 演示密钥', ownerId)
    const credentials = [
      `SubjectToolbox 控制台演示账号（生成于 ${new Date(now).toLocaleString('zh-CN')}）`,
      '',
      '角色        用户名      密码',
      '超级管理员  admin       STB-admin-2026',
      '管理员      chenwei     STB-admin-2026',
      '运营专员    liuyan      STB-team-2026',
      '数据分析师  zhaolei     STB-team-2026',
      '只读成员    wangjing    STB-team-2026',
      '',
      `客户端上报密钥：${demoKey}`,
      '（请求头 X-STB-Key，可在 设置 → 接入密钥 中吊销或轮换）',
    ].join('\n')
    writeFileSync(resolve(DATA_DIR, 'seed-credentials.txt'), credentials, 'utf8')

    /* ----------------------------- 设备 ----------------------------- */
    const deviceCount = 320
    const devices: SeedDevice[] = []
    const insertDevice = database.prepare(
      `INSERT INTO devices(sn, model, manufacturer, os_version, sdk_int, app_version,
        version_code, channel, school, grade, first_seen_at, last_seen_at, total_sessions, total_opens)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )

    for (let i = 0; i < deviceCount; i += 1) {
      const hardware = pick(DEVICE_MODELS)
      const isBeta = rng() < 0.07
      const isOldStable = !isBeta && rng() < 0.26
      const version = isBeta || !isOldStable ? LATEST_VERSION : '1.0.0'
      const versionCode = version === LATEST_VERSION ? LATEST_VERSION_CODE : 1
      const firstSeenDaysAgo =
        i < 270 ? randInt(40, 59) : i < 300 ? randInt(15, 39) : randInt(0, 14)
      const firstSeen = Math.min(
        now - 3_600_000,
        daysAgoMs(firstSeenDaysAgo) + randInt(7, 21) * 3_600_000,
      )

      const device: SeedDevice = {
        id: `SN-${randomHex(12).toUpperCase()}`,
        model: hardware.model,
        manufacturer: hardware.manufacturer,
        os: hardware.os,
        sdk: hardware.sdk,
        version,
        versionCode,
        channel: isBeta ? 'beta' : 'stable',
        school: pick(SCHOOLS),
        grade: pick(GRADES),
        firstSeen,
        lastSeen: firstSeen,
        sessions: 0,
        opens: 0,
        churnedAt:
          firstSeenDaysAgo >= 6 && rng() < 0.1
            ? now - randInt(1, Math.max(2, firstSeenDaysAgo - 4)) * DAY_MS
            : null,
      }
      devices.push(device)
    }

    /* ----------------------------- 遥测 ----------------------------- */
    const insertEvent = database.prepare(
      `INSERT INTO events(sn, name, tool_id, subject_id, app_version, channel, props, occurred_at, received_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    const insertError = database.prepare(
      `INSERT INTO errors(sn, signature, message, stack, tool_id, app_version, channel,
        occurred_at, resolved, resolved_at, resolved_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )

    let eventCount = 0
    let sessionSeq = 0

    const pushEvent = (
      device: SeedDevice,
      atMs: number,
      name: string,
      extra: { toolId?: string; props?: Record<string, unknown>; version?: string } = {},
    ) => {
      const version = extra.version ?? versionAt(device, atMs).version
      insertEvent.run(
        device.id,
        name,
        extra.toolId ?? null,
        extra.toolId ? TOOL_BY_ID.get(extra.toolId)?.subjectId ?? null : null,
        version,
        device.channel,
        JSON.stringify(extra.props ?? {}),
        iso(atMs),
        iso(Math.min(now, atMs + randInt(200, 4000))),
      )
      eventCount += 1
    }

    for (let daysAgo = 59; daysAgo >= 0; daysAgo -= 1) {
      const dayStart = now - daysAgo * DAY_MS - ((now + SHANGHAI_OFFSET) % DAY_MS)
      const weekday = new Date(dayStart + SHANGHAI_OFFSET).getUTCDay()
      const isWeekend = weekday === 0 || weekday === 6
      const baseProbability = isWeekend ? 0.16 : 0.56
      const activeProbability = baseProbability

      for (const device of devices) {
        if (dayStart + DAY_MS < device.firstSeen) continue
        if (device.churnedAt !== null && dayStart > device.churnedAt) continue
        if (rng() > activeProbability) continue

        const sessionCount = 1 + (rng() < 0.32 ? 1 : 0) + (rng() < 0.08 ? 1 : 0)
        for (let s = 0; s < sessionCount; s += 1) {
          sessionSeq += 1
          const hour = weighted(HOUR_WEIGHTS)
          const startMs = atLocalHour(dayStart, hour, randInt(0, 55))
          if (startMs > now) continue

          const sessionId = `s_${sessionSeq.toString(36)}`
          const version = versionAt(device, startMs).version
          pushEvent(device, startMs, 'session_start', {
            version,
            props: { sessionId, appearance: rng() < 0.62 ? 'light' : 'dark' },
          })

          const opens = randInt(3, 7)
          let cursor = startMs + randInt(5_000, 40_000)
          const toolsInSession = new Set<string>()
          for (let o = 0; o < opens; o += 1) {
            const toolId = weighted(TOOL_WEIGHTS)
            const openMs = Math.min(now - 1000, cursor)
            pushEvent(device, openMs, 'tool_open', {
              toolId,
              version,
              props: { sessionId, source: toolsInSession.size === 0 ? 'home' : 'tool_switch' },
            })
            toolsInSession.add(toolId)
            device.opens += 1

            const dwellMs = randInt(25_000, 420_000)
            const closeMs = Math.min(now - 500, openMs + dwellMs)
            if (rng() < 0.72) {
              pushEvent(device, closeMs, 'tool_close', {
                toolId,
                version,
                props: { sessionId, durationMs: dwellMs },
              })
            }
            if (rng() < 0.22) {
              pushEvent(device, Math.min(now - 400, openMs + randInt(4_000, 18_000)), 'search', {
                toolId,
                version,
                props: {
                  sessionId,
                  queryLength: randInt(1, 8),
                  resultCount: randInt(0, 40),
                },
              })
            }
            cursor = closeMs + randInt(3_000, 20_000)
          }

          const endMs = Math.min(now - 200, cursor + randInt(5_000, 30_000))
          pushEvent(device, endMs, 'session_end', {
            version,
            props: { sessionId, durationMs: endMs - startMs, opens },
          })
          device.sessions += 1
          if (endMs > device.lastSeen) device.lastSeen = endMs
        }
      }
    }

    /* ---------------------------- 崩溃记录 --------------------------- */
    interface ErrorSignature {
      signature: string
      message: string
      stack: string
      toolId?: string
      weight: number
      resolved: boolean
    }

    const signatures: ErrorSignature[] = [
      {
        signature: 'android.webkit.WebViewClient.onReceivedError: ERR_CONNECTION_TIMED_OUT',
        message: 'net::ERR_CONNECTION_TIMED_OUT (人教社电子教材)',
        stack: [
          'android.webkit.WebViewClient.onReceivedError(WebViewClient.java:1612)',
          'android.webkit.WebView$PrivateWebViewClient.onReceivedError(WebView.java:1003)',
          'cn.stb.feature.textbook.TextbookScreenKt$TextbookWebView$1$2.invoke(TextbookScreen.kt:186)',
          'androidx.compose.runtime.snapshots.SnapshotStateObserver.observeReads(SnapshotStateObserver.kt:232)',
        ].join('\n'),
        toolId: 'other.textbook',
        weight: 34,
        resolved: false,
      },
      {
        signature: 'java.lang.OutOfMemoryError: Failed to allocate a 16777232 byte allocation',
        message: 'Unable to allocate 16MB for dictionary cursor window',
        stack: [
          'java.lang.OutOfMemoryError: Failed to allocate a 16777232 byte allocation',
          'android.database.CursorWindow.nativeAlloc(CursorWindow.java:412)',
          'cn.stb.core.data.DictRepository.searchPrefix(DictRepository.kt:118)',
          'cn.stb.feature.dictionary.DictionaryViewModel$search$2.invokeSuspend(DictionaryViewModel.kt:74)',
          'kotlinx.coroutines.DispatchedTask.run(DispatchedTask.kt:108)',
        ].join('\n'),
        toolId: 'english.dictionary',
        weight: 19,
        resolved: true,
      },
      {
        signature: 'java.lang.NullPointerException: currentHandleCenter() must not be null',
        message: 'Attempt to invoke virtual method on a null object reference',
        stack: [
          'java.lang.NullPointerException',
          'cn.stb.feature.math.MathCanvasKt.drawMathCaretHandle(MathCanvas.kt:412)',
          'cn.stb.feature.math.MathScreenKt$MathCanvas$1.invoke(MathScreen.kt:297)',
          'androidx.compose.ui.graphics.drawscope.CanvasDrawScope.draw(CanvasDrawScope.kt:223)',
        ].join('\n'),
        toolId: 'math.function',
        weight: 16,
        resolved: true,
      },
      {
        signature: 'android.database.sqlite.SQLiteException: disk I/O error (code 4874)',
        message: 'disk I/O error while opening zhdict.db',
        stack: [
          'android.database.sqlite.SQLiteException: disk I/O error (code 4874 SQLITE_IOERR)',
          'android.database.sqlite.SQLiteConnection.nativeOpen(SQLiteConnection.java:266)',
          'cn.stb.core.data.ZhDictRepository.open(ZhDictRepository.kt:61)',
          'cn.stb.feature.zhdict.ChineseDictionaryViewModel.<init>(ChineseDictionaryViewModel.kt:38)',
        ].join('\n'),
        toolId: 'chinese.dictionary',
        weight: 11,
        resolved: false,
      },
      {
        signature: 'java.lang.IndexOutOfBoundsException: Index 118 out of bounds for length 118',
        message: 'Index 118 out of bounds for length 118',
        stack: [
          'java.lang.IndexOutOfBoundsException: Index 118 out of bounds for length 118',
          'cn.stb.feature.periodic.PeriodicTableKt.elementDetail(PeriodicTable.kt:208)',
          'cn.stb.feature.periodic.PeriodicTableScreenKt$ElementCard$2.invoke(PeriodicTableScreen.kt:174)',
        ].join('\n'),
        toolId: 'chemistry.periodic',
        weight: 9,
        resolved: false,
      },
      {
        signature: 'java.lang.IllegalStateException: LayoutNode should be attached to an owner',
        message: 'LayoutNode should be attached to an owner',
        stack: [
          'java.lang.IllegalStateException: LayoutNode should be attached to an owner',
          'androidx.compose.ui.node.LayoutNode.requireOwner(LayoutNode.kt:1102)',
          'androidx.compose.ui.node.LayoutNode.onMeasure(LayoutNode.kt:1177)',
          'androidx.compose.ui.platform.AndroidComposeView.measureAndLayout(AndroidComposeView.kt:441)',
        ].join('\n'),
        weight: 7,
        resolved: false,
      },
      {
        signature: 'java.lang.ArithmeticException: / by zero',
        message: 'Division by zero while balancing equation',
        stack: [
          'java.lang.ArithmeticException: / by zero',
          'cn.stb.feature.chemistry.Balancer.gaussSolve(Balancer.kt:96)',
          'cn.stb.feature.chemistry.ChemistryViewModel.balance(ChemistryViewModel.kt:122)',
        ].join('\n'),
        toolId: 'chemistry.equation',
        weight: 6,
        resolved: true,
      },
      {
        signature: 'androidx.compose.runtime.snapshots.SnapshotApplyConflictException',
        message: 'Snapshot apply conflict while switching font scale',
        stack: [
          'androidx.compose.runtime.snapshots.SnapshotApplyConflictException',
          'androidx.compose.runtime.snapshots.Snapshot.apply(Snapshot.kt:218)',
          'cn.stb.core.designsystem.ThemeKt$StbTheme$1.invoke(Theme.kt:118)',
        ].join('\n'),
        weight: 4,
        resolved: true,
      },
    ]

    const errorSignaturesWeighted = signatures.map((entry) => [entry, entry.weight] as const)
    const errorTotal = 320
    let errorCount = 0
    const insertErrorEvent = insertEvent
    for (let i = 0; i < errorTotal; i += 1) {
      const signature = weighted(errorSignaturesWeighted)
      const daysAgo = Math.floor(Math.pow(rng(), 1.5) * 59)
      const atMs = daysAgoMs(daysAgo) - randInt(0, 20) * 3_600_000
      const candidates = devices.filter((device) => device.firstSeen <= atMs)
      if (candidates.length === 0) continue
      const device = pick(candidates)
      const version = versionAt(device, atMs).version
      const resolved = signature.resolved || rng() < 0.18
      insertError.run(
        device.id,
        signature.signature,
        signature.message,
        signature.stack,
        signature.toolId ?? null,
        version,
        device.channel,
        iso(atMs),
        resolved ? 1 : 0,
        resolved ? iso(atMs + randInt(2, 72) * 3_600_000) : null,
        resolved ? (rng() < 0.5 ? '陈伟' : '胡城玮') : null,
      )
      insertErrorEvent.run(
        device.id,
        'error',
        signature.toolId ?? null,
        signature.toolId ? TOOL_BY_ID.get(signature.toolId)?.subjectId ?? null : null,
        version,
        device.channel,
        JSON.stringify({ signature: signature.signature }),
        iso(atMs),
        iso(atMs + 800),
      )
      eventCount += 1
      errorCount += 1
    }

    /* ---------------------------- 写回设备 --------------------------- */
    for (const device of devices) {
      insertDevice.run(
        device.id,
        device.model,
        device.manufacturer,
        device.os,
        device.sdk,
        device.version,
        device.versionCode,
        device.channel,
        device.school,
        device.grade,
        iso(device.firstSeen),
        iso(device.lastSeen),
        device.sessions,
        device.opens,
      )
    }


    /* ----------------------- 工具清单同步 / 单设备开关 ----------------------- */
    const insertClientTool = database.prepare(
      `INSERT INTO client_tools(tool_id, title, subject_id, first_reported_at, last_reported_at, last_sn, report_count)
       VALUES(?,?,?,?,?,?,?)`,
    )
    const insertDeviceTool = database.prepare(
      `INSERT INTO device_tools(sn, tool_id, title, subject_id, last_reported_at)
       VALUES(?,?,?,?,?)`,
    )
    for (const device of devices) {
      for (const tool of TOOLS) {
        insertDeviceTool.run(device.id, tool.id, tool.title, tool.subjectId, iso(device.lastSeen))
      }
    }
    for (const tool of TOOLS) {
      const lastSeen = devices.reduce(
        (latest, device) => (device.lastSeen > latest ? device.lastSeen : latest),
        now - 47 * 3_600_000,
      )
      insertClientTool.run(
        tool.id,
        tool.title,
        tool.subjectId,
        iso(daysAgoMs(59)),
        iso(lastSeen),
        devices[0]?.id ?? null,
        devices.length * randInt(2, 6),
      )
    }

    const overrideSeeds = [
      {
        index: 3,
        toolId: 'other.textbook',
        enabled: false,
        note: '该教室网络改造期间先单独关闭，避免学生反复等待',
      },
      {
        index: 17,
        toolId: 'geography.diagram',
        enabled: false,
        note: '任课老师申请暂时隐藏地理示意图',
      },
      {
        index: 41,
        toolId: 'chemistry.equation',
        enabled: false,
        note: '化学竞赛班临时停用，考试后再恢复',
      },
    ]
    const insertOverride = database.prepare(
      `INSERT INTO device_tool_overrides(sn, tool_id, enabled, note, updated_by, updated_by_name, updated_at)
       VALUES(?,?,?,?,?,?,?)`,
    )
    for (const seed of overrideSeeds) {
      const device = devices[seed.index]
      if (!device) continue
      insertOverride.run(
        device.id,
        seed.toolId,
        seed.enabled ? 1 : 0,
        seed.note,
        liuyanId,
        '刘妍',
        iso(daysAgoMs(randInt(1, 4))),
      )
    }
    /* ---------------------------- 意见反馈 --------------------------- */
    const feedbackPool: Array<{
      id: string
      device: SeedDevice
      template: FeedbackTemplate
      createdAt: number
      status: FeedbackStatus
      priority: FeedbackPriority
      assignee: string | null
      contact: string | null
    }> = []

    const totalFeedback = 58
    const statusWeights: ReadonlyArray<readonly [FeedbackStatus, number]> = [
      ['pending', 16],
      ['in_progress', 14],
      ['resolved', 14],
      ['closed', 8],
    ]
    const priorityWeights: ReadonlyArray<readonly [FeedbackPriority, number]> = [
      ['low', 8],
      ['normal', 30],
      ['high', 12],
      ['urgent', 4],
    ]

    for (let i = 0; i < totalFeedback; i += 1) {
      const template = FEEDBACK_TEMPLATES[i % FEEDBACK_TEMPLATES.length]!
      const daysAgo = Math.floor(Math.pow(rng(), 1.4) * 59)
      const createdAt = daysAgoMs(daysAgo) - randInt(0, 18) * 3_600_000
      const eligible = devices.filter((device) => device.firstSeen <= createdAt)
      const device = pick(eligible.length > 0 ? eligible : devices)
      const status = weighted(statusWeights)
      const priority = template.priority ?? weighted(priorityWeights)
      const assignee =
        status === 'pending'
          ? rng() < 0.25
            ? liuyanId
            : null
          : rng() < 0.5
            ? liuyanId
            : chenweiId
      const contact =
        rng() < 0.18
          ? pick([
              `QQ ${randInt(10_000_000, 99_999_999)}`,
              `stu${randomHex(4)}@school.edu.cn`,
              `138****${randInt(1000, 9999)}`,
            ])
          : null

      feedbackPool.push({
        id: `fb_${randomHex(12)}`,
        device,
        template,
        createdAt,
        status,
        priority,
        assignee,
        contact,
      })
    }

    feedbackPool.sort((a, b) => b.createdAt - a.createdAt)

    const insertFeedback = database.prepare(
      `INSERT INTO feedback(id, sn, type, title, content, contact, tool_id, app_version,
        channel, status, priority, assignee_id, tags, created_at, updated_at, last_reply_at, closed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    const insertMessage = database.prepare(
      `INSERT INTO feedback_messages(feedback_id, author_type, author_id, author_name, body, internal, created_at)
       VALUES(?,?,?,?,?,?,?)`,
    )
    const auditRows: Array<{
      actorName: string
      action: string
      targetType: string
      targetId: string
      targetLabel: string
      detail: string
      at: number
    }> = []

    for (const item of feedbackPool) {
      const version = item.device.version
      insertFeedback.run(
        item.id,
        item.device.id,
        item.template.type,
        item.template.title,
        item.template.body,
        item.contact,
        item.template.toolId ?? null,
        version,
        item.device.channel,
        item.status,
        item.priority,
        item.assignee,
        JSON.stringify(item.template.tags),
        iso(item.createdAt),
        iso(item.createdAt),
        null,
        null,
      )
      insertMessage.run(
        item.id,
        'user',
        null,
        item.contact ?? `${item.device.grade} · 平板用户`,
        item.template.body,
        0,
        iso(item.createdAt),
      )

      let lastReply = item.createdAt
      let updated = item.createdAt

      if (item.status === 'in_progress' || item.status === 'resolved' || item.status === 'closed') {
        const staffReplyAt = Math.min(now - 60_000, item.createdAt + randInt(2, 40) * 3_600_000)
        const staffName = item.assignee === chenweiId ? '陈伟' : '刘妍'
        const replyBody = pick(STAFF_REPLIES[item.status])
        insertMessage.run(item.id, 'staff', item.assignee, staffName, replyBody, 0, iso(staffReplyAt))
        lastReply = staffReplyAt
        updated = staffReplyAt
        auditRows.push({
          actorName: staffName,
          action: 'feedback.reply',
          targetType: 'feedback',
          targetId: item.id,
          targetLabel: item.template.title,
          detail: '回复了用户反馈',
          at: staffReplyAt,
        })
      }

      if (rng() < 0.34) {
        const noteAt = Math.min(now - 30_000, item.createdAt + randInt(1, 30) * 3_600_000)
        insertMessage.run(
          item.id,
          'staff',
          chenweiId,
          '陈伟',
          pick(INTERNAL_NOTES),
          1,
          iso(noteAt),
        )
        updated = Math.max(updated, noteAt)
      }

      if (item.status === 'resolved' || item.status === 'closed') {
        const closeAt = Math.min(now - 20_000, lastReply + randInt(1, 24) * 3_600_000)
        insertMessage.run(
          item.id,
          'system',
          null,
          '系统',
          item.status === 'resolved' ? '该反馈已标记为已解决' : '该反馈已关闭',
          0,
          iso(closeAt),
        )
        database
          .prepare('UPDATE feedback SET updated_at = ?, last_reply_at = ?, closed_at = ? WHERE id = ?')
          .run(iso(closeAt), iso(lastReply), iso(closeAt), item.id)
        auditRows.push({
          actorName: '系统',
          action: item.status === 'resolved' ? 'feedback.resolve' : 'feedback.close',
          targetType: 'feedback',
          targetId: item.id,
          targetLabel: item.template.title,
          detail: item.status === 'resolved' ? '把反馈标记为已解决' : '关闭了反馈',
          at: closeAt,
        })
      } else {
        database
          .prepare('UPDATE feedback SET updated_at = ?, last_reply_at = ? WHERE id = ?')
          .run(iso(updated), lastReply > item.createdAt ? iso(lastReply) : null, item.id)
      }
    }

    /* --------------------------- 远程配置 ---------------------------- */
    const currentConfig = buildConfig({ includeDraftExtras: false })
    const draftConfig = buildConfig({ includeDraftExtras: true })
    const insertRevision = database.prepare(
      `INSERT INTO config_revisions(version_no, json, summary, published_by, published_by_name, published_at)
       VALUES(?,?,?,?,?,?)`,
    )

    const revisionSeeds = [
      {
        version: 1,
        at: '2026-10-16T02:30:00.000Z',
        summary: '初始化远程配置：工具开关与版本策略',
        by: ownerId,
        name: '胡城玮',
        json: buildConfig({ includeDraftExtras: false }),
      },
      {
        version: 2,
        at: '2026-11-08T03:10:00.000Z',
        summary: '1.0.0 发布：开放全部工具，下发首个公告',
        by: ownerId,
        name: '胡城玮',
        json: buildConfig({ includeDraftExtras: false }),
      },
      {
        version: 3,
        at: '2026-11-14T01:20:00.000Z',
        summary: '1.1.0 发布：最低支持版本保持 1.0.0，更新说明同步',
        by: chenweiId,
        name: '陈伟',
        json: currentConfig,
      },
    ]

    for (const revision of revisionSeeds) {
      insertRevision.run(
        revision.version,
        JSON.stringify(revision.json, null, 2),
        revision.summary,
        revision.by,
        revision.name,
        revision.at,
      )
      auditRows.push({
        actorName: revision.name,
        action: 'config.publish',
        targetType: 'config',
        targetId: String(revision.version),
        targetLabel: `修订 #${revision.version}`,
        detail: revision.summary,
        at: new Date(revision.at).getTime(),
      })
    }

    const activeRevision = database
      .prepare('SELECT id FROM config_revisions WHERE version_no = 3')
      .get() as { id: number }

    database
      .prepare(
        `INSERT INTO config_state(id, draft_json, active_revision_id, updated_at, updated_by, updated_by_name)
         VALUES(1, ?, ?, ?, ?, ?)`,
      )
      .run(JSON.stringify(draftConfig, null, 2), activeRevision.id, iso(now), liuyanId, '刘妍')

    /* ---------------------------- 审计日志 --------------------------- */
    const insertAudit = database.prepare(
      `INSERT INTO audit_logs(actor_id, actor_name, action, target_type, target_id, target_label, detail, ip, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    )

    // 登录记录
    for (const account of SEED_USERS) {
      for (let i = 0; i < 6; i += 1) {
        const at = daysAgoMs(randInt(0, 14)) - randInt(0, 9) * 3_600_000
        auditRows.push({
          actorName: account.displayName,
          action: 'auth.login',
          targetType: 'session',
          targetId: '',
          targetLabel: '',
          detail: '登录控制台',
          at,
        })
      }
    }

    // 账号与密钥操作
    for (const account of SEED_USERS.slice(1)) {
      auditRows.push({
        actorName: '胡城玮',
        action: 'user.create',
        targetType: 'user',
        targetId: userIds.get(account.username)!,
        targetLabel: account.displayName,
        detail: `创建账号并授予「${account.role}」角色`,
        at: new Date(account.createdAt).getTime(),
      })
    }
    auditRows.push({
      actorName: '胡城玮',
      action: 'key.create',
      targetType: 'api_key',
      targetId: '',
      targetLabel: 'STB 安卓客户端 · 演示密钥',
      detail: '创建客户端上报密钥',
      at: new Date('2026-10-16T02:05:00.000Z').getTime(),
    })
    auditRows.push({
      actorName: '陈伟',
      action: 'settings.update',
      targetType: 'settings',
      targetId: 'retention_days',
      targetLabel: '数据留存 180 天',
      detail: '把遥测留存周期从 90 天调整为 180 天',
      at: daysAgoMs(4),
    })
    auditRows.push({
      actorName: '赵磊',
      action: 'telemetry.export',
      targetType: 'devices',
      targetId: '',
      targetLabel: '设备清单 CSV',
      detail: '导出 320 台设备的使用数据用于年级组教研',
      at: daysAgoMs(2),
    })

    for (const row of auditRows) {
      if (row.at > now) continue
      insertAudit.run(
        null,
        row.actorName,
        row.action,
        row.targetType,
        row.targetId || null,
        row.targetLabel || null,
        row.detail,
        `192.168.${randInt(1, 20)}.${randInt(2, 240)}`,
        iso(row.at),
      )
    }

    /* ------------------------- 设置：补最后发布 ----------------------- */
    database
      .prepare('UPDATE settings SET value = ? WHERE key = ?')
      .run('2026-11-14T01:20:00.000Z', 'last_publish_at')

    console.log(
      `[seed] ${devices.length} devices · ${eventCount} events · ${errorCount} errors · ${feedbackPool.length} feedback · ${auditRows.length} audit rows`,
    )
    console.log(`[seed] 用时 ${Date.now() - startedAt} ms`)

    return
  })

  return {
    devices: (database.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n,
    events: (database.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n,
    feedback: (database.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number }).n,
    errors: (database.prepare('SELECT COUNT(*) AS n FROM errors').get() as { n: number }).n,
    credentials: resolve(DATA_DIR, 'seed-credentials.txt'),
  }
}

/** 首次启动时自动播种；已有账号则跳过。 */
export function ensureSeeded(): { seeded: boolean; credentials?: string } {
  const row = db().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  if (row.n > 0) return { seeded: false }
  const result = seedDatabase({ reset: false })
  return { seeded: true, credentials: result.credentials }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/server/seed.ts')

if (isDirectRun) {
  const reset = process.argv.includes('--reset')
  const result = seedDatabase({ reset })
  console.log(
    `[seed] 完成：${result.devices} 台设备 / ${result.events} 条事件 / ${result.feedback} 条反馈 / ${result.errors} 条崩溃`,
  )
  console.log(`[seed] 演示账号已写入 ${result.credentials}`)
  process.exit(0)
}


