# MyAtoms

> 自然语言驱动 AI 智能体团队，一键生成可运行、可编辑、可分享的网页应用。

## ✨ 功能亮点

- **多智能体流式协作** — 研究员 → 产品经理 → 架构师 → 工程师 → 测试，思考过程实时流式输出
- **真实浏览器测试闭环** — Playwright 无头浏览器跑生成的 HTML，发现 bug 自动修复（最多 3 轮）
- **多 LLM 配置** — 可同时管理多个供应商/模型 + 各自独立 API Key，工作台一键切换
- **内置代码编辑器** — Monaco Editor + 文件树（index.html / style.css / script.js），编辑即预览
- **代码加密存储** — API Key 经 AES-256-GCM 加密，密钥通过环境变量注入
- **公开分享链接** — 无需登录即可访问生成的应用

## 🧰 技术栈

| 层   | 技术                                                                                |
| ---- | ----------------------------------------------------------------------------------- |
| 前端 | React 18 · TypeScript · Vite · TailwindCSS · Zustand · React Router · Monaco Editor |
| 后端 | Express 4（ESM + TSX）· 自托管 Vite 产物                                            |
| 数据 | PostgreSQL（Neon 等云库或自建；首次请求自动建表）                                   |
| 测试 | Playwright chromium 无头浏览器（未安装时自动跳过）                                  |
| 部署 | Vercel（Serverless）或任意 Node 托管                                                |

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
# Playwright 真实测试需要 chromium（仅跑开发/预览可跳过）
npx playwright install chromium
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，**必须**设置两项：

```bash
# 生成 LLM_ENCRYPTION_KEY 随机值（32 字节，用于加密存储所有用户的 API Key）
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

- `DATABASE_URL` — PostgreSQL 连接串。没有本地 Postgres 可直接注册 [Neon](https://neon.tech) 免费库（本地 `.env` 填线上串即可），或 `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pgpass -e POSTGRES_DB=myatoms postgres:16`
- `LLM_ENCRYPTION_KEY` — 上面命令生成的随机串

表结构在服务首次请求时自动创建，无需手动建表。

### 3. 启动开发

```bash
npm run dev
# 前端  http://localhost:5173  (Vite dev server + proxy 到 3001)
# 后端  http://localhost:3001  (Express API)
```

浏览器打开 `http://localhost:5173`，注册账号后进入**设置**页填入你的 LLM API Key 即可使用。

### 4. 构建 & 生产模式

```bash
npm run build       # tsc 类型检查 + Vite 构建到 dist/
npm run server:dev  # 启动 Express（同时托管 dist/ 和 /api）
```

生产模式访问 `http://localhost:3001`（同源，无 CORS）。

## 🔑 配置多个 LLM API Key

进入 **设置** 页，你可以：

- **新增** — 选择供应商预设（OpenAI / DeepSeek / 通义千问 / 智谱 GLM / Kimi / SiliconFlow）快填 baseUrl + model，填 API Key 后添加
- **切换当前** — 列表里点「使用」按钮，该条目成为当前生效配置，所有生成/修复调用用它的 Key
- **编辑** — API Key **留空表示不变**（不用重贴），仅修改 baseUrl / model 即可
- **删除** — 删的是当前条目时自动回落到剩余第一条

工作台输入框旁的模型徽章列出**已配置的全部条目**，点击即切换当前。

> ⚠️ 每个条目是一组独立的 `baseUrl + model + apiKey`，经 AES-256-GCM 加密后存入 PostgreSQL。

## 📁 目录结构

```
├── api/                    Express 后端
│   ├── index.ts            Vercel Serverless 入口
│   ├── server.ts           自托管入口（托管 dist/ + /api）
│   ├── db.ts               PostgreSQL 连接池 + 自动建表 + 行映射
│   ├── store.ts            数据仓储层（用户/项目/消息/应用/LLM 配置）
│   ├── llm.ts              LLM 流式调用（含智能体协作 SYSTEM_PROMPT）
│   ├── tester.ts           Playwright 真实测试；无 chromium 时返回 null 自动跳过
│   ├── asyncHandler.ts     async 路由错误捕获
│   ├── middleware/auth.ts   会话鉴权
│   └── routes/             Express 路由（auth / projects / llm / share）
├── scripts/
│   └── migrate-json-to-pg.ts  旧版 data/db.json → PostgreSQL 一次性迁移（npm run migrate）
├── src/                    前端源码
│   ├── pages/              路由页面（Landing / Login / Projects / Workspace / Settings / Share）
│   ├── lib/                共享模块（API 客户端、鉴权状态、类型、Monaco 配置、HTML 拆分/组装）
│   ├── components/         UI 组件（CodePreview + Monaco 文件树、AgentAvatar、基础组件）
│   └── main.tsx            入口
├── dist/                   构建产物
├── .env.example            环境变量模板
├── vercel.json             Vercel 部署配置
└── package.json
```

## 🔐 安全说明

- 所有用户 API Key 在存储前经 **AES-256-GCM** 加密，格式 `ivHex:tagHex:encHex`
- 加密主密钥从环境变量 `LLM_ENCRYPTION_KEY` 读取，**生产必须设置**，绝不能用仓库内置默认值
- 后端对前端只返回脱敏 Key（如 `sk-g****cdef`），调用 LLM 时才在服务端解密
- 密码用 scrypt + 随机 salt 哈希存储
- 会话 token 有 30 天有效期

## 🏗️ 部署

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)（Vercel + Neon / 自托管 / 旧版 JSON 数据迁移 / 环境变量配置）。

## 🧪 本地测试

Playwright 真实测试在每次生成后自动执行，无需手动跑。

手动验证 API：

```bash
# 登录拿 token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"你注册的邮箱","password":"你的密码"}'

# 查看 LLM 配置列表
curl http://localhost:3001/api/llm/configs \
  -H "Authorization: Bearer <token>"
```

## 📄 License

MIT — 随意修改和使用。
