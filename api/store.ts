/**
 * 数据仓储层：封装所有对 JSON 数据库的读写操作。
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'crypto'
import {
  readDB,
  writeDB,
  type DB,
  type UserRecord,
  type ProjectRecord,
  type MessageRecord,
  type AppRecord,
  type AppFile,
  type LLMConfigRecord,
  type ShareRecord,
} from './db.js'
import { splitHtmlToFiles } from '../src/lib/htmlFiles.js'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

export interface PublicUser {
  id: string
  email: string
  createdAt: number
}

export function publicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

// ---------- 用户 ----------

export function findUserByEmail(email: string): UserRecord | undefined {
  const db = readDB()
  const target = email.trim().toLowerCase()
  return db.users.find((u) => u.email === target)
}

export function findUserById(id: string): UserRecord | undefined {
  return readDB().users.find((u) => u.id === id)
}

export function createUser(email: string, password: string): PublicUser {
  const db = readDB()
  const salt = randomBytes(16).toString('hex')
  const user: UserRecord = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: Date.now(),
  }
  db.users.push(user)
  writeDB(db)
  return publicUser(user)
}

export function verifyUser(email: string, password: string): UserRecord | undefined {
  const user = findUserByEmail(email)
  if (!user) return undefined
  const hash = hashPassword(password, user.salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(user.passwordHash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
  return user
}

// ---------- 会话 ----------

export function createSession(userId: string): string {
  const db = readDB()
  const token = randomBytes(32).toString('hex')
  db.sessions.push({
    token,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  })
  writeDB(db)
  return token
}

export function findUserIdBySession(token: string): string | null {
  const db = readDB()
  const session = db.sessions.find((s) => s.token === token)
  if (!session) return null
  if (session.expiresAt < Date.now()) return null
  return session.userId
}

export function deleteSession(token: string): void {
  const db = readDB()
  db.sessions = db.sessions.filter((s) => s.token !== token)
  writeDB(db)
}

// ---------- 项目 ----------

export function listProjects(userId: string): ProjectRecord[] {
  return readDB()
    .projects.filter((p) => p.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getProject(id: string): ProjectRecord | undefined {
  return readDB().projects.find((p) => p.id === id)
}

export function createProject(
  userId: string,
  name: string,
  description: string,
): ProjectRecord {
  const db = readDB()
  const now = Date.now()
  const project: ProjectRecord = {
    id: randomUUID(),
    userId,
    name: name || '未命名项目',
    description: description || '',
    createdAt: now,
    updatedAt: now,
  }
  db.projects.push(project)
  writeDB(db)
  return project
}

export function touchProject(id: string): void {
  const db = readDB()
  const project = db.projects.find((p) => p.id === id)
  if (project) {
    project.updatedAt = Date.now()
    writeDB(db)
  }
}

export function deleteProject(id: string): void {
  const db = readDB()
  db.projects = db.projects.filter((p) => p.id !== id)
  db.messages = db.messages.filter((m) => m.projectId !== id)
  db.apps = db.apps.filter((a) => a.projectId !== id)
  db.shares = db.shares.filter((s) => s.projectId !== id)
  writeDB(db)
}

// ---------- 消息 ----------

export interface MessageInput {
  role: 'user' | 'agent'
  kind: 'text' | 'agent-log' | 'app-created'
  content: string
}

export function listMessages(projectId: string): MessageRecord[] {
  return readDB()
    .messages.filter((m) => m.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addMessages(projectId: string, inputs: MessageInput[]): MessageRecord[] {
  const db = readDB()
  const now = Date.now()
  const created: MessageRecord[] = inputs.map((input, i) => ({
    id: randomUUID(),
    projectId,
    role: input.role,
    kind: input.kind,
    content: input.content,
    createdAt: now + i,
  }))
  db.messages.push(...created)
  writeDB(db)
  return created
}

// ---------- 应用 ----------

export function saveApp(
  projectId: string,
  name: string,
  code: string,
  files?: AppFile[],
): AppRecord {
  const db = readDB()
  const latest = db.apps
    .filter((a) => a.projectId === projectId)
    .sort((a, b) => b.version - a.version)[0]
  const app: AppRecord = {
    id: randomUUID(),
    projectId,
    name,
    code,
    version: latest ? latest.version + 1 : 1,
    createdAt: Date.now(),
    files: files && files.length > 0 ? files : undefined,
  }
  db.apps.push(app)
  writeDB(db)
  return app
}

export function getLatestApp(projectId: string): AppRecord | undefined {
  const app = readDB()
    .apps.filter((a) => a.projectId === projectId)
    .sort((a, b) => b.version - a.version)[0]
  // 兜底：旧 app 没有 files 字段，现场拆分返回给前端编辑器使用
  if (app && !app.files) {
    return { ...app, files: splitHtmlToFiles(app.code) }
  }
  return app
}

// ---------- 分享 ----------

export function createShare(projectId: string, appId: string): ShareRecord {
  const db = readDB()
  const share: ShareRecord = {
    slug: randomBytes(4).toString('hex'),
    projectId,
    appId,
    createdAt: Date.now(),
  }
  db.shares.push(share)
  writeDB(db)
  return share
}

export function getShareBySlug(slug: string): ShareRecord | undefined {
  return readDB().shares.find((s) => s.slug === slug)
}

export function getAppById(id: string): AppRecord | undefined {
  return readDB().apps.find((a) => a.id === id)
}

export function getDB(): DB {
  return readDB()
}

// ---------- LLM 配置 ----------

// 加密主密钥：从环境变量读取，开发态用固定默认值（生产部署必须配置 LLM_ENCRYPTION_KEY）
const ENC_KEY_RAW = process.env.LLM_ENCRYPTION_KEY || 'atoms-dev-enc-key-change-me-in-prod'
const ENC_KEY = Buffer.alloc(32, 0)
ENC_KEY.write(ENC_KEY_RAW.slice(0, 32), 0, 'utf-8')

/** AES-256-GCM 加密，输出格式: ivHex:tagHex:encHex */
function encryptPlain(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

/** 解密 encryptPlain 输出的密文 */
function decryptPayload(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('密文格式错误')
  const [ivHex, tagHex, encHex] = parts
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf-8')
}

function maskApiKey(plain: string): string {
  if (plain.length <= 8) return '****'
  return plain.slice(0, 4) + '****' + plain.slice(-4)
}

/** 脱敏后的 LLM 配置条目（返回给前端，apiKey 不出明文） */
export interface LLMConfigItem {
  id: string
  baseUrl: string
  model: string
  apiKeyMasked: string
  createdAt: number
  updatedAt: number
}

export interface LLMConfigList {
  configs: LLMConfigItem[]
  activeId: string | null
}

export interface LLMConfigInput {
  baseUrl: string
  model: string
  apiKey: string
}

/** 编辑条目：apiKey 传空字符串/不传表示保留原 Key */
export interface LLMConfigUpdate {
  baseUrl?: string
  model?: string
  apiKey?: string
}

function toPublicItem(rec: LLMConfigRecord): LLMConfigItem {
  let masked = '****'
  try {
    masked = maskApiKey(decryptPayload(rec.apiKeyEnc))
  } catch {
    masked = '****'
  }
  return {
    id: rec.id,
    baseUrl: rec.baseUrl,
    model: rec.model,
    apiKeyMasked: masked,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  }
}

/**
 * 惰性迁移：把旧版单条 llmConfig 搬到 llmConfigs 数组。
 * 直接 mutate 传入的 user；返回 true 表示发生了迁移，调用方负责 writeDB。
 */
function ensureLLMConfigs(user: UserRecord): boolean {
  if (user.llmConfigs) return false
  const legacy = user.llmConfig
  const ts = legacy?.updatedAt ?? Date.now()
  user.llmConfigs = legacy
    ? [
        {
          id: randomUUID(),
          baseUrl: legacy.baseUrl,
          model: legacy.model,
          apiKeyEnc: legacy.apiKeyEnc,
          createdAt: ts,
          updatedAt: ts,
        },
      ]
    : []
  user.activeLLMId = user.llmConfigs[0]?.id ?? null
  user.llmConfig = undefined
  return true
}

/** 读取用户并完成旧配置迁移；迁移时落盘一次 */
function getUserAndMigrate(
  userId: string,
): { db: DB; user: UserRecord } | null {
  const db = readDB()
  const user = db.users.find((u) => u.id === userId)
  if (!user) return null
  if (ensureLLMConfigs(user)) writeDB(db)
  return { db, user }
}

function toPublicList(user: UserRecord): LLMConfigList {
  const configs = (user.llmConfigs ?? []).map(toPublicItem)
  const activeId =
    user.activeLLMId && configs.some((c) => c.id === user.activeLLMId)
      ? user.activeLLMId
      : (configs[0]?.id ?? null)
  return { configs, activeId }
}

/** 列出脱敏配置 + 当前生效 id */
export function listLLMConfigs(userId: string): LLMConfigList {
  const ctx = getUserAndMigrate(userId)
  return ctx ? toPublicList(ctx.user) : { configs: [], activeId: null }
}

/** 新增一条配置；若是第一条则自动设为当前生效 */
export function addLLMConfig(userId: string, input: LLMConfigInput): LLMConfigList {
  const baseUrl = (input.baseUrl || '').trim()
  const model = (input.model || '').trim()
  const apiKey = (input.apiKey || '').trim()
  if (!baseUrl || !model || !apiKey) {
    throw new Error('baseUrl / model / apiKey 不能为空')
  }
  const ctx = getUserAndMigrate(userId)
  if (!ctx) throw new Error('用户不存在')
  const { db, user } = ctx
  if (user.llmConfigs!.some((c) => c.baseUrl === baseUrl && c.model === model)) {
    throw new Error('该供应商 + 模型已配置，可直接编辑或删除后重建')
  }
  const now = Date.now()
  const rec: LLMConfigRecord = {
    id: randomUUID(),
    baseUrl,
    model,
    apiKeyEnc: encryptPlain(apiKey),
    createdAt: now,
    updatedAt: now,
  }
  user.llmConfigs!.push(rec)
  if (!user.activeLLMId) user.activeLLMId = rec.id
  writeDB(db)
  return toPublicList(user)
}

/** 编辑条目：baseUrl/model 可改，apiKey 留空保留原 Key */
export function updateLLMConfig(
  userId: string,
  configId: string,
  update: LLMConfigUpdate,
): LLMConfigList {
  const ctx = getUserAndMigrate(userId)
  if (!ctx) throw new Error('用户不存在')
  const { db, user } = ctx
  const rec = user.llmConfigs!.find((c) => c.id === configId)
  if (!rec) throw new Error('配置不存在')
  const baseUrl = update.baseUrl === undefined ? rec.baseUrl : update.baseUrl.trim()
  const model = update.model === undefined ? rec.model : update.model.trim()
  if (!baseUrl || !model) throw new Error('baseUrl / model 不能为空')
  const duplicate = user.llmConfigs!.some(
    (c) => c.id !== configId && c.baseUrl === baseUrl && c.model === model,
  )
  if (duplicate) throw new Error('该供应商 + 模型已存在另一条配置')
  const apiKey = (update.apiKey || '').trim()
  rec.baseUrl = baseUrl
  rec.model = model
  if (apiKey) rec.apiKeyEnc = encryptPlain(apiKey)
  rec.updatedAt = Date.now()
  writeDB(db)
  return toPublicList(user)
}

/** 删除一条配置；删的是当前生效项则自动切到剩余第一条 */
export function deleteLLMConfig(userId: string, configId: string): LLMConfigList {
  const ctx = getUserAndMigrate(userId)
  if (!ctx) throw new Error('用户不存在')
  const { db, user } = ctx
  const before = user.llmConfigs!.length
  user.llmConfigs = user.llmConfigs!.filter((c) => c.id !== configId)
  if (user.llmConfigs.length === before) throw new Error('配置不存在')
  if (user.activeLLMId === configId || !user.llmConfigs.some((c) => c.id === user.activeLLMId)) {
    user.activeLLMId = user.llmConfigs[0]?.id ?? null
  }
  writeDB(db)
  return toPublicList(user)
}

/** 设置当前生效的配置条目（工作台快速切换模型用） */
export function activateLLMConfig(userId: string, configId: string): LLMConfigList {
  const ctx = getUserAndMigrate(userId)
  if (!ctx) throw new Error('用户不存在')
  const { db, user } = ctx
  if (!user.llmConfigs!.some((c) => c.id === configId)) {
    throw new Error('配置不存在')
  }
  user.activeLLMId = configId
  writeDB(db)
  return toPublicList(user)
}

/** 内部使用：获取当前生效条目的解密配置（仅用于调用 LLM） */
export function getActiveDecryptedLLMConfig(
  userId: string,
): { id: string; baseUrl: string; model: string; apiKey: string } | null {
  const ctx = getUserAndMigrate(userId)
  if (!ctx) return null
  const { user } = ctx
  const cfg =
    user.llmConfigs!.find((c) => c.id === user.activeLLMId) ?? user.llmConfigs![0]
  if (!cfg) return null
  try {
    return {
      id: cfg.id,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      apiKey: decryptPayload(cfg.apiKeyEnc),
    }
  } catch {
    return null
  }
}