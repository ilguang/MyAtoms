# 部署指南

MyAtoms 使用 **PostgreSQL** 存储全部数据（用户、会话、项目、应用、加密的 API Key），
本地开发和线上部署都需要准备一个数据库实例。推荐：

- **Vercel 部署** → [Neon](https://neon.tech) 免费 Serverless Postgres（零运维）
- **自托管** → 任意 Postgres（自建 / 云数据库 / Docker postgres）

---

## 方式 A：Vercel + Neon（推荐）

### 1. 创建 Neon 数据库（免费）

1. 注册并登录 https://neon.tech
2. **Create project**（区域选离 Vercel 近的，如 AWS APAC / Singapore）
3. 在 **Connection Details** 里复制连接串，**选择 Pooled connection**（带 `-pooler` 主机名，适配 Serverless 短连接），形如：

   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

### 2. 推送代码到 GitHub

```bash
git add .
git commit -m "feat: migrate storage to PostgreSQL"
git push
```

### 3. Vercel 配置环境变量

Vercel 项目 → **Settings → Environment Variables**，添加：

| 变量                 | 值                                                                                    | 必填 |
| -------------------- | ------------------------------------------------------------------------------------- | ---- |
| `DATABASE_URL`       | Neon 的 **Pooled** 连接串                                                             | ✅   |
| `LLM_ENCRYPTION_KEY` | 32 字节随机字符串：`node -e "console.log(crypto.randomBytes(32).toString('base64'))"` | ✅   |

保存后 **Redeploy**（Deployments → 最新一条 → ⋯ → Redeploy），让新环境变量生效。

### 4. 自动建表

无需手动建表：服务在首次请求时自动执行 `CREATE TABLE IF NOT EXISTS`。
部署后打开站点，注册第一个账号即可验证。

### 5. 关于 Playwright 真实测试

Vercel Serverless 没有 chromium，**自动测试环节会被跳过**（生成功能完全正常，
日志里有 `[tester] chromium 不可用` 的 warning）。如需测试-自动修复闭环，
用方式 B 自托管并安装 chromium。

### 6. 自定义域名

Settings → Domains 绑定域名，自动签发 HTTPS 证书。

---

## 方式 B：自托管（Node 服务 / Docker）

### 1. 准备 Postgres

任选其一：

```bash
# Docker 快速起一个
docker run -d --name myatoms-pg -e POSTGRES_PASSWORD=pgpass -e POSTGRES_DB=myatoms \
  -p 5432:5432 -v myatoms_pgdata:/var/lib/postgresql/data postgres:16
```

连接串：`postgresql://postgres:pgpass@localhost:5432/myatoms`

### 2. 配置环境变量

```bash
cp .env.example .env
```

填入 `DATABASE_URL` 与 `LLM_ENCRYPTION_KEY`。

### 3. 安装依赖与 Playwright（可选但推荐）

```bash
npm ci
npx playwright install --with-deps chromium   # 真实测试闭环；不需要可跳过
```

### 4. 启动

```bash
npm run build
node --experimental-strip-types server/server.ts
# 或开发模式：npm run dev
```

服务同时托管前端（`dist/`）与 API，访问 `http://host:3001`。
表结构在首次请求时自动创建。

### 5. Nginx 反代要点

SSE 流式响应必须关缓冲，否则智能体思考过程不实时：

```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_buffering off;
  proxy_cache    off;
  proxy_read_timeout 600s;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 6. PM2 守护

```bash
pm2 start "node --experimental-strip-types server/server.ts" --name myatoms
pm2 save && pm2 startup
```

---

## Docker Compose（自托管一键）

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: pgpass
      POSTGRES_DB: myatoms
    volumes:
      - myatoms_pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:pgpass@db:5432/myatoms
      LLM_ENCRYPTION_KEY: ${LLM_ENCRYPTION_KEY}
    depends_on:
      - db
    restart: unless-stopped

volumes:
  myatoms_pgdata:
```

Dockerfile 参考：Node 20 + Playwright 系统依赖 + `npm run build` +
`CMD ["node", "--experimental-strip-types", "server/server.ts"]`（完整 Dockerfile 见下方附录）。

---

## 从旧版 JSON 存储迁移（升级老用户）

如果你之前跑过 JSON 文件版本（本地 `data/db.json` 里有账号/项目），
升级到 Postgres 版后执行一次性导入（幂等，可重复跑）：

```bash
# 1. .env 配好 DATABASE_URL（指向要迁入的目标库）
# 2. 配好新的 LLM_ENCRYPTION_KEY（随机值，之后 Vercel 用同一个）
#    旧版本地数据是在没有 .env 时用代码内置默认密钥加密的，迁移脚本会自动
#    用旧默认密钥解开、用新 LLM_ENCRYPTION_KEY 重新加密。
#    若你以前自定义过密钥，用 OLD_LLM_ENCRYPTION_KEY 显式指定旧值。
# 3. 执行
npm run migrate
```

脚本会迁移：用户、会话、项目、消息、应用（旧应用自动拆分成 index.html/style.css/script.js
文件结构）、分享链接、LLM 配置（旧版单条 `llmConfig` 自动升级为多配置数组）。

---

## 环境变量速查

| 变量                     | 必填 | 说明                                                     |
| ------------------------ | ---- | -------------------------------------------------------- |
| `DATABASE_URL`           | ✅   | Postgres 连接串；Serverless 用 Pooled 地址               |
| `LLM_ENCRYPTION_KEY`     | ✅   | AES-256-GCM 加密用户 API Key 的主密钥；各环境保持一致    |
| `PORT`                   | ❌   | 自托管监听端口，默认 3001                                |
| `NODE_ENV`               | ❌   | 设为 `production` 时错误响应不返回详细信息               |
| `DATA_DIR`               | ❌   | 仅迁移脚本用：旧 `db.json` 所在目录                      |
| `OLD_LLM_ENCRYPTION_KEY` | ❌   | 仅迁移脚本用：旧自定义加密密钥；不填则按代码内置开发密钥 |

---

## 常见问题

### Q: 登录/注册返回 Server internal error？

99% 是 `DATABASE_URL` 没配或连不上。检查：

1. Vercel 环境变量是否在**最新一次 Deployment** 中生效（改完变量要 Redeploy）
2. Vercel → Deployments → Functions 日志里是否有 `password authentication failed` / `ENOTFOUND`
3. 是否误用了 Neon 的 Direct 连接串（请用带 `-pooler` 的 Pooled 串）

### Q: 注册成功但刷新后掉登录？

会话写在 Postgres，正常不会。若仍出现，确认不是浏览器装了清 Cookie 的插件，
以及本地/Vercel 用的是同一个数据库。

### Q: 之前配置的 LLM API Key 变成 `****` 且无法调用？

`LLM_ENCRYPTION_KEY` 在各环境不一致，旧密文解不开。把所有环境改成同一个密钥，
或直接到设置页删除旧条目重新填写。

### Q: 本地开发可以不装数据库吗？

不可以。直接注册一个 Neon 免费库，本地 `.env` 填线上连接串即可（延迟很低）；
或用 Docker 起本地 Postgres。

---

## 附录：Dockerfile

```dockerfile
FROM node:20-bookworm-slim

WORKDIR /app

# Playwright(chromium) 运行所需系统库
RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 \
  libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  fonts-liberation libasound2 libx11-xcb1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "--experimental-strip-types", "server/server.ts"]
```
