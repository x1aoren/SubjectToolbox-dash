/**
 * 轻量的进程内限流。
 *
 * 校园部署只有几百台平板，按 SN 计数的内存 Map 足够；重启后归零是可接受的。
 * 所有上报接口都先过这一层，避免客户端异常时把 SQLite 写满。
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** 返回 true 表示放行，false 表示超限。 */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

export function resetLimiter(): void {
  buckets.clear()
}

/** 定期清理过期桶，避免 Map 随 SN 数量无限增长。 */
export function pruneLimiter(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}
