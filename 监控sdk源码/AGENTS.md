# 监控 SDK 开发约束

- JavaScript 浏览器 SDK，核心使用 ES Module；构建脚本和本机演示服务使用 CommonJS。保持 npm、webpack、Babel 和 package-lock.json，不迁移框架。
- 修改前阅读依赖清单、锁文件、webpack 配置、相关实现和已有测试。不得擅自升级或新增生产依赖，不改变采集和上报公共接口。
- Node 工具环境使用 22.12+。npm test 复用现有 Node Mock 测试，不引入 Jest 或新增与门禁无关的测试。
- 不在本地启动服务或安装运行依赖；只做语法、静态检查与无外部副作用的 Mock 自测。禁止真实上报、数据库、SMTP、Vanish 或 AI 调用。
- 不硬编码、提交或记录密码、Token、私钥、生产凭证、客户数据和真实业务日志；测试使用合成数据。
- SDK 配套 Node 服务仅供本机演示，不是生产后端；只监听回环地址，禁止公开源码、SourceMap、配置和日志目录。
- 演示配置写接口必须校验环境变量注入的 SDK_DEMO_ADMIN_TOKEN，无默认令牌；生产使用独立后端及其鉴权。
- 错误、网络内容和外部数据不可信；演示页使用 textContent，不将它们直接写入 innerHTML，不使用 eval 或动态函数执行。
- 不因不确定的 CORS 推断修改 Loader 加载策略。SDK 正式发布与页面、真实上报验收由用户在公司环境完成。
- 生成产物、SourceMap、node_modules 和日志不纳入源码仓库；发布产物由构建流程生成，不能把源码合入当作已经发包。
- 更新 README 的交付范围、静态/Mock 验证结果和待验收项。不得声称预检等于公司门禁通过。
- 公司导入只追加当前真实时间的 290581 feat/test 提交；业务与测试文件分开，不改写已有历史，不回填日期，不强推。
- 公司仓库必须保留完整源码，包括 src/server/server.js；不要复制笔记本公开备份仓库的根目录过滤规则。
- 推送及 dev → feature MR 由用户在公司环境执行，不 squash，由非作者 reviewer 复核。
