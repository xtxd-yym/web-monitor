# 云监控告警系统可视化管理平台

基于 Vue 3、Element Plus、Vue Router 4、ECharts 和 Vite 7。

## 登录与权限

登录页为 /login，账号由服务端配置。前端向 /api/auth/login 提交登录信息，
后端设置 HttpOnly Cookie，请求层使用 credentials: include。
localStorage 中的 monitor_logged_in 仅用于导航体验，可以被用户修改，不是安全边界。
后端必须对管理接口验证 Cookie；无 Cookie 或无效 Cookie 应返回 401，前端清除导航标志并跳转登录页。

接口鉴权契约：错误查询/详情/删除、SourceMap 管理、AI 诊断、AppKey 管理必须验证会话；
SDK 上报 POST /api/errors/report 和配置读取 GET /api/config 是预期的公开接口。
前端仓库不提供后端实现，目标环境需由后端维护人确认并验证此契约和 Cookie 配置。

## 页面与接口

/console 下包括 dashboard、alarm、error、index、instance、data、config、
sourcemap、appkey、ai-daily-report。配置入口仅使用 ConfigManagement.vue。
AI 诊断通过 Vue 文本插值显示原文及换行，不执行 HTML，也不生成 Markdown 链接。
请求错误由 request.js 统一提示，页面调用 showRequestError 去重；登录 401 由登录页提示。

## 开发与构建

使用 npm；Node 需符合 Vite 7 要求（20.19+ 或 22.12+），现有 Docker 构建阶段使用 22.12.0。
经批准的开发/CI 环境可以执行：

```bash
npm ci
npm test
npm run build:docker
```

需要运行开发服务器时由人工执行 npm run dev；AI 不启动本地前后端。
npm run build 是跳过宿主机构建的占位命令，不能作为真实构建通过的依据。
vite.config.js 的 base 为 /monitorWeb/，输出目录为 monitorWeb；
Vue Router 使用相同 base，部署服务器需将页面路由回退到 index.html。
开发 /api 代理指向 http://localhost:9998，仅用于开发环境；
生产 /api 转发由部署网关配置，不能依赖 Vite 开发代理。

现有 Dockerfile 使用公司 Node/Nginx 镜像，并复制 nginx.conf 和 readiness.sh。
这两份部署文件不在当前导入版本中，构建前需由维护人确认提供方式；
缺少部署文件时不能宣称完整 Docker 镜像构建成功。

## MR 门禁修复记录

2026-10-13：补充 AGENTS.md；修复 404 渲染引用和实例表格多余字符；
AI 结果改为文本显示；请求错误提示去重；删除未引用配置占位页；恢复项目说明。
补齐 lockfileVersion 3 锁文件（135 个 packages 条目），直接依赖固定为原声明版本，
Docker 安装步骤改为 npm ci。npm test 本地 15/15 Mock/回归测试通过；
node --check 和 npm ci --dry-run 锁文件一致性检查通过，未安装运行依赖。
仍需公司 CI 构建/扫描、未知路由和失败提示页面验收、非作者 reviewer 复核，
以及目标环境管理接口鉴权验证；本文不是生产验收记录。
