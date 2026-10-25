# 部署手册

面向从零部署或升级 GitStars 的工程师。命令默认在仓库根目录执行。

## 1. 前置条件

- Docker Engine 24+ 与 Docker Compose v2
- 可访问 GitHub API、模型供应商、npm / Maven / PyPI（构建期）
- 一个已备案域名（生产）与 TLS 证书；GitHub OAuth App 的管理权限
- 至少 4 GB 内存（fastembed 首次会下载 embedding 模型到 `model-cache` 卷）

## 2. 首次部署

```bash
cp .env.example .env
# 必填：MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / REDIS_PASSWORD / GITHUB_TOKEN /
#       LLM_API_KEY / AUTH_GITHUB_CLIENT_ID / AUTH_GITHUB_CLIENT_SECRET / INTERNAL_TOKEN
# INTERNAL_TOKEN 建议：openssl rand -hex 32
docker compose up -d --build
docker compose ps
```

启动顺序由 compose 健康检查保证：MySQL/Redis → backend → llm-service / ingest-worker / frontend → Nginx。
MySQL 首次启动会自动执行 `deploy/init.sql`。

### 2.1 GitHub OAuth

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App。
2. Homepage URL：`https://<域名>`。
3. Authorization callback URL：`https://<域名>/api/auth/github/callback`（本地调试用 `http://localhost/api/auth/github/callback`）。
4. `.env` 同步设置：
   ```bash
   AUTH_GITHUB_REDIRECT_URI=https://<域名>/api/auth/github/callback
   APP_FRONTEND_URL=https://<域名>
   SESSION_COOKIE_SECURE=true
   ```

> 回调地址必须与 GitHub 后台完全一致（协议、域名、路径、末尾斜杠），否则登录会停在 GitHub 或回调 401。

### 2.2 HTTPS

生产必须走 HTTPS，否则 `SESSION_COOKIE_SECURE=true` 的会话 Cookie 不会被浏览器发送。
用 [nginx-https.conf.example](../deploy/nginx-https.conf.example) 整体替换 `nginx/nginx.conf`：80 端口 301 到 443，TLS 1.2/1.3，HSTS 一年，保留内部接口隔离与 SSE 配置。

compose 的 `nginx` 服务需要：

```yaml
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
```

证书放在 `./certs/fullchain.pem` 与 `./certs/privkey.pem`（目录权限 700，私钥只读挂载）。
续期后执行 `docker compose exec nginx nginx -s reload`。

### 2.3 首次索引

`ingest-worker` 默认 `INDEX_ON_STARTUP=true`，会为已同步仓库抓取 README / manifest 并写入 Qdrant。
小样本验证可先设 `INDEX_MAX_REPOS=50`，确认日志 `index_run_finished` 正常后再改为 `0`（全量）。

```bash
docker compose logs -f ingest-worker
# 索引完成后可在 /repos 页面搜索，或查看 worker 日志中的 index_run_finished / indexed 计数
```

## 3. 升级

```bash
git pull
docker compose build backend llm-service frontend
docker compose up -d
```

数据库只做增量变更：

- 新库：`deploy/init.sql` 自动创建。
- 旧库：重跑初始化脚本即可（全部 `CREATE TABLE IF NOT EXISTS`）：
  ```bash
  docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < deploy/init.sql
  ```
- M7 起新增 `ai_metrics` 表；不重跑脚本时 `/ops` 会 500，其余功能不受影响。

## 4. 生产上线检查表

- [ ] `SESSION_COOKIE_SECURE=true`，站点仅 HTTPS（HTTP 301）
- [ ] `INTERNAL_TOKEN` 为 32 字节以上随机值；`/api/internal/` 外网返回 404
- [ ] `OPS_GITHUB_LOGINS` 只包含运维账号；未配置时 `/ops` 全部 403
- [ ] `GITHUB_ALLOWED_HOSTS` 仅包含实际使用的 GitHub API 主机
- [ ] `CORS`/前端域名与 `APP_FRONTEND_URL` 一致
- [ ] OAuth 回调地址与 GitHub App 完全一致
- [ ] Nginx 响应头含 `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy`
- [ ] `/_next/image` 返回 404（全站不使用 next/image，已关闭优化器）
- [ ] `docker compose ps` 全部 healthy；`/ai/health` 返回 200
- [ ] 首页、登录、匹配、对比各跑一次真实请求
- [ ] `/ops` 能看到当天请求与 token；预算阈值已按实际预算调整

## 5. 回滚

```bash
docker compose down
git checkout <上一版本 tag>
docker compose up -d --build
```

数据库变更均为新增表/字段，回滚旧镜像不需要删数据。若新版本写入了旧版本不识别的数据，保留即可，不影响旧版本运行。
