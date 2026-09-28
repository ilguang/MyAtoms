/**
 * PostgreSQL 数据访问层：
 * - 单例连接池（适配 Vercel Serverless 冷启动复用）
 * - 首次查询时自动建表（CREATE TABLE IF NOT EXISTS）
 *
 * 必需环境变量 DATABASE_URL（Neon / 自建 Postgres 均可）。
 * 本地连接不启用 SSL；云端连接默认启用 SSL（Neon 要求）。
 */
import pg from 'pg'

const { Pool } = pg

// ---------- 领域类型（与旧 JSON 结构同构，供 store 层使用） ----------

export interface LLMConfigRecord {
  /** 配置条目唯一 id */
  id: string
  baseUrl: string
  model: string
  /** AES-256-GCM 加密后的 apiKey 密文，格式: ivHex:tagHex:encHex */
  apiKeyEnc: string
  createdAt: number
  updatedAt: number
}

export interface UserRecord {
  id: string
  email: string
  passwordHash: string
  salt: string
  createdAt: number
  /** 当前生效的 LLM 配置条目 id；null 表示未配置 */
  activeLLMId: string | null
}

export interface SessionRecord {
  token: string
  userId: string
  createdAt: number
  expiresAt: number
}

export interface ProjectRecord {
  id: string
  userId: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

export type MessageRole = 'user' | 'agent'
export type MessageKind = 'text' | 'agent-log' | 'app-created'

export interface MessageRecord {
  id: string
  projectId: string
  role: MessageRole
  kind: MessageKind
  content: string
  createdAt: number
}

/** 编辑器中的单个文件（与前端 src/lib/types.ts 的 AppFile 同构） */
export interface AppFile {
  path: string
  content: string
}

export interface AppRecord {
  id: string
  projectId: string
  name: string
  code: string
  files: AppFile[]
  version: number
  createdAt: number
}

export interface ShareRecord {
  slug: string
  projectId: string
  appId: string
  createdAt: number
}

// ---------- 连接池 ----------

let pool: pg.Pool | null = null

function getPool(): pg.Pool {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      '未配置 DATABASE_URL 环境变量，无法连接数据库。请在 .env（本地）或 Vercel 环境变量中配置 Postgres 连接串。',
    )
  }
  const isLocal = /(^|@)(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)
  pool = new Pool({
    connectionString,
    max: 5,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  })
  return pool
}

// ---------- 自动建表（冷启动时执行一次） ----------

let schemaPromise: Promise<void> | null = null

async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const p = getPool()
      await p.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          active_llm_id TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);
        CREATE TABLE IF NOT EXISTS apps (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          code TEXT NOT NULL,
          files JSONB NOT NULL DEFAULT '[]',
          version INT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_apps_project_version ON apps(project_id, version DESC);
        CREATE TABLE IF NOT EXISTS shares (
          slug TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          app_id TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS llm_configs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          base_url TEXT NOT NULL,
          model TEXT NOT NULL,
          api_key_enc TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          UNIQUE(user_id, base_url, model)
        );
      `)
    })()
  }
  return schemaPromise
}

/** 统一查询入口：首次调用时保证表已建好 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  await ensureSchema()
  return getPool().query<T>(text, params)
}

// ---------- 行映射（snake_case → camelCase） ----------

type Row = pg.QueryResultRow

interface UserRow {
  id: string
  email: string
  password_hash: string
  salt: string
  created_at: string
  active_llm_id: string | null
}

export function mapUser(r: Row): UserRecord {
  const x = r as UserRow
  return {
    id: x.id,
    email: x.email,
    passwordHash: x.password_hash,
    salt: x.salt,
    createdAt: Number(x.created_at),
    activeLLMId: x.active_llm_id,
  }
}

interface LLMConfigRow {
  id: string
  base_url: string
  model: string
  api_key_enc: string
  created_at: string
  updated_at: string
}

export function mapLLMConfig(r: Row): LLMConfigRecord {
  const x = r as LLMConfigRow
  return {
    id: x.id,
    baseUrl: x.base_url,
    model: x.model,
    apiKeyEnc: x.api_key_enc,
    createdAt: Number(x.created_at),
    updatedAt: Number(x.updated_at),
  }
}

interface ProjectRow {
  id: string
  user_id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export function mapProject(r: Row): ProjectRecord {
  const x = r as ProjectRow
  return {
    id: x.id,
    userId: x.user_id,
    name: x.name,
    description: x.description,
    createdAt: Number(x.created_at),
    updatedAt: Number(x.updated_at),
  }
}

interface MessageRow {
  id: string
  project_id: string
  role: MessageRole
  kind: MessageKind
  content: string
  created_at: string
}

export function mapMessage(r: Row): MessageRecord {
  const x = r as MessageRow
  return {
    id: x.id,
    projectId: x.project_id,
    role: x.role,
    kind: x.kind,
    content: x.content,
    createdAt: Number(x.created_at),
  }
}

interface AppRow {
  id: string
  project_id: string
  name: string
  code: string
  files: AppFile[]
  version: number
  created_at: string
}

export function mapApp(r: Row): AppRecord {
  const x = r as AppRow
  return {
    id: x.id,
    projectId: x.project_id,
    name: x.name,
    code: x.code,
    files: Array.isArray(x.files) ? (x.files as AppFile[]) : [],
    version: Number(x.version),
    createdAt: Number(x.created_at),
  }
}

interface ShareRow {
  slug: string
  project_id: string
  app_id: string
  created_at: string
}

export function mapShare(r: Row): ShareRecord {
  const x = r as ShareRow
  return {
    slug: x.slug,
    projectId: x.project_id,
    appId: x.app_id,
    createdAt: Number(x.created_at),
  }
}

interface SessionRow {
  token: string
  user_id: string
  created_at: string
  expires_at: string
}

export function mapSession(r: Row): SessionRecord {
  const x = r as SessionRow
  return {
    token: x.token,
    userId: x.user_id,
    createdAt: Number(x.created_at),
    expiresAt: Number(x.expires_at),
  }
}
