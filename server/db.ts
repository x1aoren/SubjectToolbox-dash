import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DATA_DIR = resolve(ROOT, 'data')
export const DB_PATH = resolve(DATA_DIR, 'console.db')
export const UPLOAD_DIR = resolve(DATA_DIR, 'uploads')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(UPLOAD_DIR, { recursive: true })
mkdirSync(dirname(DB_PATH), { recursive: true })

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  avatar_color TEXT NOT NULL DEFAULT '#3F6E5A',
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  sn TEXT PRIMARY KEY,
  model TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  os_version TEXT NOT NULL DEFAULT '',
  sdk_int INTEGER NOT NULL DEFAULT 26,
  app_version TEXT NOT NULL DEFAULT '',
  version_code INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'stable',
  school TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_opens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_devices_version ON devices(app_version);
CREATE INDEX IF NOT EXISTS idx_devices_channel ON devices(channel);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sn TEXT NOT NULL,
  name TEXT NOT NULL,
  tool_id TEXT,
  subject_id TEXT,
  app_version TEXT,
  channel TEXT,
  props TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_name_time ON events(name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_device ON events(sn, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool_id, occurred_at);

CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sn TEXT NOT NULL,
  signature TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  tool_id TEXT,
  app_version TEXT,
  channel TEXT,
  occurred_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_errors_time ON errors(occurred_at);
CREATE INDEX IF NOT EXISTS idx_errors_sig ON errors(signature);
CREATE INDEX IF NOT EXISTS idx_errors_resolved ON errors(resolved);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  sn TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  contact TEXT,
  tool_id TEXT,
  app_version TEXT,
  channel TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  assignee_id TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_reply_at TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_device ON feedback(sn);

CREATE TABLE IF NOT EXISTS feedback_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_messages ON feedback_messages(feedback_id);

CREATE TABLE IF NOT EXISTS device_tool_overrides (
  sn TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_by_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (sn, tool_id)
);
CREATE INDEX IF NOT EXISTS idx_overrides_sn ON device_tool_overrides(sn);

CREATE TABLE IF NOT EXISTS client_tools (
  tool_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  first_reported_at TEXT NOT NULL,
  last_reported_at TEXT NOT NULL,
  last_sn TEXT,
  report_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS device_tools (
  sn TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  last_reported_at TEXT NOT NULL,
  PRIMARY KEY (sn, tool_id)
);
CREATE INDEX IF NOT EXISTS idx_device_tools_tool ON device_tools(tool_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_target ON attachments(target_type, target_id);

CREATE TABLE IF NOT EXISTS config_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_no INTEGER NOT NULL,
  json TEXT NOT NULL,
  summary TEXT NOT NULL,
  published_by TEXT,
  published_by_name TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  active_revision_id INTEGER,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  updated_by_name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);
`

let instance: DatabaseSync | null = null

export function db(): DatabaseSync {
  if (!instance) {
    instance = new DatabaseSync(DB_PATH)
    instance.exec(SCHEMA)
    instance.exec('PRAGMA busy_timeout = 5000;')
  }
  return instance
}

export function closeDb(): void {
  instance?.close()
  instance = null
}

/** node:sqlite 没有内建事务助手，这里保证异常时回滚。 */
export function tx<T>(fn: (database: DatabaseSync) => T): T {
  const database = db()
  database.exec('BEGIN')
  try {
    const result = fn(database)
    database.exec('COMMIT')
    return result
  } catch (error) {
    try {
      database.exec('ROLLBACK')
    } catch {
      /* 事务可能已经被 SQLite 自动回滚 */
    }
    throw error
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export type SqlValue = string | number | null

export function getSetting(key: string, fallback = ''): string {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? fallback
}

export function setSetting(key: string, value: string): void {
  db().prepare(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

export function getSettings(): Record<string, string> {
  const rows = db().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  workspace_name: '学科工具箱',
  org_name: '市第二中学 · 信息技术组',
  telemetry_enabled: '1',
  feedback_enabled: '1',
  retention_days: '180',
  allow_anonymous_ingest: '1',
  demo_seeded_at: '',
  last_publish_at: '',
}
