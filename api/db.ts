/**
 * 轻量 JSON 文件数据库：进程内缓存 + 原子写入。
 * 数据目录可通过环境变量 DATA_DIR 指定（本地默认为项目根目录 /data）。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

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
  /** 用户的多个 LLM 配置（每个对应一个供应商/模型 + 独立 API Key） */
  llmConfigs?: LLMConfigRecord[]
  /** 当前生效的配置条目 id；null/空数组表示未配置 */
  activeLLMId?: string | null
  /** @deprecated 旧版单条配置，读取时惰性迁移到 llmConfigs */
  llmConfig?: LLMConfigRecord
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
  version: number
  createdAt: number
  /** 编辑器多文件视图；旧数据可能缺省，由 store 现场拆分兜底 */
  files?: AppFile[]
}

export interface ShareRecord {
  slug: string
  projectId: string
  appId: string
  createdAt: number
}

export interface DB {
  users: UserRecord[]
  sessions: SessionRecord[]
  projects: ProjectRecord[]
  messages: MessageRecord[]
  apps: AppRecord[]
  shares: ShareRecord[]
}

const EMPTY: DB = {
  users: [],
  sessions: [],
  projects: [],
  messages: [],
  apps: [],
  shares: [],
}

let cache: DB | null = null

export function readDB(): DB {
  if (cache) return cache
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8')
      cache = { ...EMPTY, ...(JSON.parse(raw) as Partial<DB>) }
    } else {
      cache = { ...EMPTY }
    }
  } catch {
    cache = { ...EMPTY }
  }
  return cache
}

export function writeDB(db: DB): void {
  cache = db
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
  const tmp = `${DB_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8')
  fs.renameSync(tmp, DB_FILE)
}