/**
 * 数据仓储层：所有领域读写均改为 PostgreSQL（函数签名保持与旧版一致，
 * 但全部为 async；路由层只需加 await）。
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
  query,
  mapUser,
  mapSession,
  mapProject,
  mapMessage,
  mapApp,
  mapShare,
  mapLLMConfig,
  type UserRecord,
  type ProjectRecord,
  type MessageRecord,
  type AppRecord,
  type AppFile,
  type LLMConfigRecord,
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

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const r = await query(
    'SELECT * FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  )
  return r.rows[0] ? mapUser(r.rows[0]) : undefined
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  const r = await query('SELECT * FROM users WHERE id = $1', [id])
  return r.rows[0] ? mapUser(r.rows[0]) : undefined
}

export async function createUser(
  email: string,
  password: string,
): Promise<PublicUser> {
  const salt = randomBytes(16).toString('hex')
  const now = Date.now()
  const user: UserRecord = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: now,
    activeLLMId: null,
  }
  await query(
    `INSERT INTO users (id, email, password_hash, salt, created_at, active_llm_id)
     VALUES ($1,$2,$3,$4,$5,NULL)`,
    [user.id, user.email, user.passwordHash, user.salt, user.createdAt],
  )
  return publicUser(user)
}

export async function verifyUser(
  email: string,
  password: string,
): Promise<UserRecord | undefined> {
  const user = await findUserByEmail(email)
  if (!user) return undefined
  const hash = hashPassword(password, user.salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(user.passwordHash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
  return user
}

// ---------- 会话 ----------

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [token, userId, Date.now(), Date.now() + SESSION_TTL_MS],
  )
  return token
}

export async function findUserIdBySession(token: string): Promise<string | null> {
  const r = await query(
    'SELECT * FROM sessions WHERE token = $1 AND expires_at > $2',
    [token, Date.now()],
  )
  return r.rows[0] ? mapSession(r.rows[0]).userId : null
}

export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token = $1', [token])
}

// ---------- 项目 ----------

export async function listProjects(userId: string): Promise<ProjectRecord[]> {
  const r = await query(
    'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId],
  )
  return r.rows.map(mapProject)
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const r = await query('SELECT * FROM projects WHERE id = $1', [id])
  return r.rows[0] ? mapProject(r.rows[0]) : undefined
}

export async function createProject(
  userId: string,
  name: string,
  description: string,
): Promise<ProjectRecord> {
  const now = Date.now()
  const project: ProjectRecord = {
    id: randomUUID(),
    userId,
    name: name || '未命名项目',
    description: description || '',
    createdAt: now,
    updatedAt: now,
  }
  await query(
    `INSERT INTO projects (id, user_id, name, description, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [project.id, project.userId, project.name, project.description, project.createdAt, project.updatedAt],
  )
  return project
}

export async function touchProject(id: string): Promise<void> {
  await query('UPDATE projects SET updated_at = $1 WHERE id = $2', [Date.now(), id])
}

export async function deleteProject(id: string): Promise<void> {
  // messages/apps/shares 通过外键 ON DELETE CASCADE 自动清理
  await query('DELETE FROM projects WHERE id = $1', [id])
}

// ---------- 消息 ----------

export interface MessageInput {
  role: 'user' | 'agent'
  kind: 'text' | 'agent-log' | 'app-created'
  content: string
}

export async function listMessages(projectId: string): Promise<MessageRecord[]> {
  const r = await query(
    'SELECT * FROM messages WHERE project_id = $1 ORDER BY created_at ASC',
    [projectId],
  )
  return r.rows.map(mapMessage)
}

export async function addMessages(
  projectId: string,
  inputs: MessageInput[],
): Promise<MessageRecord[]> {
  if (inputs.length === 0) return []
  const now = Date.now()
  const created: MessageRecord[] = inputs.map((input, i) => ({
    id: randomUUID(),
    projectId,
    role: input.role,
    kind: input.kind,
    content: input.content,
    createdAt: now + i,
  }))
  // 批量插入：$1,$2... 占位符按行展开
  const values: unknown[] = []
  const chunks: string[] = []
  let idx = 1
  for (const m of created) {
    chunks.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`)
    values.push(m.id, m.projectId, m.role, m.kind, m.content, m.createdAt)
  }
  await query(
    `INSERT INTO messages (id, project_id, role, kind, content, created_at)
     VALUES ${chunks.join(',')}`,
    values,
  )
  return created
}

// ---------- 应用 ----------

export async function saveApp(
  projectId: string,
  name: string,
  code: string,
  files?: AppFile[],
): Promise<AppRecord> {
  const versionRes = await query(
    'SELECT COALESCE(MAX(version), 0) AS v FROM apps WHERE project_id = $1',
    [projectId],
  )
  const version = Number(versionRes.rows[0]?.v ?? 0) + 1
  const app: AppRecord = {
    id: randomUUID(),
    projectId,
    name,
    code,
    files: files && files.length > 0 ? files : splitHtmlToFiles(code),
    version,
    createdAt: Date.now(),
  }
  await query(
    `INSERT INTO apps (id, project_id, name, code, files, version, created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
    [app.id, app.projectId, app.name, app.code, JSON.stringify(app.files), app.version, app.createdAt],
  )
  return app
}

export async function getLatestApp(projectId: string): Promise<AppRecord | undefined> {
  const r = await query(
    'SELECT * FROM apps WHERE project_id = $1 ORDER BY version DESC LIMIT 1',
    [projectId],
  )
  return r.rows[0] ? mapApp(r.rows[0]) : undefined
}

export async function getAppById(id: string): Promise<AppRecord | undefined> {
  const r = await query('SELECT * FROM apps WHERE id = $1', [id])
  return r.rows[0] ? mapApp(r.rows[0]) : undefined
}

// ---------- 分享 ----------

export async function createShare(
  projectId: string,
  appId: string,
): Promise<{ slug: string; projectId: string; appId: string; createdAt: number }> {
  const share = {
    slug: randomBytes(4).toString('hex'),
    projectId,
    appId,
    createdAt: Date.now(),
  }
  await query(
    `INSERT INTO shares (slug, project_id, app_id, created_at)
     VALUES ($1,$2,$3,$4)`,
    [share.slug, share.projectId, share.appId, share.createdAt],
  )
  return share
}

export async function getShareBySlug(slug: string) {
  const r = await query('SELECT * FROM shares WHERE slug = $1', [slug])
  return r.rows[0] ? mapShare(r.rows[0]) : undefined
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

async function getConfigRecords(userId: string): Promise<{
  configs: LLMConfigRecord[]
  activeId: string | null
}> {
  const userRes = await query('SELECT active_llm_id FROM users WHERE id = $1', [userId])
  const storedActive = (userRes.rows[0]?.active_llm_id as string | null) ?? null
  const r = await query(
    'SELECT * FROM llm_configs WHERE user_id = $1 ORDER BY created_at ASC',
    [userId],
  )
  const configs = r.rows.map(mapLLMConfig)
  const activeId =
    storedActive && configs.some((c) => c.id === storedActive)
      ? storedActive
      : (configs[0]?.id ?? null)
  return { configs, activeId }
}

function toPublicList(records: LLMConfigRecord[], activeId: string | null): LLMConfigList {
  return { configs: records.map(toPublicItem), activeId }
}

/** 列出脱敏配置 + 当前生效 id */
export async function listLLMConfigs(userId: string): Promise<LLMConfigList> {
  const { configs, activeId } = await getConfigRecords(userId)
  return toPublicList(configs, activeId)
}

/** 新增一条配置；若是第一条则自动设为当前生效 */
export async function addLLMConfig(
  userId: string,
  input: LLMConfigInput,
): Promise<LLMConfigList> {
  const baseUrl = (input.baseUrl || '').trim()
  const model = (input.model || '').trim()
  const apiKey = (input.apiKey || '').trim()
  if (!baseUrl || !model || !apiKey) {
    throw new Error('baseUrl / model / apiKey 不能为空')
  }
  const existing = await getConfigRecords(userId)
  if (existing.configs.some((c) => c.baseUrl === baseUrl && c.model === model)) {
    throw new Error('该供应商 + 模型已配置，可直接编辑或删除后重建')
  }
  const now = Date.now()
  const id = randomUUID()
  await query(
    `INSERT INTO llm_configs (id, user_id, base_url, model, api_key_enc, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, baseUrl, model, encryptPlain(apiKey), now, now],
  )
  if (!existing.activeId) {
    await query('UPDATE users SET active_llm_id = $1 WHERE id = $2', [id, userId])
    existing.activeId = id
  }
  const refreshed = await getConfigRecords(userId)
  return toPublicList(refreshed.configs, refreshed.activeId)
}

/** 编辑条目：baseUrl/model 可改，apiKey 留空保留原 Key */
export async function updateLLMConfig(
  userId: string,
  configId: string,
  update: LLMConfigUpdate,
): Promise<LLMConfigList> {
  const existing = await getConfigRecords(userId)
  const rec = existing.configs.find((c) => c.id === configId)
  if (!rec) throw new Error('配置不存在')
  const baseUrl = update.baseUrl === undefined ? rec.baseUrl : update.baseUrl.trim()
  const model = update.model === undefined ? rec.model : update.model.trim()
  if (!baseUrl || !model) throw new Error('baseUrl / model 不能为空')
  if (
    existing.configs.some(
      (c) => c.id !== configId && c.baseUrl === baseUrl && c.model === model,
    )
  ) {
    throw new Error('该供应商 + 模型已存在另一条配置')
  }
  const apiKey = (update.apiKey || '').trim()
  const now = Date.now()
  if (apiKey) {
    await query(
      `UPDATE llm_configs SET base_url=$1, model=$2, api_key_enc=$3, updated_at=$4
       WHERE id=$5 AND user_id=$6`,
      [baseUrl, model, encryptPlain(apiKey), now, configId, userId],
    )
  } else {
    await query(
      `UPDATE llm_configs SET base_url=$1, model=$2, updated_at=$3
       WHERE id=$4 AND user_id=$5`,
      [baseUrl, model, now, configId, userId],
    )
  }
  const refreshed = await getConfigRecords(userId)
  return toPublicList(refreshed.configs, refreshed.activeId)
}

/** 删除一条配置；删的是当前生效项则自动切到剩余第一条 */
export async function deleteLLMConfig(
  userId: string,
  configId: string,
): Promise<LLMConfigList> {
  const existing = await getConfigRecords(userId)
  if (!existing.configs.some((c) => c.id === configId)) throw new Error('配置不存在')
  await query('DELETE FROM llm_configs WHERE id = $1 AND user_id = $2', [configId, userId])
  if (existing.activeId === configId) {
    const rest = existing.configs.filter((c) => c.id !== configId)
    const nextId = rest[0]?.id ?? null
    await query('UPDATE users SET active_llm_id = $1 WHERE id = $2', [nextId, userId])
  }
  const refreshed = await getConfigRecords(userId)
  return toPublicList(refreshed.configs, refreshed.activeId)
}

/** 设置当前生效的配置条目（工作台快速切换模型用） */
export async function activateLLMConfig(
  userId: string,
  configId: string,
): Promise<LLMConfigList> {
  const existing = await getConfigRecords(userId)
  if (!existing.configs.some((c) => c.id === configId)) throw new Error('配置不存在')
  await query('UPDATE users SET active_llm_id = $1 WHERE id = $2', [configId, userId])
  return toPublicList(existing.configs, configId)
}

/** 内部使用：获取当前生效条目的解密配置（仅用于调用 LLM） */
export async function getActiveDecryptedLLMConfig(
  userId: string,
): Promise<{ id: string; baseUrl: string; model: string; apiKey: string } | null> {
  const { configs, activeId } = await getConfigRecords(userId)
  const cfg = configs.find((c) => c.id === activeId) ?? configs[0]
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
