# 前端管理平台 AI 开发约束

## 技术栈与改动范围

- Vue 3、Vue Router 4、Element Plus、Vite 7，使用 npm 和 package-lock.json。
- 保持现有 JavaScript / Vue SFC 风格，使用 Composition API 和 <script setup>；禁止 Vue 2 语法或框架迁移。
- 修改前阅读 package.json、lockfile、Vite 配置、测试和相关实现；保持接口和部署路径兼容。
- 不新增或升级生产依赖，不切换包管理器，不提交 node_modules 或构建产物；依赖变更需人工明确批准。
- lockfile 必须完整；可用 --package-lock-only --ignore-scripts 补齐锁文件，不为本地运行安装依赖。
- 构建使用 npm run build:docker；npm run build 是占位命令，不代表真实构建通过。

## 安全与权限

- 禁止硬编码、提交或输出密码、Token、私钥、数据库/SMTP/第三方凭证；凭证由服务端 Secret 或环境变量管理。
- AI 输出、错误堆栈、接口响应均是不可信输入；禁止直接送入 v-html、innerHTML 或 eval。
- monitor_logged_in 只用于页面导航，可以被修改；后端必须验证 HttpOnly Cookie，前端标志不是安全边界。
- 请求统一使用 src/api/request.js，保持 credentials: include；同一个错误仅提示一次。
- 客户数据、原始日志、截图和内部部署材料在人工确认适合目标仓库前不得提交；测试使用合成数据与 Mock。

## 验证与交付

- 不启动本地前后端，不安装或补齐运行依赖；允许静态检查和无外部副作用的 Mock 测试。
- 不调用真实 SMTP、通知系统、正式 API 或数据库，不自动执行数据库迁移。
- 修改后运行 node --check 和 npm test；公司 CI 执行 npm ci 和 npm run build:docker。
- 如实报告验证结果和未完成项，静态/Mock 检查不能代替生产验收。
- 更新 README 的交付记录，记录日期、修改、验证边界和待复核项。
- MR 修复以当前真实时间追加 atomic commit；禁止重写已有历史、回填日期、force push 或 squash。
- 测试与业务文件分开提交，遵循人工指定的任务号与提交格式；AI trailer 如实反映贡献。
- 推送和合并由人工在公司环境执行；门禁通过后仍需非作者 reviewer 复核。
