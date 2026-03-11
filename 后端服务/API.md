# 云监控告警系统 - Node.js 后端 API 文档

## 基础信息

- **Base URL**: `http://localhost:3001`
- **Content-Type**: `application/json`

---

## 错误上报接口

### POST /wczj/alarm/report

**功能**: 错误上报（兼容旧接口，自动 SourceMap 解析）

**请求体**:
```json
{
  "type": "javascript",
  "message": "Uncaught TypeError: Cannot read property 'foo' of undefined",
  "url": "https://example.com/page",
  "filename": "https://cdn.example.com/monitor.min.js",
  "lineno": 1,
  "colno": 1234,
  "stack": "Error at...",
  "sdkVersion": "1.0.0",
  "project": "风口掘金2.0",
  "env": "production",
  "customer_name": "标准版",
  "userAgent": "Mozilla/5.0...",
  "timestamp": 1706428800000,
  "breadcrumbs": [
    {
      "category": "user-action",
      "message": "点击购买按钮",
      "timestamp": 1706428799000
    }
  ]
}
```

**响应**:
```json
{
  "success": true,
  "flag": 200,
  "msg": "告警上报成功",
  "data": {
    "errorId": 123,
    "parsed": true
  }
}
```

---

## 配置管理接口

### GET /wczj/monitor/config

**功能**: 获取监控配置（兼容旧接口）

**查询参数**:
- `project` (required): 项目名称
- `env` (required): 环境（dev/test/production）
- `customer_name` (optional): 客户名称

**示例**:
```
GET /wczj/monitor/config?project=风口掘金2.0&env=production&customer_name=标准版
```

**响应**:
```json
{
  "enabled": true,
  "config": {
    "enableErrorMonitoring": true,
    "enableNetworkMonitoring": true,
    "errorSampleRate": {
      "javascript": 1.0,
      "network": 0.3
    }
  },
  "meta": {
    "version": "1.0.0",
    "updatedAt": 1706428800000,
    "ttl": 300
  }
}
```

---

## 错误查询接口

### GET /api/errors/list

**功能**: 获取错误列表（分页、筛选）

**查询参数**:
- `page` (optional, default: 1): 页码
- `pageSize` (optional, default: 20): 每页条数
- `project` (optional): 项目名称
- `env` (optional): 环境
- `type` (optional): 错误类型
- `severity` (optional): 严重级别
- `keyword` (optional): 关键词搜索
- `startTime` (optional): 开始时间（毫秒时间戳）
- `endTime` (optional): 结束时间（毫秒时间戳）

**示例**:
```
GET /api/errors/list?project=风口掘金2.0&env=production&page=1&pageSize=20
```

**响应**:
```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": 123,
        "type": "javascript",
        "message": "TypeError: Cannot read property...",
        "original_filename": "src/core/monitor_sdk.js",
        "original_lineno": 45,
        "timestamp": 1706428800000,
        "occurrence_count": 5
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

---

### GET /api/errors/:id

**功能**: 获取错误详情

**示例**:
```
GET /api/errors/123
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "type": "javascript",
    "message": "TypeError: Cannot read property 'foo' of undefined",
    "url": "https://example.com/page",
    "filename": "monitor.min.js",
    "lineno": 1,
    "colno": 1234,
    "stack": "...",
    "original_filename": "src/core/monitor_sdk.js",
    "original_lineno": 45,
    "original_stack": "...",
    "breadcrumbs": [...],
    "occurrence_count": 5,
    "first_seen_at": 1706428800000,
    "last_seen_at": 1706428900000
  }
}
```

---

### GET /api/errors/stats

**功能**: 获取错误统计数据

**查询参数**:
- `project` (required): 项目名称
- `env` (required): 环境
- `startTime` (optional): 开始时间
- `endTime` (optional): 结束时间

**示例**:
```
GET /api/errors/stats?project=风口掘金2.0&env=production
```

**响应**:
```json
{
  "success": true,
  "data": {
    "total": 1234,
    "byType": {
      "javascript": 800,
      "promise": 200,
      "network": 150,
      "resource": 84
    },
    "bySeverity": {
      "error": 1000,
      "warning": 200,
      "info": 34
    },
    "topErrors": [
      {
        "fingerprint": "abc123",
        "message": "TypeError: Cannot read property...",
        "count": 50
      }
    ]
  }
}
```

---

### GET /api/errors/trend

**功能**: 获取错误趋势数据

**查询参数**:
- `project` (required): 项目名称
- `env` (required): 环境
- `startTime` (optional): 开始时间
- `endTime` (optional): 结束时间
- `interval` (optional, default: hour): 时间间隔（hour/day）

**示例**:
```
GET /api/errors/trend?project=风口掘金2.0&env=production&interval=hour
```

**响应**:
```json
{
  "success": true,
  "data": {
    "timeline": [
      {
        "time": "2026-01-28 00:00:00",
        "count": 45,
        "types": {
          "javascript": 30,
          "network": 15
        }
      }
    ]
  }
}
```

---

## SourceMap 解析接口

### POST /api/sourcemap/parse

**功能**: 手动解析 SourceMap（用于调试）

**请求体**:
```json
{
  "version": "1.0.0",
  "filename": "monitor.min.js",
  "line": 1,
  "column": 1234,
  "stack": "Error at..."
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "position": {
      "source": "webpack://monitor-sdk/src/core/monitor_sdk.js",
      "line": 45,
      "column": 12,
      "name": "reportError"
    },
    "originalStack": "at reportError (src/core/monitor_sdk.js:45:12)\n...",
    "snippet": {
      "snippet": [
        { "line": 40, "content": "function reportError() {", "isError": false },
        { "line": 41, "content": "  // ... code", "isError": false },
        { "line": 45, "content": "  throw new Error('test');", "isError": true }
      ],
      "errorLine": 45
    }
  }
}
```

---

### GET /api/sourcemap/check

**功能**: 检查 SourceMap 是否存在

**查询参数**:
- `version` (required): SDK 版本
- `filename` (required): 文件名

**示例**:
```
GET /api/sourcemap/check?version=1.0.0&filename=monitor.min.js
```

**响应**:
```json
{
  "success": true,
  "data": {
    "exists": true,
    "version": "1.0.0",
    "filename": "monitor.min.js"
  }
}
```

---

## 配置管理接口（新）

### POST /api/config/update

**功能**: 更新监控配置

**请求体**:
```json
{
  "project": "风口掘金2.0",
  "env": "production",
  "customer_name": "标准版",
  "config": {
    "enabled": true,
    "config": {
      "enableErrorMonitoring": true,
      "enableNetworkMonitoring": false
    }
  }
}
```

**响应**:
```json
{
  "success": true,
  "msg": "配置更新成功",
  "data": {
    "id": 1,
    "version": 2,
    "updated": true
  }
}
```

---

### GET /api/config/list

**功能**: 获取所有配置

**查询参数**:
- `project` (optional): 项目名称
- `env` (optional): 环境

**示例**:
```
GET /api/config/list?project=风口掘金2.0
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project": "风口掘金2.0",
      "env": "production",
      "customer_name": "标准版",
      "config": {...},
      "version": 2,
      "is_active": 1
    }
  ]
}
```

---

## 系统接口

### GET /health

**功能**: 健康检查

**响应**:
```json
{
  "status": "healthy",
  "timestamp": 1706428800000,
  "database": "connected"
}
```

---

### GET /api/db/stats

**功能**: 数据库统计

**响应**:
```json
{
  "success": true,
  "data": {
    "errors": 1234,
    "configs": 5,
    "breadcrumbs": 3456
  }
}
```

---

## 错误响应格式

所有接口在发生错误时返回：

```json
{
  "success": false,
  "msg": "错误描述",
  "error": "详细错误信息"
}
```

HTTP 状态码：
- `200` - 成功
- `400` - 请求参数错误
- `404` - 资源不存在
- `500` - 服务器内部错误
