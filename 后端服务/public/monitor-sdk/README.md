# 共享监控 SDK 静态目录

此目录的运行时文件由 SDK 项目生成，不手工维护或提交：

```powershell
cd 监控sdk源码
npm.cmd run build
npm.cmd run release:backend
```

生成后，在构建 `后端服务` 镜像时会随 Docker build context 一起复制到 `/app/public/monitor-sdk`。

公开只读地址：

- `/monitor-sdk/monitor-loader.js`
- `/monitor-sdk/sdk-manifest.json`
- `/monitor-sdk/{version}/monitor.min.js`
