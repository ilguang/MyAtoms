/**
 * 一次性迁移：把旧版 data/db.json（JSON 文件存储）导入 PostgreSQL。
 *
 * 用法：
 *   1. .env 里配好 DATABASE_URL
 *   2. npm run migrate
 *
 * 幂等：所有插入均 ON CONFLICT DO NOTHING，重复执行不会产生重复数据。
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { fileURLToPath } from 'url'
import { query } from '../server/db.js'
import { splitHtmlToFiles } from '../src/lib/htmlFiles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'db.json')
  : path.resolve(__dirname, '..', 'data', 'db.json')

// 与 server/store.ts 相同的 AES-256-GCM 实现，按原始密钥参数化，便于重新加密
function deriveKey(raw: string): Buffer {
  const k = Buffer.alloc(32, 0)
  k.write(raw.slice(0, 32), 0, 'utf-8')
  return k
}
function decryptWith(raw: string, payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':')
  const d = createDecipheriv('aes-256-gcm', deriveKey(raw), Buffer.from(ivHex, 'hex'))
  d.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf-8')
}
function encryptWith(raw: string, plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', deriveKey(raw), iv)
  const enc = Buffer.concat([c.update(plain, 'utf-8'), c.final()])
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':')
}

// 旧数据是在没有 .env 时用代码内置默认密钥加密的
const OLD_KEY = process.env.OLD_LLM_ENCRYPTION_KEY || 'atoms-dev-enc-key-change-me-in-prod'
const NEW_KEY = process.env.LLM_ENCRYPTION_KEY || OLD_KEY
const reEncrypt = OLD_KEY !== NEW_KEY

/** 用旧密钥解开、新密钥重封；解不开则原样保留并告警 */
function rotateApiKey(apiKeyEnc: string): string {
  if (!reEncrypt) return apiKeyEnc
  try {
    return encryptWith(NEW_KEY, decryptWith(OLD_KEY, apiKeyEnc))
  } catch {
    console.warn('  ! 某条 API Key 无法用旧密钥解密，已原样保留（上线后请在设置页删除并重填）')
    return apiKeyEnc
  }
}

interface OldApp {
  id: string
  projectId: string
  name: string
  code: string
  files?: { path: string; content: string }[]
  version: number
  createdAt: number
}

interface OldUser {
  id: string
  email: string
  passwordHash: string
  salt: string
  createdAt: number
  llmConfigs?: {
    id: string
    baseUrl: string
    model: string
    apiKeyEnc: string
    createdAt: number
    updatedAt: number
  }[]
  activeLLMId?: string | null
  llmConfig?: {
    baseUrl: string
    model: string
    apiKeyEnc: string
    updatedAt: number
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`找不到 ${DB_FILE}，没有需要迁移的数据。`)
    process.exit(0)
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as {
    users: OldUser[]
    sessions: { token: string; userId: string; createdAt: number; expiresAt: number }[]
    projects: { id: string; userId: string; name: string; description: string; createdAt: number; updatedAt: number }[]
    messages: { id: string; projectId: string; role: string; kind: string; content: string; createdAt: number }[]
    apps: OldApp[]
    shares: { slug: string; projectId: string; appId: string; createdAt: number }[]
  }

  // ensureSchema（query 首次调用会自动建表）
  await query('SELECT 1')

  // 1. 用户
  for (const u of db.users) {
    await query(
      `INSERT INTO users (id, email, password_hash, salt, created_at, active_llm_id)
       VALUES ($1,$2,$3,$4,$5,NULL) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email, u.passwordHash, u.salt, u.createdAt],
    )
  }

  // 2. 会话
  for (const s of db.sessions) {
    await query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at)
       VALUES ($1,$2,$3,$4) ON CONFLICT (token) DO NOTHING`,
      [s.token, s.userId, s.createdAt, s.expiresAt],
    )
  }

  // 3. 项目
  for (const p of db.projects) {
    await query(
      `INSERT INTO projects (id, user_id, name, description, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.userId, p.name, p.description || '', p.createdAt, p.updatedAt],
    )
  }

  // 4. 消息
  for (const m of db.messages) {
    await query(
      `INSERT INTO messages (id, project_id, role, kind, content, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.projectId, m.role, m.kind, m.content, m.createdAt],
    )
  }

  // 5. 应用（旧记录可能没有 files，现场拆分）
  for (const a of db.apps) {
    const files = a.files && a.files.length > 0 ? a.files : splitHtmlToFiles(a.code)
    await query(
      `INSERT INTO apps (id, project_id, name, code, files, version, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.projectId, a.name, a.code, JSON.stringify(files), a.version, a.createdAt],
    )
  }

  // 6. 分享
  for (const s of db.shares) {
    await query(
      `INSERT INTO shares (slug, project_id, app_id, created_at)
       VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING`,
      [s.slug, s.projectId, s.appId, s.createdAt],
    )
  }

  // 7. LLM 配置（兼容旧版单条 llmConfig）+ 当前生效条目
  for (const u of db.users) {
    let configs = u.llmConfigs ?? []
    let activeId = u.activeLLMId ?? null
    if (configs.length === 0 && u.llmConfig) {
      const ts = u.llmConfig.updatedAt || u.createdAt
      configs = [
        {
          id: randomUUID(),
          baseUrl: u.llmConfig.baseUrl,
          model: u.llmConfig.model,
          apiKeyEnc: u.llmConfig.apiKeyEnc,
          createdAt: ts,
          updatedAt: ts,
        },
      ]
      activeId = configs[0].id
    }
    for (const c of configs) {
      await query(
        `INSERT INTO llm_configs (id, user_id, base_url, model, api_key_enc, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [c.id, u.id, c.baseUrl, c.model, rotateApiKey(c.apiKeyEnc), c.createdAt, c.updatedAt],
      )
    }
    if (activeId && configs.some((c) => c.id === activeId)) {
      await query('UPDATE users SET active_llm_id = $1 WHERE id = $2', [activeId, u.id])
    }
  }

  console.log('迁移完成：')
  console.log(`  用户 ${db.users.length} · 项目 ${db.projects.length} · 消息 ${db.messages.length} · 应用 ${db.apps.length}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('迁移失败：', e)
  process.exit(1)
})
