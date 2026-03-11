# 前端演示页面使用说明

## 文件说明

- `index.html` - 测试页面
- `monitor.min.js` - 监控 SDK（需要从 SDK 项目拷贝）

## 获取 SDK

从 SDK 源码目录拷贝编译后的文件：

```bash
copy ..\监控sdk源码\dist\monitor.min.js .\
```

## 使用方法

### 方式 1：直接打开
双击 `index.html` 在浏览器中打开

### 方式 2：使用 Live Server（推荐）
1. 在 VSCode 中右键 `index.html`
2. 选择 "Open with Live Server"

## 测试流程

1. **启动后端服务**
   ```bash
   cd ..\后端服务
   npm start
   ```

2. **打开测试页面**
   在浏览器打开 `index.html`

3. **触发错误**
   点击页面上的各种错误按钮：
   - JS 错误
   - Promise 错误
   - 资源加载错误
   - 网络请求错误
   - 自定义错误

4. **查看结果**
   - 页面实时日志：显示错误上报状态
   - 浏览器控制台：查看详细信息
   - 后端接口：访问 `http://localhost:3001/api/errors/list`

## 功能说明

- ✅ 实时日志显示
- ✅ 错误自动上报
- ✅ SDK 状态监控
- ✅ 多种错误类型测试
- ✅ 美观的 UI 界面

## 注意事项

1. 确保后端服务已启动（端口 3001）
2. 确保 `monitor.min.js` 文件存在
3. 如果跨域问题，使用 Live Server 或配置 CORS
