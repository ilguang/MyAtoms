# 部署指南

MyAtoms 有两种部署方式：

1. **Vercel Serverless** — 零运维，`vercel` 一键部署（推荐个人用户）
2. **自托管 Node 服务** — Docker / PM2 / systemd，适合团队内网或多实例

---

## 方式 A：Vercel Serverless

### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "feat: initial commit"
git remote add origin https://github.com/<你的用户名>/myatoms.git
git push -u origin main
```

### 2. Vercel 导入

- 登录 https://vercel.com → Add New → Project → 选择仓库
- 框架自动识别为 Vite，**不需要改任何 Build / Output 配置**
- **必须配置环境变量**（见下方）

### 3. Vercel 环境变量

在 Vercel 项目 → Settings → Environment Variables 添加：

| 变量 | 值 | 备注 |
|---|---|---|
| `LLM_ENCRYPTION_KEY` | 32 字节随机字符串 | **必填**，加密所有用户 API Key |
| `SESSION_SECRET` | 随机长字符串 | 可选，跨部署持久化会话 |

> ⚠️ Vercel Serverless 文件系统是**无状态的**（函数执行完即销毁）。
> JSON 数据库存在 `/tmp` 下，实例重启即丢失。
>
> 生产推荐：
> - 方案 1：把 `api/store.ts` 的仓储层改成 SQLite（Vercel KV）或 PostgreSQL（Neon / Supabase）
> - 方案 2：用 Vercel Edge Runtime + Upstash Redis
>
> 详见「数据层替换」一节。

### 4. 域名 & HTTPS

- 在 Vercel → Project → Settings → Domains 绑定自定义域名
- 自动签发 Let's Encrypt 证书，强制 HTTPS

---

## 方式 B：自托管 Node 服务

### 1. 准备

Node.js ≥ 18，服务器能访问外网（调用 LLM + Playwright）。

```bash
git clone https://github.com/<你的用户名>/myatoms.git
cd myatoms
npm ci --omit=dev          # 生产只装 runtime 依赖
```

### 2. 环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
# 必填：32 字节随机
LLM_ENCRYPTION_KEY=production-real-key-32-bytes!!

# 持久化数据目录（确保进程对它有写权限）
DATA_DIR=/var/lib/myatoms/data

# 可选
SESSION_SECRET=some-long-random-string
```

### 3. Playwright 浏览器

```bash
# 仅需 chromium（测试员功能用）
npx playwright install --with-deps chromium
# 或者只装浏览器，不装系统依赖：
PLAYWRIGHT_BROWSERS_PATH=/opt/playwright npx playwright install chromium
```

如果不用 Playwright 真实测试（可跳过），Playwright 会在 Playwright 未安装时优雅降级——生成仍可用，只是不会有自动测试环节。

### 4. 构建 & 启动

```bash
npm run build              # tsc + Vite 构建到 dist/
node --experimental-strip-types api/server.ts
# 或用 npm 脚本：
npm run server:dev         # nodemon 开发模式（带热重载）
```

服务同时托管前端静态资源（`dist/`）和 API（`/api/*`），访问 `http://host:3001` 即可。

### 5. 反向代理（Nginx 示例）

```nginx
server {
  listen 443 ssl;
  server_name myatoms.example.com;

  ssl_certificate     /etc/letsencrypt/live/myatoms.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/myatoms.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE 流式响应：必须关闭缓冲，否则 LLM 思考过程不实时
    proxy_buffering off;
    proxy_cache    off;
    proxy_read_timeout 600s;   # LLM 生成 + 测试 + 修复可能耗几分钟
  }
}
```

### 6. PM2 守护进程（可选）

```bash
npm install -g pm2
pm2 start "node --experimental-strip-types api/server.ts" --name myatoms
pm2 save
pm2 startup     # 按提示执行 systemd 注册命令
```

---

## Docker 自托管

### Dockerfile

```dockerfile
FROM node:20-bookworm-slim

WORKDIR /app

# Playwright 系统依赖（chromium）
RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 \
  libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  fonts-liberation libasound2 libx11-xcb1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Playwright chromium 安装在镜像里
RUN npx playwright install chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    LLM_ENCRYPTION_KEY=change-me-in-runtime

EXPOSE 3001
VOLUME ["/data"]

CMD ["node", "--experimental-strip-types", "api/server.ts"]
```

### docker-compose.yml

```yaml
services:
  myatoms:
    build: .
    ports:
      - "3001:3001"
    environment:
      LLM_ENCRYPTION_KEY: ${LLM_ENCRYPTION_KEY}
      SESSION_SECRET: ${SESSION_SECRET:-}
      DATA_DIR: /data
    volumes:
      - myatoms_data:/data
    restart: unless-stopped

volumes:
  myatoms_data:
```

启动：

```bash
export LLM_ENCRYPTION_KEY=$(node -e "console.log(crypto.randomBytes(32).toString('base64'))")
docker compose up -d
```

---

## 数据层替换（多实例 / Serverless 场景）

默认 JSON 文件存储适用于**单实例**（读-改-写天然串行）。多实例或 Vercel Serverless 需要换成数据库。

改动点只有一处：`api/store.ts` 里的函数签名保持不变（`getLLMConfig` / `saveApp` / `listMessages` 等），把底层 `readDB()/writeDB()` 换成 SQLite 或 Postgres。

推荐方案：

| 场景 | 方案 | 改动量 |
|---|---|---|
| 单实例自托管 | **SQLite**（better-sqlite3） | 小，本地文件 |
| 多实例内网 | PostgreSQL | 中 |
| Vercel Serverless | Vercel Postgres / Neon | 中，Serverless 适配 |

替换步骤（以 SQLite 为例）：

```bash
npm install better-sqlite3
```

创建 `api/sqlite.ts`，把 `readDB/writeDB` 换成 `db.prepare(...)`，然后 `store.ts` 里所有函数改用 SQLite API。其余路由、LLM 调用、前端零改动。

---

## 环境变量速查

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `LLM_ENCRYPTION_KEY` | ✅ | 固定默认值（仅开发） | AES-256-GCM 加密所有用户 API Key；**生产必须改** |
| `DATA_DIR` | ❌ | `./data`（项目根） | JSON 数据库目录 |
| `SESSION_SECRET` | ❌ | — | 会话 token 签名密钥；省略则每次重启用户被登出 |
| `PORT` | ❌ | `3001` | Express 监听端口（仅自托管） |
| `NODE_ENV` | ❌ | — | 设为 `production` 关闭详细错误栈 |

---

## 常见问题

### Q: 我的 LLM 调用报 401 / 403？
用户 API Key 可能过期了。让用户进**设置**页编辑该条目，重新填 Key 即可。

### Q: Playwright 测试器跳过了？
服务端会尝试自动安装 chromium。如果安装失败，生成流程会跳过测试直接产出 HTML，且日志里有 warning。

### Q: 切换模型后 API Key 变空了？
多配置系统里每条是独立的 `baseUrl + model + apiKey` 三元组。切换只是切 active 条目，不会影响其他条目的 Key。

### Q: 数据库备份？
直接拷贝 `DATA_DIR/db.json`（或整个目录）。JSON 格式可人工编辑，注意 `apiKeyEnc` 是密文。
