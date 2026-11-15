import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.STB_BASE ?? 'http://127.0.0.1:8787'
const OUT = '.screenshots'
mkdirSync(OUT, { recursive: true })

const routes = [
  ['dashboard', '/'],
  ['devices', '/telemetry/devices'],
  ['tools', '/telemetry/tools'],
  ['errors', '/telemetry/errors'],
  ['events', '/telemetry/events'],
  ['feedback', '/feedback'],
  ['control', '/control'],
  ['control-tools', '/control/tools'],
  ['control-announcements', '/control/announcements'],
  ['control-release', '/control/release'],
  ['control-history', '/control/history'],
  ['team', '/team'],
  ['roles', '/team/roles'],
  ['audit', '/team/audit'],
  ['settings', '/settings'],
  ['integration', '/integration'],
]

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
})
const page = await context.newPage()
const problems = []
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/login.png`, fullPage: true })

await page.fill('#username', 'admin')
await page.fill('#password', 'STB-admin-2026')
await page.click('button[type="submit"]')
await page.waitForTimeout(1800)

for (const [name, route] of routes) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`captured ${name}`)
}

// 反馈详情抽屉
await page.goto(`${BASE}/feedback`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const row = page.locator('tbody tr').first()
if (await row.count()) {
  await row.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/feedback-drawer.png`, fullPage: false })
  console.log('captured feedback-drawer')
}

// 设备详情
await page.goto(`${BASE}/telemetry/devices`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const deviceRow = page.locator('tbody tr').first()
if (await deviceRow.count()) {
  await deviceRow.click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/device-detail.png`, fullPage: true })
  console.log('captured device-detail')
}

// 暗色模式
await page.evaluate(() => localStorage.setItem('stb-theme', 'dark'))
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/dashboard-dark.png`, fullPage: true })
console.log('captured dashboard-dark')

// 移动端
const mobile = await browser.newContext({
  viewport: { width: 414, height: 896 },
  deviceScaleFactor: 2,
  isMobile: true,
  locale: 'zh-CN',
})
const mobilePage = await mobile.newPage()
await mobilePage.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await mobilePage.waitForTimeout(500)
await mobilePage.screenshot({ path: `${OUT}/login-mobile.png`, fullPage: true })
await mobilePage.fill('#username', 'admin')
await mobilePage.fill('#password', 'STB-admin-2026')
await mobilePage.click('button[type="submit"]')
await mobilePage.waitForTimeout(1800)
await mobilePage.screenshot({ path: `${OUT}/dashboard-mobile.png`, fullPage: true })
console.log('captured mobile')

await browser.close()
if (problems.length > 0) {
  console.log('\n=== 前端运行时问题 ===')
  for (const problem of [...new Set(problems)]) console.log(problem)
} else {
  console.log('\n没有发现前端运行时错误')
}
