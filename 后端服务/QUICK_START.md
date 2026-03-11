# 云监控后端 - 快速参考

## 📦 依赖安装

```bash
cd d:\mine\云监控\云监控\前端告警系统v1.0
npm install better-sqlite3 source-map joi winston
```

---

## 🚀 启动命令

### 1. 设置 SourceMap（首次运行）
```bash
node scripts/setup-sourcemap.js
```

### 2. 启动新服务器（推荐）
```bash
node server-new.js
```

### 3. 启动旧服务器（兼容）
```bash
node server.js
```

---

## 🗂️ 项目文件结构

```
前端告警系统v1.0/
├── src/                         # ✨ 新增：模块化源码
│   ├── app.js                   # 主应用
│   ├── config/server.js         # 配置
│   ├── db/
│   │   ├── init.js              # 数据库初始化
│   │   ├── schema.sql           # 表结构
│   │   └── models/              # 数据模型
│   │       ├── error.js         # 错误模型
│   │       ├── config.js        # 配置模型
│   │       └── breadcrumb.js    # 面包屑模型
│   ├── routes/                  # 路由
│   │   ├── errors.js
│   │   ├── config.js
│   │   └── sourcemap.js
│   └── services/
│       └── sourcemap.js         # SourceMap 解析
├── scripts/
│   └── setup-sourcemap.js       # ✨ 新增：SourceMap 设置
├── database/                    # ✨ 自动创建：数据库
│   └── monitor.db
├── sourcemaps/                  # ✨ 自动创建：SourceMap 存储
│   └── 1.0.0/
│       └── monitor.min.js.map
├── server-new.js                # ✨ 新增：新服务器入口
├── server.js                    # 旧服务器（保留）
├── API.md                       # ✨ 新增：API 文档
└── DEPLOY.md                    # ✨ 新增：部署说明
```

---

## 📡 核心 API 接口

### 错误上报（兼容旧接口）
```http
POST http://localhost:3001/wczj/alarm/report
Content-Type: application/json

{
  "type": "javascript",
  "message": "Error message",
  "filename": "monitor.min.js",
  "lineno": 1,
  "colno": 100,
  "sdkVersion": "1.0.0",
  "project": "test-project",
  "env": "development"
}
```

### 错误列表
```http
GET http://localhost:3001/api/errors/list?project=test&env=development&page=1&pageSize=20
```

### 错误详情
```http
GET http://localhost:3001/api/errors/123
```

### 错误统计
```http
GET http://localhost:3001/api/errors/stats?project=test&env=development
```

### SourceMap 解析（调试）
```http
POST http://localhost:3001/api/sourcemap/parse
Content-Type: application/json

{
  "version": "1.0.0",
  "filename": "monitor.min.js",
  "line": 1,
  "column": 1234
}
```

### 健康检查
```http
GET http://localhost:3001/health
```

---

## 🗄️ 数据库查询示例

### 查看所有错误
```sql
SELECT * FROM errors ORDER BY created_at DESC LIMIT 10;
```

### 按类型统计
```sql
SELECT type, COUNT(*) as count FROM errors GROUP BY type;
```

### Top 错误
```sql
SELECT 
  fingerprint, 
  message, 
  SUM(occurrence_count) as total
FROM errors
GROUP BY fingerprint
ORDER BY total DESC
LIMIT 10;
```

### 错误趋势
```sql
SELECT 
  date(timestamp / 1000, 'unixepoch', 'localtime') as day,
  COUNT(*) as count
FROM errors
WHERE project = 'test-project'
GROUP BY day
ORDER BY day DESC;
```

---

## 🛠️ 常用命令

### 查看数据库统计
```bash
curl http://localhost:3001/api/db/stats
```

### 检查 SourceMap 是否存在
```bash
curl "http://localhost:3001/api/sourcemap/check?version=1.0.0&filename=monitor.min.js"
```

### 清理 SourceMap 缓存
```bash
curl -X POST http://localhost:3001/api/sourcemap/clear-cache
```

---

## 📝 关键代码位置

### 错误上报处理
文件：`src/app.js` (line 116-140)
```javascript
app.post('/wczj/alarm/report', async (req, res) => {
  // 1. 生成错误指纹
  // 2. 解析 SourceMap
  // 3. 插入数据库
})
```

### SourceMap 解析
文件：`src/services/sourcemap.js` (line 60-80)
```javascript
async parsePosition(version, filename, line, column) {
  const consumer = await this.loadSourceMap(version, filename);
  return consumer.originalPositionFor({ line, column });
}
```

### 错误模型
文件：`src/db/models/error.js` (line 18-70)
```javascript
insert(errorData) {
  // 智能去重：检查 fingerprint
  // 如果存在 → 更新 occurrence_count
  // 如果不存在 → 插入新记录
}
```

---

## 🔍 调试技巧

### 1. 查看实时日志
服务器启动后，控制台会实时输出：
- 每个请求的 HTTP 方法和路径
- 数据库操作日志
- SourceMap 加载日志

### 2. 使用 DB Browser 查看数据库
推荐工具：**DB Browser for SQLite**
打开文件：`database/monitor.db`

### 3. 测试 SourceMap 解析
访问测试页面：`http://localhost:3001/public/index.html`
触发 JS 错误，查看是否正确解析到源码位置

---

## ⚡ 性能提示

### 数据库优化
- ✅ 已启用 WAL 模式
- ✅ 已创建必要索引
- 💡 定期清理旧数据（建议保留 30-90 天）

### SourceMap 缓存
- ✅ 自动 LRU 缓存（最多 50 个）
- 💡 如果版本很多，可调整 `maxCacheSize`

### 查询优化
- 💡 使用时间范围查询，避免全表扫描
- 💡 启用分页，默认 pageSize=20

---

## 📚 文档链接

- **[API.md](file:///d:/mine/云监控/云监控/前端告警系统v1.0/API.md)** - 完整 API 文档
- **[DEPLOY.md](file:///d:/mine/云监控/云监控/前端告警系统v1.0/DEPLOY.md)** - 部署说明
- **[walkthrough.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/33a31550-6818-4c6f-9ed6-c0816d376272/walkthrough.md)** - 实施总结

---

## 💬 常见问题

**Q: 依赖安装失败怎么办？**  
A: 尝试使用 `--legacy-peer-deps` 或 `--force` 参数

**Q: 端口 3001 被占用？**  
A: 修改 `src/config/server.js` 中的 `port` 配置

**Q: SourceMap 解析失败？**  
A: 检查 `sourcemaps/版本号/` 目录下是否有对应的 .map 文件

**Q: 如何切换数据库？**  
A: 修改 `src/config/server.js` 中的 `database.path`

---

**准备就绪！安装依赖后即可启动 🚀**
