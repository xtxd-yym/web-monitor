# 共享监控 SDK 静态目录

此目录保存由 SDK 项目生成的正式发布静态文件。公司镜像直接从 GitLab 构建，因此
Loader、Manifest 与版本目录的 monitor.min.js 必须提交公司后端仓库；不提交 SourceMap。
个人公开 GitHub 仍过滤生成产物，不作为公司镜像的构建来源。

2026-10-16 修复交付使用本地已有产物，不重新编译、不切换版本。用户确认线上为 1.2.0，
sdk-manifest.json 继续指向 ./1.2.0/monitor.min.js；1.0.1 和 1.1.0 文件原样保留。

后续经用户明确确认的 SDK 发版才执行生成命令，生成后需在公司仓库提交对应文件：

```powershell
cd 监控sdk源码
npm.cmd run build
npm.cmd run release:backend
```

生成后，在构建 `后端服务` 镜像时会随 Docker build context 一起复制到 `/app/public/monitor-sdk`。

通过现有生产 `/api` 网关公开的推荐地址：

- `/api/monitor-sdk/monitor-loader.js`
- `/api/monitor-sdk/sdk-manifest.json`
- `/api/monitor-sdk/{version}/monitor.min.js`

后端直连场景仍兼容不带 `/api` 的 `/monitor-sdk/*` 路径。
