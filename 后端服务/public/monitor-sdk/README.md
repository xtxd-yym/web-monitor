# 共享监控 SDK 静态目录

此目录的运行时文件由 SDK 项目生成，不手工维护或提交：

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
