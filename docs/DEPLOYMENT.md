# 学科工具箱 · 生产部署指南

> 本文面向校内信息技术组 / 运维人员，讲清楚如何把这套「学科工具箱运营控制台」（`SubjectToolbox-dash`）部署到一台长期在线的服务器上，并用 HTTPS 提供给 Android 客户端（`SubjectToolbox`）和控制台管理员使用。
>
> 开发模式、功能清单、接口说明见 [仓库 README](../README.md)；客户端侧如何接入见 STB 仓库 README 的「云端接入」一节。

## 0. 部署形态

```
Android 客户端 ──HTTPS──▶ Nginx（443，反代） ──HTTP──▶ Node + Fastify（127.0.0.1:8787） ──▶ data/console.db（SQLite WAL）
管理员浏览器  ──HTTPS──▶      同上              （控制台静态页由本服务托管 dist/web）
```

- **一个 Node 进程**同时提供 `/api`（控制台）、`/v1`（客户端）和构建后的控制台前端（`dist/web`）；
- **一个 SQLite 文件**存全部业务数据（`data/console.db`），无外部数据库、无 Redis；
- **单实例部署**：SQLite WAL 适合校内小规模（数百台平板），不支持多进程 / 多机同时读写同一数据目录；
- 生产模式由 `STB_ENV=production`（或 `NODE_ENV=production`）开启，行为差异见第 3、4 节。

## 1. 运行要求

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | **24 LTS 推荐**（README 口径为 24+） | 服务端使用内置 `node:sqlite`，不需要编译原生模块；该模块从 Node 22.5 起提供（22.x 会打印 `ExperimentalWarning: SQLite is an experimental feature`），本机 Node **22.14.0 实测可正常运行**，但生产建议直接用 Node 24，避免实验特性差异 |
| pnpm | **10+** | 仓库带 `pnpm-lock.yaml`，用 `pnpm install --frozen-lockfile` 安装；实测 pnpm 10.10.0 |
| 数据目录 | 可写，建议独立挂载 | 默认 `<仓库根>/data`，可用 `STB_DATA_DIR` 指定；首次启动自动创建 `data/`、`data/uploads/` 与数据库 |
| 实例数 | **1 个** | 单实例 SQLite；进程守护不要配置多 worker，也不要在别处同时运行 `pnpm start` / `pnpm seed` 指向同一数据目录 |
| 操作系统 | Linux（systemd）或 Windows | Windows 可用任务计划 / NSSM / PM2 托管；两平台命令基本一致 |
| 磁盘 | 预留 1–2 GB 起 | 事件表会持续增长（每台设备约 10 分钟一批），留存策略不会自动执行（见 7.4） |
| 时钟 | 必须 NTP 同步 | 公告时间窗、审计时间、下发给客户端的 `serverTime` 都按服务器时间计算 |
| 网络 | 入站 443（反代）；`HOST` 默认只监听 `127.0.0.1` | 客户端只访问 `/v1/*`，控制台只访问 `/api/*` 与静态页 |

> 不要把 `node_modules`、`data/`、`dist/` 提交进 Git；三者均已在 `.gitignore` 中（`data/` 下还有自动生成的密钥文件，见 4.2，注意不要入库）。

## 2. 获取代码与构建

```bash
# 1. 取代码（内网可用 U 盘/内网 Git 拷贝整个仓库）
cd /opt
git clone <仓库地址> SubjectToolbox-dash
cd SubjectToolbox-dash

# 2. 校验工具链
node -v     # 建议 v24.x；v22.14 实测可用
pnpm -v     # 建议 10.x

# 3. 安装依赖（必须带 lockfile，保证与测试时一致）
pnpm install --frozen-lockfile

# 4. 类型检查 + 构建控制台前端
pnpm typecheck
pnpm build

# 5. 启动（前台；正式部署请用第 6 节的进程守护）
pnpm start
```

- `pnpm build` 就是 `vite build`，产物输出到 **`dist/web`**；服务启动时若检测到 `dist/web` 会自动静态托管。**没构建时 API 仍可用，但浏览器打开首页只会看到「前端尚未构建」提示**，所以生产部署必须执行 `pnpm build`。
- `pnpm typecheck` 会分别检查服务端（`tsconfig.server.json`）和前端（`tsconfig.web.json`）。
- **不要用 `NODE_ENV=production pnpm install` / `pnpm install --prod`**：`pnpm start` 实际执行的是 `tsx server/index.ts`，而 `tsx` 在 `devDependencies` 里；省掉开发依赖会导致服务无法启动。若确实想只装生产依赖，需要改用 `node --experimental-strip-types server/index.ts` 之类方案（不推荐，本文不展开）。
- 内网/离线部署：先在一台有网机器完成 `pnpm install`，再把整个仓库（含 `node_modules`）拷到服务器；或在服务器配置内网 npm 源。
- 离线安装后同样要执行 `pnpm build`，构建过程不需要外网（Tailwind/React 依赖都已在 `node_modules` 中）。

## 3. 开发模式与生产模式

两种模式的切换只取决于环境变量 `STB_ENV` / `NODE_ENV`：

| | 开发 / 演示模式（默认） | 生产模式（`STB_ENV=production` 或 `NODE_ENV=production`） |
| --- | --- | --- |
| 首次启动 | `ensureSeeded()`：空库时自动播种演示数据 | `bootstrapProduction()`：只创建「能登录、能下发配置、能接收上报」的最小环境，**不写任何演示数据** |
| 演示账号 | 5 个（`admin` / `chenwei` / `liuyan` / `zhaolei` / `wangjing`），登录页「演示账号」块可一键填入 | 无 |
| 演示数据 | 320 台设备、约 60 天遥测、320 条崩溃、58 条反馈、3 条配置修订 | 无（设备 / 事件 / 崩溃 / 反馈均为 0） |
| 演示密钥 | 写入 `data/seed-credentials.txt` | 无；改为生成生产密钥并写入 `data/initial-client-key.txt` |
| 重建演示数据 | 「设置 → 演示数据」或 `POST /api/system/reset-demo` | 设置页不显示演示数据 tab，接口返回 **403** `not_available` |
| `/api/public/meta` | `demoMode: true`、`demoAccount` 有值 | `production: true`、`demoMode: false`、`demoAccount: null` |
| Session Cookie | 不带 `Secure`（方便本机 HTTP 调试） | 自动带 **`Secure`**（HttpOnly、SameSite=Lax、7 天）→ **必须走 HTTPS**，否则浏览器不保存 Cookie、登录后仍是未登录 |
| `pnpm seed` | 正常重建演示数据 | 拒绝执行并 `exit 1`（见 4.5） |

常用命令：

```bash
pnpm dev        # 开发：tsx watch 服务端(8787) + Vite(5173)，浏览器开 http://127.0.0.1:5173
pnpm start      # 启动服务（生产/联调均可），监听 HOST:PORT，默认 127.0.0.1:8787
pnpm seed       # 开发模式清空并重建演示数据（生产模式拒绝）
pnpm typecheck  # 服务端 + 前端 TypeScript 检查
pnpm build      # 构建控制台前端到 dist/web
```

## 4. 生产模式首次启动

### 4.1 启动方式（Linux 示例）

```bash
cd /opt/SubjectToolbox-dash

export STB_ENV=production            # 也可以用 NODE_ENV=production
export HOST=127.0.0.1                # 默认值，交给 Nginx 反代
export PORT=8787                     # 默认值
export STB_DATA_DIR=/var/lib/subjecttoolbox   # 可选；默认 <仓库根>/data
export STB_ADMIN_USER=admin          # 可选；默认 admin
export STB_ADMIN_PASSWORD='换成强密码'  # 可选；不设置则随机生成 16 位
export STB_WORKSPACE_NAME='市第二中学'  # 可选；控制台显示的工作区名
export STB_ORG_NAME='信息技术组'        # 可选；控制台显示的组织名

pnpm start
```

首次启动会在控制台打印类似日志（创建了哪些东西才打印对应行）：

```
[migrate] 补列 device_tool_overrides.reason · 修订归一化 0 条 · 草稿归一化 否 · 损坏跳过 0 条
[boot] 生产模式：未写入演示数据
[boot] 已创建管理员账号 admin，初始密码见 /var/lib/subjecttoolbox/initial-admin.txt（首次登录后请修改）
[boot] 已创建初始配置修订 #1（全部工具启用）
[boot] 已生成生产客户端密钥，完整密钥见 /var/lib/subjecttoolbox/initial-client-key.txt

  学科工具箱 · 运营控制台
  运行模式 生产环境（不播种演示数据）
  控制台   http://127.0.0.1:8787
  客户端   http://127.0.0.1:8787/v1/health
  前端产物 已托管 dist/web
```

生产初始化是**幂等**的：之后重启不会重复创建账号 / 修订 / 密钥，也不会重写两个初始化文件。

### 4.2 首次启动生成的文件

初始化文件写在数据目录（默认 `data/`，设置 `STB_DATA_DIR` 后为其值）下：

| 文件 | 内容 | 权限 / 注意事项 |
| --- | --- | --- |
| `<数据目录>/initial-admin.txt` | 管理员用户名、初始密码、登录地址、生成时间；提示首次登录后立即改密（该账号已标记 `must_change_password=1`） | 代码尝试写入 `0600`，启动时 `chmod 0600`（Windows 上 `chmod` 基本为空操作，请用 ACL 限制）；**记录密码后删除本文件或限制访问** |
| `<数据目录>/initial-client-key.txt` | 生产客户端密钥完整值（`stb_live_…`）、名称、前缀、创建时间；注明在请求头 `X-STB-Key` 中携带 | 服务端只存密钥的 SHA-256 摘要，**完整密钥只在这里出现一次**；配置到客户端后妥善保管，并在控制台轮换时作废 |
| `<数据目录>/console.db`（+ `console.db-wal` / `console.db-shm`） | SQLite 数据库（WAL 模式） | 定期备份，见第 7 节 |
| `<数据目录>/uploads/` | 反馈附件目录（预留） | 与数据库一起备份 |

登录地址取 `STB_PUBLIC_URL`，未设置时拼成 `http://HOST:PORT`。生产环境建议设置成真实 HTTPS 地址，方便运维按文件里的地址登录，例如：

```bash
export STB_PUBLIC_URL=https://stb.mcobs.cn
```

拿到初始密码后：**立即登录控制台 →「设置 → 安全」修改密码**。控制台不会强制拦截其它操作，但 `must_change_password=1` 就是给这一步用的；改完后再删除 `initial-admin.txt`。

### 4.3 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `STB_ENV` | 空（开发 / 演示） | 设为 `production` 开启生产模式 |
| `NODE_ENV` | 空 | 设为 `production` 同样开启生产模式（与 `STB_ENV` 等价） |
| `HOST` | `127.0.0.1` | 监听地址；放在反代后保持回环地址，不要直接 `0.0.0.0` 暴露公网 |
| `PORT` | `8787` | 监听端口；反代 `proxy_pass` 要与之对应 |
| `STB_DATA_DIR` | `<仓库根>/data` | 数据目录覆写；可写绝对路径，也可写相对仓库根的路径；目录不存在会自动创建 |
| `STB_ADMIN_USER` | `admin` | **仅首次初始化（users 表为空）时使用**；之后改环境变量不会改已有账号 |
| `STB_ADMIN_PASSWORD` | 随机 16 位 | 同上，仅首次初始化使用；不设置时会生成随机密码写进 `initial-admin.txt` |
| `STB_PUBLIC_URL` | `http://HOST:PORT` | 仅用于 `initial-admin.txt` 里展示的登录地址（去掉末尾 `/`）；不影响服务监听 |
| `STB_WORKSPACE_NAME` | 不覆盖 | 每次启动时若设置了就写入控制台「工作区名称」（≤80 字）；不设置则保留默认 / 控制台里修改的值 |
| `STB_ORG_NAME` | 不覆盖 | 同上，「组织名称」（≤120 字） |
| `STB_ALLOW_ANONYMOUS` | 不设置（关闭） | 设为 `1` 时**每次启动强制开启**匿名上报（`allow_anonymous_ingest=1`）；不设置时生产模式**首次初始化写 0（关闭）**，之后在控制台「系统设置 → 允许匿名上报」里改的值会保留，重启不会被覆盖 |

> 生产默认**关闭匿名上报**：客户端请求 `/v1/telemetry/*`、`/v1/config`、`/v1/feedback` 时必须携带有效的 `X-STB-Key`，否则返回 401 `missing_api_key`。`/v1/health` 不需要密钥，可直接用于探活。

### 4.4 确认「没有演示数据」

```bash
# 1) 公开元信息：production=true、demoMode=false、demoAccount=null、counts 全 0
curl -s http://127.0.0.1:8787/api/public/meta

# 2) 健康检查（公开，无需密钥）：revision=1
curl -s http://127.0.0.1:8787/v1/health

# 3) 重建演示数据接口在生产环境必须 403
curl -s -o - -w '\nHTTP %{http_code}\n' -X POST http://127.0.0.1:8787/api/system/reset-demo \
  -H 'Content-Type: application/json' -d '{"confirm":"RESET"}'
# → {"error":{"code":"not_available","message":"生产环境不允许重建演示数据"}}  HTTP 403
```

另外，登录页会显示「生产环境 · 演示数据已关闭」小字、不再显示「演示账号」块；超级管理员的「设置」里也没有「演示数据」tab；「设置 → 系统设置 → 系统状态 / 数据规模」里设备、事件、反馈、崩溃都是 0，成员 1、修订 1。

### 4.5 从开发模式切换过来（一定要看）

生产模式**不会删除**数据目录里已经存在的演示数据。如果之前用开发模式在同一个 `data/` 下跑过，再设置 `STB_ENV=production` 重启，会出现「看起来像生产、其实还是演示库」的情况：

- `bootstrapProduction()` 每次启动都会把 `demo_seeded_at` 清空 → `/api/public/meta` 的 `demoAccount` 变 `null`、登录页不再显示演示账号块；
- 但数据库里的 **5 个演示账号、320 台演示设备、演示反馈/遥测、3 条演示配置修订仍然存在**，`admin / STB-admin-2026` 等账号照样能登录；控制台「数据规模」里能看到这些历史数据。

要得到干净的生产环境，**换一个全新的数据目录**：

```bash
# 推荐：给生产单独指定一个空目录
STB_DATA_DIR=/var/lib/subjecttoolbox pnpm start
```

或者备份后删除 `data/console.db`（及 `-wal`/`-shm`）重新初始化；或者在开发模式控制台里用「数据管理 → 设备档案」等做过清理并确认数据为 0。**不要**用 `pnpm seed --force` 来「清理」——它是重建演示数据，不是清空。

生产模式下直接运行 `pnpm seed` 会被拒绝（打印「生产模式…拒绝写入演示数据」并 `exit 1`）；只有显式加 `--force` 才会强行清空并播种（会删除业务数据，仅演示 / 测试环境使用）。

## 5. 反向代理与 HTTPS

### 5.1 为什么必须 HTTPS

- 生产模式的 Session Cookie 固定为 `Secure; HttpOnly; SameSite=Lax`。通过 `http://` 访问时浏览器**不会保存**这个 Cookie，表现就是「登录成功但一刷新又回到登录页 / 接口一直 401」。
- 客户端 release 包默认请求 `http://stb.mcobs.cn`，靠客户端手动跟随 301/302/307/308 跳转；HTTP 首跳是明文，如果客户端已经配置了 `stb.apiKey`，密钥会明文发一次。**建议把客户端 release 地址改成 `https://stb.mcobs.cn` 后重新打包**（见第 9 节）。

### 5.2 Nginx 示例

```nginx
# /etc/nginx/conf.d/stb.conf

# HTTP → HTTPS（用 308 保留请求方法；301 也行，客户端两种都跟随）
server {
    listen 80;
    listen [::]:80;
    server_name stb.mcobs.cn;
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name stb.mcobs.cn;

    ssl_certificate     /etc/letsencrypt/live/stb.mcobs.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stb.mcobs.cn/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:10m;

    # 与服务端 Fastify bodyLimit（2 MB）保持一致，避免 413
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

要点：

1. **`/api`、`/v1` 不要做任何 rewrite**：服务端按原始路径匹配接口；`/v1/*` 是客户端接口，路径一改客户端就 404。
2. **必须转发 `Host` 与 `X-Forwarded-Proto`**：服务端开启了 `trustProxy`，`request.protocol`、审计 IP、`/api/integration` 里展示的接入地址都依赖这两个头；漏了 `X-Forwarded-Proto` 会出现协议判断错误。
3. **`client_max_body_size 2m`** 对应服务端的 2 MB 请求体上限；遥测批量上报和反馈文本都在 2 MB 以内，超限会得到 413。
4. **证书 SNI 必须匹配客户端访问的域名**：证书要签给 `stb.mcobs.cn`（或实际使用的域名）。若用 CNAME/ALIAS 指到另一台主机或 CDN，也要保证该主机的证书就是这个名字，不能用别的域名证书顶替。
5. 建议加 HSTS（确认全站 HTTPS 后再开）：`add_header Strict-Transport-Security "max-age=31536000" always;`
6. 控制台和 API 用同一个域名即可；如果一定要拆开，注意控制台 Cookie 的域名与 `/api` 的同源关系，别让登录态跨域丢失。

### 5.3 HTTPS 验证

```bash
# 1) 证书 / 反代 / 路径都通（无需密钥）
curl -sI https://stb.mcobs.cn/v1/health
curl -s  https://stb.mcobs.cn/v1/health          # {"ok":true,"time":"…","revision":1}

# 2) 登录后 Set-Cookie 必须带 Secure
curl -s -D - -o /dev/null -X POST https://stb.mcobs.cn/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"…"}'
# set-cookie: stb_console_session=…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax

# 3) 证书续期（Let's Encrypt）
sudo certbot renew --dry-run
```

## 6. 进程守护

### 6.1 systemd（Linux，推荐）

```ini
# /etc/systemd/system/subjecttoolbox-console.service
[Unit]
Description=SubjectToolbox Console (学科工具箱运营控制台)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=stb
Group=stb
WorkingDirectory=/opt/SubjectToolbox-dash
Environment=STB_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=STB_DATA_DIR=/var/lib/subjecttoolbox
# 建议把敏感配置放独立文件，并 chmod 600
# EnvironmentFile=/etc/subjecttoolbox/console.env
# EnvironmentFile 里写：STB_ADMIN_PASSWORD=… / STB_PUBLIC_URL=https://stb.mcobs.cn
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin stb
sudo mkdir -p /var/lib/subjecttoolbox && sudo chown stb:stb /var/lib/subjecttoolbox && sudo chmod 700 /var/lib/subjecttoolbox
sudo systemctl daemon-reload
sudo systemctl enable --now subjecttoolbox-console
systemctl status subjecttoolbox-console
journalctl -u subjecttoolbox-console -f        # 看启动日志与 [migrate] / [boot] 输出
```

说明：

- 如果 `pnpm` / `node` 不在 `/usr/bin`（例如用 nvm 安装），把 `ExecStart` 换成绝对路径，或在 unit 里补 `Environment=PATH=…`。也可以绕开 pnpm 直接启动 tsx：`ExecStart=/opt/SubjectToolbox-dash/node_modules/.bin/tsx server/index.ts`（等价于 `/usr/bin/node /opt/SubjectToolbox-dash/node_modules/tsx/dist/cli.mjs server/index.ts`）。
- 服务端已经处理 `SIGTERM`/`SIGINT`：收到信号会关闭 HTTP 服务、关闭数据库后退出，`systemctl stop/restart` 是安全停服。
- `Restart=always` 足够；**不要**配置多个实例/多 worker，更不要在同一数据目录上再手工起一个 `pnpm start`。
- 数据目录权限：属主为服务账户、`chmod 700`；初始化密钥文件按 4.2 处理。

### 6.2 Windows（可选）

- **任务计划程序**：创建「开机启动、不管用户是否登录」的任务，操作填 `pnpm`，参数 `start`，起始于仓库目录，并把环境变量（`STB_ENV=production` 等）配在任务或系统环境变量里；日志用 `pnpm start > logs\console.log 2>&1` 重定向（建议配合日志轮转）。
- **NSSM / PM2**：也可注册成 Windows 服务，工作目录同样设为仓库根，并确保数据目录对服务账户可写（Windows 的 `chmod 0600` 不生效，用文件 ACL 限制 `initial-*.txt` 的读取）。
- 生产环境同样建议放在 Nginx/IIS 反代之后，只监听 `127.0.0.1`。

## 7. 备份、升级、回滚

### 7.1 备份

SQLite 处于 WAL 模式，数据库由 `console.db` + `console.db-wal` + `console.db-shm` 组成。**不要只拷一个正在使用的 `console.db`**。

- **方案 A（推荐，最简单）**：停服后整目录打包。

  ```bash
  sudo systemctl stop subjecttoolbox-console
  sudo tar czf /backup/stb-data-$(date +%F).tar.gz -C /var/lib subjecttoolbox
  sudo systemctl start subjecttoolbox-console
  ```

  备份里包含 `console.db`、`uploads/`，以及 `initial-admin.txt` / `initial-client-key.txt`（**含明文密钥，注意备份介质的权限与加密**）。

- **方案 B（不停服）**：用 SQLite 在线备份命令生成一致快照，再单独备份 `uploads/`：

  ```bash
  sqlite3 /var/lib/subjecttoolbox/console.db ".backup '/backup/console.db'"
  # 校验
  sqlite3 /backup/console.db 'PRAGMA integrity_check;'   # 期望 ok
  ```

- 备份频率：建议每天一次 + 升级前必做；至少保留最近 7 份、跨月保留 1 份。
- **恢复**：停服 → 把备份的 `console.db`（连同同批次的 `-wal`/`-shm`，或直接恢复整个数据目录）放回数据目录 → 启动。

### 7.2 升级

```bash
sudo systemctl stop subjecttoolbox-console      # 1) 停服
# 2) 备份（见 7.1）
cd /opt/SubjectToolbox-dash
git pull                                        # 3) 更新代码（或解包新版本）
pnpm install --frozen-lockfile                  # 4) 同步依赖
pnpm typecheck && pnpm build                    # 5) 检查 + 构建 dist/web
sudo systemctl start subjecttoolbox-console     # 6) 启动
journalctl -u subjecttoolbox-console -n 50      # 7) 确认 [migrate] 与启动完成
curl -s https://stb.mcobs.cn/v1/health          # 8) 探活
```

- 启动流程最前面会自动执行**幂等数据库迁移**：补 `device_tool_overrides.reason` 列、用当前校验规则归一化历史配置修订与草稿（补默认工具条目、按目录顺序重排）；日志会打印 `[migrate]` 一行。损坏的配置 JSON 会被跳过并保留原样，不会因此启动失败。
- 升级窗口建议选低峰时段：客户端配置最多 6 小时同步一次，短暂停服对客户端影响很小（离线时会用本地缓存）。

### 7.3 回滚

1. **备份先行**：回滚前再备份一次当前数据目录。
2. **代码回滚**：`git checkout <上一版本 tag/commit>` → `pnpm install --frozen-lockfile` → `pnpm build` → 重启。
3. **数据库回滚**：如果升级后已有不兼容的数据变更，停服后用升级前的数据库备份恢复（恢复整个 `data/` 最稳）。
4. 回滚后再 `curl https://…/v1/health` 探活，并在控制台确认「配置概览」能正常打开。

### 7.4 数据留存与清理

- 控制台「系统设置 → 数据留存」的 `retention_days`（默认 180 天，可设 30–3650）**目前只保存配置，不会自动删除历史数据**，这是已知限制。
- 需要定期清理时：
  - 手工：控制台「系统 → 数据管理」按类别清除遥测事件、崩溃、反馈、工具清单同步、设备档案、审计日志，需输入 `CLEAR` 确认；清除后会执行 `wal_checkpoint(TRUNCATE)` + `VACUUM` 收缩数据库。
  - 定时：自己写 cron 调用管理接口（`POST /api/system/purge` 需要登录会话 Cookie 且 `confirm=CLEAR`，不适合裸 cron），或按学期人工清理。
- 长期不清理时 `events` 表会持续增长；关注「设置 → 系统状态」里的数据库体积与磁盘剩余空间。

## 8. 安全清单（部署完逐项确认）

- [ ] **HTTPS 全站生效**：HTTP 已 301/308 跳到 HTTPS；控制台和客户端都走 `https://`。
- [ ] **登录态正常**：HTTPS 登录后刷新仍保持登录；`Set-Cookie` 带 `Secure; HttpOnly; SameSite=Lax`。
- [ ] **改初始管理员密码**：用 `initial-admin.txt` 登录后立即在「设置 → 安全」改密；未把初始密码发到学生群/公开文档。
- [ ] **处理初始化密钥文件**：`initial-admin.txt` 与 `initial-client-key.txt` 记录后删除或限制访问；两个文件都**不要提交进 Git**（当前 `.gitignore` 只忽略了 `data/*.db` 等，建议把 `data/initial-*.txt` 也加进去，或整个 `data/` 不入库）。
- [ ] **确认无演示数据**：`/api/public/meta` 返回 `production: true`、`demoAccount: null`、counts 全 0；`POST /api/system/reset-demo` 返回 403；用了全新 `STB_DATA_DIR`（不是从开发模式的数据目录切过来的）。
- [ ] **吊销/轮换演示密钥**：开发模式 `data/seed-credentials.txt` 里的演示密钥**绝不带到生产**；生产使用 `initial-client-key.txt` 的密钥，确认客户端生效后可在「设置 → 接入密钥」轮换并吊销旧密钥。
- [ ] **客户端密钥已配置**：生产默认关闭匿名上报，`local.properties` 已填 `stb.apiKey`（或 MDM 下发）并重新打包；未随意设置 `STB_ALLOW_ANONYMOUS=1`。
- [ ] **控制台不直接暴露公网**：服务只监听 `127.0.0.1:8787`，公网只有 443 反代；如需远程管理，走 VPN / 堡垒机 / IP 白名单。
- [ ] **单实例**：只有一个服务进程持有数据目录；没有别处运行 `pnpm seed` / 第二个 `pnpm start`。
- [ ] **数据目录权限**：属主是服务账户，`chmod 700`（Windows 用 ACL）；备份文件同样限制读取。
- [ ] **服务器时间同步**：NTP/chrony 正常，公告时间窗与审计时间准确。
- [ ] **证书自动续期**：certbot timer（或所用 ACME 客户端）已配置并 `--dry-run` 通过。
- [ ] **日志与磁盘监控**：journald / 日志文件有轮转，磁盘余量有告警，`/v1/health` 有探活。
- [ ] **备份可恢复**：至少做过一次恢复演练（备份能打开、能启动）。

## 9. 客户端接入与验收

### 9.1 客户端配置（`local.properties`）

```properties
# 客户端上报密钥；生产关闭匿名上报后必须填
stb.apiKey=stb_live_xxxxxxxx

# debug 包默认 http://127.0.0.1:8787；release 包默认 http://stb.mcobs.cn
stb.debugApiBase=http://127.0.0.1:8787
stb.releaseApiBase=https://stb.mcobs.cn
```

- 生产建议 `stb.releaseApiBase` 直接写 `https://` 并重新打 release 包；默认的 `http://stb.mcobs.cn` 会先明文请求再 308 跳转。
- 改完 `local.properties` 后重新 `gradle assembleRelease`；密钥与签名文件都不入库。

### 9.2 探活与接口验收

```bash
# 公开探活（不需要密钥）：{"ok":true,"time":"…","revision":1}
curl -s https://stb.mcobs.cn/v1/health

# 带密钥拉配置：tools 应有 14 项（11 个主工具 + 2 个示意图子项 + 意见反馈）
curl -s 'https://stb.mcobs.cn/v1/config?version=1.1.0&channel=stable&sn=SN-TEST01' \
  -H "X-STB-Key: stb_live_…"
```

- 客户端启动后先调 `/v1/telemetry/handshake` 登记设备并直接拿到生效配置；连上后可在控制台「遥测 → 设备」看到该 SN。
- 客户端「设置 → 云端同步」能看到修订号与最近同步时间；后台「系统 → 接入文档」可核对当前请求密钥是否匹配。

### 9.3 真机调试（仅开发）

```bash
# 真机通过 USB 把本机 8787 端口映射到设备（仅调试用，生产环境不需要）
adb reverse tcp:8787 tcp:8787
```

生产环境由平板直接访问 `https://stb.mcobs.cn`，不需要也不应该依赖 `adb reverse`；模拟器可用 `10.0.2.2` 访问宿主机的 8787。

### 9.4 上线后确认客户端受控

- 控制台「云端控制 → 工具开关」关闭某个工具并**发布配置**后，客户端下一次拉取配置（最多 6 小时，或设置页「立即同步」）会把它置灰并标注「已停用」，点击弹出停用原因；**不会从主页消失**。
- 只影响单台设备：设备详情 →「单设备功能控制」开关，保存后**不需要发布**，该设备下次拉配置即生效；「停用原因（本设备）」会优先于全局原因展示。
- 示意图子项（细胞分裂 / 地球自转）和主页右上角意见反馈入口同样受上述开关控制。

## 10. 常见问题

### 10.1 生产环境会不会显示示例账号？

| | 开发 / 演示模式（未设置 `STB_ENV=production`） | 生产模式（`STB_ENV=production`） |
| --- | --- | --- |
| 演示账号 | **会**：首次启动自动播种 5 个演示账号，登录页有「演示账号」块和一键填入 | **不会**：不播种演示数据，`/api/public/meta` 的 `demoAccount` 为 `null`，登录页无演示账号块 |
| 演示数据 | 会：320 台设备、60 天遥测、58 条反馈、3 条配置修订 | 不会：设备/事件/反馈/崩溃均为 0，只有 1 个管理员、修订 #1、1 把密钥 |
| 重建演示数据 | 设置页「演示数据」tab / `POST /api/system/reset-demo`（200） | 设置页无该 tab；接口 403 `not_available` |

**注意**：如果之前用开发模式跑过同一个 `data/`，切到生产模式**不会清空**已有演示数据（登录页不再显示演示账号块，但数据库里的演示账号仍可登录）。请换全新 `STB_DATA_DIR` 或按 4.5 清理。

### 10.2 启动报端口被占用（`EADDRINUSE`）

```bash
ss -ltnp | grep 8787          # Linux；Windows: netstat -ano | findstr :8787
```

改 `PORT` 重启，并同步修改 Nginx `proxy_pass`；或者找到占用进程停掉。

### 10.3 反向代理后登录 401 / Cookie 不生效

- 生产 Session Cookie 带 `Secure`，**必须用 `https://` 打开控制台**；用 `http://` 访问会「登录成功但立刻失效」。
- 检查反代是否转发 `Host` 和 `X-Forwarded-Proto`（第 5.2 节）；漏了会出现协议/来源判断错误。
- 换域名后旧 Cookie 可能残留：清一下浏览器 Cookie 再登录。
- 用 `curl -D -` 看 `Set-Cookie` 里有没有 `Secure`，确认自己访问的确实是 HTTPS。

### 10.4 客户端 401 / 403 / 503 / 404

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `401 missing_api_key` | 生产默认关闭匿名上报，请求没带 / 带错 / 带的是已吊销的 `X-STB-Key` | 检查客户端 `local.properties` 的 `stb.apiKey`，与控制台「设置 → 接入密钥」的「前缀」核对；必要时新建密钥并重新打包 |
| `401 invalid` 或登录 401 | 控制台账号密码错误 / 账号被停用 | 检查用户名密码；停用账号需超级管理员恢复 |
| `503 telemetry_disabled` / `feedback_disabled` | 控制台「系统设置」把遥测采集 / 意见反馈关了 | 按需打开；关闭期间客户端应静默跳过，不当作崩溃处理 |
| `404 device_not_registered` | 还没握手就上报事件/反馈 | 客户端应先调 `/v1/telemetry/handshake` |
| `429 too_many_requests` | 触发按 SN 限流（握手 12 次/小时等） | 确认没有多台设备共用同一 SN、没有脚本刷接口；等窗口过去 |
| `404 接口不存在` | 反代改写了 `/api`、`/v1` 路径 | 去掉 rewrite，按原始路径转发 |

### 10.5 停用的工具还在客户端的某个位置出现 / 原因文案不对

- **预期行为**：被停用的工具、示意图子项、反馈入口仍会显示（置灰 +「已停用」徽章），点击弹停用原因；这是「停用不隐藏」的设计，不是没生效。
- 原因文案优先级：**单设备原因 > 全局停用原因 > 客户端默认文案**（「学校管理员暂时关闭了这个工具；你的本地数据不会丢失。」）。
- 全局原因在「云端控制 → 工具开关 → 停用原因（全局）」修改后**需要发布配置**；单设备原因在设备详情保存后**不需要发布**。
- 客户端改动生效最多等一次配置同步（6 小时），可在客户端「设置 → 云端同步 → 立即同步」手动触发。

### 10.6 时间不同步会怎样

公告的 `startAt`/`endAt`、维护时间窗、审计时间、客户端版本提示都按服务器时间计算；服务器时钟漂移会导致公告提前出现或消失、审计时间错乱。请保持 NTP/chrony 运行。客户端设备时间错误也会影响它上报事件的 `occurredAt`。

### 10.7 SQLite 锁 / 写入失败

- 常见原因：同一数据目录跑了两个进程（systemd 服务 + 手工 `pnpm start`，或误跑了 `pnpm seed`）；数据目录放在网络共享（NFS/SMB）上；备份时直接 `cp` 了正在写的数据库文件。
- 处理：保证单实例；数据目录放本地磁盘；按 7.1 的方式备份。服务端已设置 `busy_timeout = 5000ms`，短时争用会等待，不是错误。

### 10.8 忘记控制台管理员密码

系统没有邮件/短信找回功能。可用的处理方式：从备份恢复数据库；或由维护人员停服后用脚本向 `users` 表写入新的 scrypt 密码哈希（`password_hash` 格式为 `scrypt$N$salt$hash`，建议在测试库验证后再操作）。生产环境请同时保留至少一个可用的超级管理员账号。

## 11. 生产参数速查

| 项 | 值 |
| --- | --- |
| 启动命令 | `pnpm start`（实际执行 `tsx server/index.ts`） |
| 默认监听 | `127.0.0.1:8787`（`HOST` / `PORT`） |
| 运行模式开关 | `STB_ENV=production` 或 `NODE_ENV=production` |
| 数据目录 | `data/`（默认）或 `STB_DATA_DIR` |
| 数据库 | `data/console.db`（WAL，伴随 `-wal`/`-shm`） |
| 上传目录 | `data/uploads/`（自动创建） |
| 初始化文件 | `data/initial-admin.txt`、`data/initial-client-key.txt`（仅首次创建） |
| 控制台前端 | `dist/web`（`pnpm build` 产物；缺失时 API 仍可用） |
| 探活 | `GET /v1/health`（公开）、`GET /api/system/health`（公开） |
| 客户端接口 | `/v1/telemetry/handshake`、`/v1/telemetry/events`、`/v1/telemetry/errors`、`/v1/config`、`/v1/feedback*` |
| 生产禁止接口 | `POST /api/system/reset-demo`（403）、`pnpm seed`（exit 1） |
| 日志 | stdout / stderr；systemd 下用 `journalctl -u subjecttoolbox-console` |

---

部署完成后，建议再走一遍：第 8 节安全清单 → 9.2 探活 → 在客户端上打开一次工具并确认控制台「遥测 → 设备」出现该 SN。遇到与本文不符的行为，以仓库代码（`server/env.ts`、`server/bootstrap.ts`、`server/config-domain.ts`、`server/routes/*`）为准。
