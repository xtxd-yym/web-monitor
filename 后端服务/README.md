# 云监控后端服务

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 设置 SourceMap
```bash
npm run setup
```

### 3. 启动服务
```bash
npm start
```

服务将在 `http://localhost:3001` 启动

## 核心功能

- ✅ SQLite 数据库（错误存储）
- ✅ SourceMap 解析（自动还原源码位置）
- ✅ REST API（错误上报、查询、统计）
- ✅ 错误去重（fingerprint 机制）
- ✅ Breadcrumbs 支持

## API 接口

查看完整文档：[API.md](./API.md)

**核心接口**:
- `POST /wczj/alarm/report` - 错误上报
- `GET /api/errors/list` - 错误列表
- `GET /api/errors/stats` - 错误统计
- `GET /health` - 健康检查

## 项目结构

```
后端服务/
├── src/
│   ├── app.js         # 主应用
│   ├── config/        # 配置
│   ├── db/            # 数据库
│   ├── routes/        # 路由
│   └── services/      # 服务
├── database/          # SQLite 数据库
├── sourcemaps/        # SourceMap 文件
├── scripts/           # 工具脚本
└── index.js           # 入口
```

## 更多文档

- [API 文档](./API.md)
- [部署说明](./DEPLOY.md)
- [快速参考](./QUICK_START.md)
