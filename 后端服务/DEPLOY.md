# Node.js 后端部署说明

## 安装依赖

在 `前端告警系统v1.0` 目录下执行：

```bash
npm install better-sqlite3 source-map joi winston
```

## 准备 SourceMap 文件

将 SDK 的 SourceMap 文件放置到 `sourcemaps` 目录，按版本号组织：

```
前端告警系统v1.0/
└── sourcemaps/
    ├── 1.0.0/
    │   └── monitor.min.js.map
    ├── 1.0.1/
    │   └── monitor.min.js.map
    └── ...
```

## 启动服务器

### 方式 1：使用新的模块化服务器（推荐）

```bash
node server-new.js
```

### 方式 2：使用旧的 server.js（兼容）

```bash
node server.js
```

## 访问接口

服务器启动后，可以访问以下接口：

### 兼容旧接口
- `POST http://localhost:3001/wczj/alarm/report` - 错误上报
- `GET http://localhost:3001/wczj/monitor/config` - 获取配置

### 新接口
- `POST http://localhost:3001/api/errors/report` - 错误上报
- `GET http://localhost:3001/api/errors/list` - 错误列表
- `GET http://localhost:3001/api/errors/:id` - 错误详情
- `GET http://localhost:3001/api/errors/stats` - 错误统计
- `GET http://localhost:3001/api/errors/trend` - 错误趋势
- `POST http://localhost:3001/api/sourcemap/parse` - SourceMap 解析
- `GET http://localhost:3001/health` - 健康检查

## 测试

### 1. 健康检查
```bash
curl http://localhost:3001/health
```

### 2. 上报错误
```bash
curl -X POST http://localhost:3001/wczj/alarm/report \
  -H "Content-Type: application/json" \
  -d '{
    "type": "javascript",
    "message": "Test error",
    "filename": "monitor.min.js",
    "lineno": 1,
    "colno": 100,
    "sdkVersion": "1.0.0",
    "project": "test-project",
    "env": "development",
    "timestamp": 1706428800000
  }'
```

### 3. 查询错误列表
```bash
curl "http://localhost:3001/api/errors/list?project=test-project&env=development"
```

### 4. 查询数据库统计
```bash
curl http://localhost:3001/api/db/stats
```

## 数据库位置

SQLite 数据库文件位置：
```
前端告警系统v1.0/database/monitor.db
```

可以使用 SQLite 客户端工具查看数据：
- DB Browser for SQLite（推荐）
- SQLiteStudio
- VSCode SQLite 插件

## 环境变量配置（可选）

创建 `.env` 文件：

```env
PORT=3001
DB_PATH=./database/monitor.db
SOURCEMAP_DIR=./sourcemaps
CORS_ORIGIN=*
LOG_LEVEL=info
NODE_ENV=development
```

## 生产环境部署

### 使用 PM2

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server-new.js --name "monitor-backend"

# 查看状态
pm2 status

# 查看日志
pm2 logs monitor-backend

# 重启
pm2 restart monitor-backend

# 停止
pm2 stop monitor-backend
```

### 配置 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # API 代理
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /wczj/ {
        proxy_pass http://localhost:3001;
    }

    location /health {
        proxy_pass http://localhost:3001;
    }
}
```

## 数据库备份

```bash
# 备份数据库
cp database/monitor.db database/monitor.db.backup.$(date +%Y%m%d)

# 或使用 SQLite 命令
sqlite3 database/monitor.db ".backup database/monitor.db.backup"
```

## 故障排查

### 1. 数据库连接失败
- 检查 `database` 目录是否存在
- 检查文件权限

### 2. SourceMap 解析失败
- 检查 `sourcemaps` 目录下是否有对应版本的文件
- 检查文件名是否正确（需要 `.map` 后缀）

### 3. 端口占用
```bash
# Windows
netstat -ano | findstr :3001

# Linux/Mac
lsof -i :3001
```

## 下一步

1. 复制 SDK 的 SourceMap 文件到 `sourcemaps/1.0.0/` 目录
2. 安装依赖：`npm install better-sqlite3 source-map joi winston`
3. 启动服务器：`node server-new.js`
4. 使用测试页面触发错误，验证功能
