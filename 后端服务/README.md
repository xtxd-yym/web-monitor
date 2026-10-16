# 云监控后端服务

Node.js / Express 管理 API、SDK 上报与动态配置、SourceMap 解析、告警通知和 AI 诊断/日报。
管理平台与监控 SDK 在其他仓库，本仓库入口为 index.js，默认端口 9998。

## 运行与部署

运行环境为 Node.js 22.12+，与现有 Docker 基础镜像一致；使用 npm 和完整 package-lock.json。
生产镜像运行 npm ci --omit=dev --omit=optional，使用 MySQL，不安装可选 SQLite 依赖。
npm run build 没有实际编译步骤，不能据此宣称镜像构建或业务验收通过。
人工部署细节见 [DEPLOY.md](DEPLOY.md)，旧 API 示例以 src/routes 实现为准。

## 配置与权限

所有凭证通过 Secret/环境变量注入，禁止提交 .env、数据库、日志和私钥。
管理员账号使用 ADMIN_USER；管理员密码 ADMIN_PASS 与 JWT_SECRET 不提供默认值。
生产缺少 ADMIN_PASS/JWT_SECRET 会拒绝启动。当前管理入口使用 HTTP，COOKIE_SECURE 保持未设置或 false；
Cookie 保留 HttpOnly、SameSite=Lax，仅在 COOKIE_SECURE=true 时启用 Secure，不受 NODE_ENV 强制覆盖。
管理 API 在 authMiddleware 后注册；SDK 错误上报、配置读取与探针为预期公开入口。
畸形 Cookie 按未登录处理，只有约定 SDK 目录作为公开静态资源。

MySQL：DB_TYPE=mysql，配置 DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME，
DB_TIMEZONE 默认 +08:00。应用不自动执行 MySQL DDL，表结构由人工工单维护。
SMTP、Vanish、OSS 和 AI 配置仅由各自环境变量提供，具体字段见 src/config/server.js。
导入代码不要求公司电脑安装 npm 依赖、升级 Node 或本地启动服务。

## SDK 资源

公司镜像直接从 GitLab 构建，因此 public/monitor-sdk 的发布资源必须进入公司 Git：
monitor-loader.js、sdk-manifest.json 和版本目录下的 monitor.min.js。本次恢复已有发布文件，不重新构建 SDK。
用户确认当前生产使用 1.2.0，Manifest 仍指向 1.2.0；保留 1.0.1、1.1.0 文件，不覆盖其内容。
不提交 SourceMap、日志或 Secret。个人 GitHub 继续过滤这些生成产物，不用于生成公司发布镜像。
详见 public/monitor-sdk/README.md。

## 2026-10-16 两项生产兼容修复

- 恢复原有 COOKIE_SECURE 配置开关，修复 HTTP 管理入口登录后因 Cookie 不发送而立即返回 401。
- 将已有 Loader、Manifest 和版本 JS 纳入公司交付源码及 Git 跟踪范围，修复重新构建镜像后静态资源缺失。
- 未改变 SDK 采集核心、SDK 版本、上报/配置接口、SourceMap 校验、AI 请求、数据库或其他逻辑。
- 本地验证仅限离线 Mock、文件/打包校验和语法检查；公司 MR、镜像构建与生产验收由用户执行。

## 2026-10-13 门禁预处理

补充 AGENTS.md、README 和锁文件，Docker 使用 npm ci；
移除仓库根静态公开，去除默认管理员密码/签名密钥和 Compose 内置密码；
修复畸形 Cookie 处理，限制 JWT 算法，校验 SourceMap 路径输入；
告警/AI 日报文本按 HTML 转义，AI 请求增加超时并停止回显上游错误原文。
原 26 条重建历史保留，新修复以当前真实时间追加。
本地静态/Mock 检查结果随交付报告提供，不新增人工测试步骤。
待公司扫描、代码评审和后续部署验收；未声明已通过公司门禁或生产验收。
