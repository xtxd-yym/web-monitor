# 云监控 SDK

浏览器侧错误、网络、性能、用户行为及白屏监控；支持动态配置和共享 Loader。当前 SDK 版本为 1.2.0。

## 目录

- `src/core/`：SDK 核心与采集模块。
- `src/loader/monitor-loader.js`：共享动态加载器。
- `src/utils/`：环境判断与脱敏工具。
- `src/server/server.js`：仅供本机使用的演示服务，不是正式后端。
- `examples/complete-demo.html`：合成错误与演示页面，不是生产接入模板。
- `scripts/`：SourceMap 版本整理及 SDK 发布目录生成。
- `test/`：已有配置、运行时与 Loader 的离线 Mock 测试。

## 构建与发布

构建工具环境使用 Node.js 22.12+、npm 和已提交的完整锁文件。公司构建环境执行：

```bash
npm ci
npm run build
```

`dist/release/` 包含 `monitor-loader.js`、`sdk-manifest.json` 与 `{version}/monitor.min.js`。SourceMap 单独保存在 `dist/sourcemaps/`，不要公开发布。
发布到独立后端时，将 release 目录内容交给后端的 SDK 静态目录，或在有两个相邻源码目录的构建环境使用 `npm run release:backend`；三个仓库独立时默认相邻路径不一定成立，应按实际构建路径配置。

源码导入/MR 阶段不需要在公司电脑装依赖、跑测试或启动服务；以上命令供后续构建流程使用，不是导入步骤。

## 演示安全边界

配套服务只监听 `127.0.0.1`，生产模式拒绝启动。仅提供演示页面和构建后的 SDK 文件，不提供源码、配置、日志或 SourceMap 下载。
两个配置写接口要求 `Authorization: Bearer <令牌>`，令牌仅通过 `SDK_DEMO_ADMIN_TOKEN` 注入；未配置时禁用写入。不要把令牌放入浏览器示例或 Git。
默认演示页面访问 `http://localhost:3001/examples/complete-demo.html`；使用自定义端口时，演示 URL 与 CORS 配置也需对应调整。本任务不在本地启动演示服务。

## 2026-10-16 交付记录

- 保留原 16 条 clean history，在末尾追加门禁预修复，不改历史日期。
- 补充 AGENTS/README/忽略规则，移除已跟踪的旧备份副本；完整源码仍包含配套 Node 服务。
- 演示页修复缺失逗号导致的脚本语法错误，错误与性能数据显示改为纯文本，统一回退上报端口。
- 演示页性能按钮读取已有 onPerformanceData 回调缓存，避免调用 DynamicWebMonitor 未提供的 getPerformanceData 方法；不改变 SDK 公共接口。
- 演示服务缩小静态暴露范围、限制本机使用、配置写入增加鉴权；日志文件损坏或权限错误不再静默覆盖。
- npm test 改为复用已有 Node 测试；未新增测试文件，生产依赖范围和已锁定的直接依赖版本不变。
- 浏览器采集模块、Loader 及上报接口契约未修改。旧 doc/project_summary.md 仅作早期历史参考，以本 README 为当前交付说明。
- 本地预检不是公司 AI 门禁或生产验收；实际 MR 扫描、非作者 review、合入、发包和页面验收仍由用户执行。
- 已执行：19 个 JS/CJS 文件及演示页内联脚本语法检查、现有 19 项离线测试、8 项隔离预检，均通过。未新增仓库测试文件。
- 原 v1 锁文件包含完整依赖树，保持原样；npm ci 的离线 dry-run 返回成功且未安装依赖，但提示旧格式需要补充元数据，本机离线缓存缺少部分元数据，真实安装仍需公司 npm 源可用。未借此升级任何依赖。
- 未执行真实 webpack 构建：隔离交付目录未安装构建依赖，按项目约束不为本地构建安装或补齐依赖。构建产物和真实浏览器验收留给公司构建环境。
