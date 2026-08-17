# 云监控告警系统 - 项目状态总结

> **项目定位**: 纯前端主导的全栈监控系统（Node.js后端）  
> **更新时间**: 2026-01-28  
> **当前状态**: SDK核心功能完成，准备开发Node后端

---

## 📊 项目概览

### 业务背景
- **目标用户**: 券商客户（风口掘金2.0等H5项目）
- **部署环境**: 嵌入客户端WebView
- **核心痛点**: 
  1. 白屏问题频发
  2. 接口异常难排查
  3. 生产错误无法定位（压缩代码）
  4. 缺少用户操作上下文

### 技术决策
- ✅ **独立完成**: 不依赖Java后端
- ✅ **Node.js后端**: 前端主导，完全掌控
- ✅ **合规优先**: 券商隐私要求（默认关闭敏感功能）

---

## ✅ 已完成功能

### 1. 前端SDK（核心监控能力）

#### 1.1 错误捕获 ⭐⭐⭐⭐⭐
- ✅ JavaScript错误（全局错误、语法错误）
- ✅ Promise rejection错误
- ✅ 资源加载错误（图片、CSS、JS）
- ✅ 网络错误（XHR、Fetch）
  - DNS失败 vs CORS智能区分
  - 超时检测
  - 请求中止检测
- ✅ 白屏检测（采样点 + 容器检测）

**代码位置**:
- `监控sdk源码/src/core/modules/error-monitor.js`
- `监控sdk源码/src/core/modules/network-monitor.js`
- `监控sdk源码/src/core/modules/white-screen-monitor.js`

---

#### 1.2 错误去重和采样 ⭐⭐⭐⭐⭐
- ✅ 错误指纹算法（type+message+stack）
- ✅ 时间窗口去重（5分钟内相同错误只上报1次）
- ✅ 采样配置（JS 100%、资源 50%、网络 30%）
- ✅ 限流保护（令牌桶算法，100条/分钟）

**代码位置**: [error-monitor.js](file:///d:/mine/%E4%BA%91%E7%9B%91%E6%8E%A7/%E4%BA%91%E7%9B%91%E6%8E%A7/%E7%9B%91%E6%8E%A7sdk%E6%BA%90%E7%A0%81/src/core/modules/error-monitor.js)

---

#### 1.3 隐私数据脱敏 ⭐⭐⭐⭐⭐
- ✅ URL参数脱敏（token、password等）
- ✅ 请求体脱敏
- ✅ 正则匹配敏感信息（手机号、身份证）

**代码位置**: `src/utils/sanitizer.js`

---

#### 1.4 配置管理（远程开关） ⭐⭐⭐⭐
- ✅ 动态配置获取（`GET /wczj/monitor/config`）
- ✅ 请求去重（防止并发请求）
- ✅ 超时重试（5秒超时，重试2次）
- ✅ 动态TTL缓存
- ✅ 配置校验和降级
- ✅ 灰度判断（百分比/用户ID/客户）
- ✅ 紧急关闭机制（< 5秒生效）

**代码位置**: [src/core/monitor_sdk.js](file:///d:/mine/%E4%BA%91%E7%9B%91%E6%8E%A7/%E4%BA%91%E7%9B%91%E6%8E%A7/%E7%9B%91%E6%8E%A7sdk%E6%BA%90%E7%A0%81/src/core/monitor_sdk.js)

---

#### 1.5 SourceMap生成 ⭐⭐⭐⭐
- ✅ Webpack配置（hidden-source-map）
- ✅ 版本化脚本（按SDK版本号存储）
- ✅ 版本号注入（`__SDK_VERSION__`）

**代码位置**:
- [webpack.config.js](file:///d:/mine/%E4%BA%91%E7%9B%91%E6%8E%A7/%E4%BA%91%E7%9B%91%E6%8E%A7/%E7%9B%91%E6%8E%A7sdk%E6%BA%90%E7%A0%81/webpack.config.js)
- [scripts/copy-sourcemap.js](file:///d:/mine/%E4%BA%91%E7%9B%91%E6%8E%A7/%E4%BA%91%E7%9B%91%E6%8E%A7/%E7%9B%91%E6%8E%A7sdk%E6%BA%90%E7%A0%81/scripts/copy-sourcemap.js)

---

### 2. 测试前端（演示页面）

- ✅ 8大错误类型测试按钮
- ✅ Mock config接口
- ✅ Mock report接口
- ✅ 实时日志展示

**代码位置**: `前端告警系统v1.0/public/index.html`

---

### 3. Mock后端服务

- ✅ Express服务器
- ✅ CORS配置
- ✅ 告警上报接口（`POST /wczj/alarm/report`）
- ✅ Config接口（`GET /wczj/monitor/config`）
- ✅ 数据持久化（日志文件）

**代码位置**: `前端告警系统v1.0/server.js`

---

## ⏳ 待开发功能

### 🔴 P0 - 核心功能（必须完成）

#### P0-1: SourceMap解析服务
**目标**: 生产错误可定位到源代码  
**技术**: Node.js + source-map库  
**工作量**: 2-3小时

**功能**:
- 接口: `POST /api/sourcemap/parse`
- 输入: `{ version, line, column, stack }`
- 输出: `{ source, line, column, name, originalStack }`

**实现步骤**:
1. 安装依赖: `npm install source-map`
2. 读取SourceMap文件
3. 使用SourceMapConsumer解析
4. 集成到错误上报流程

---

#### P0-2: SQLite数据库
**目标**: 持久化存储告警数据  
**技术**: SQLite3  
**工作量**: 3-4小时

**表设计**:
```sql
-- 错误表
CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  message TEXT,
  url TEXT,
  filename TEXT,
  lineno INTEGER,
  colno INTEGER,
  stack TEXT,
  original_filename TEXT,  -- SourceMap解析后
  original_lineno INTEGER,
  original_stack TEXT,
  sdk_version TEXT,
  timestamp INTEGER,
  project TEXT,
  env TEXT,
  customer_name TEXT,
  breadcrumbs TEXT  -- JSON
);

-- 配置表
CREATE TABLE configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT,
  env TEXT,
  config TEXT,  -- JSON
  updated_at INTEGER
);

-- 索引
CREATE INDEX idx_timestamp ON errors(timestamp);
CREATE INDEX idx_project_env ON errors(project, env);
```

---

#### P0-3: 查询接口
**目标**: 管理后台数据查询  
**工作量**: 2-3小时

**接口列表**:
```
GET  /api/errors/list         # 错误列表（分页、筛选）
GET  /api/errors/:id           # 错误详情
GET  /api/errors/stats         # 统计数据
GET  /api/errors/trend         # 趋势图数据
POST /api/config/update        # 更新配置
```

---

### 🟡 P1 - 增强功能

#### P1-1: Breadcrumbs埋点API
**目标**: 记录用户操作轨迹  
**工作量**: 3-4小时

**SDK侧**:
```javascript
// 提供API
monitor.addBreadcrumb({
  category: 'user-action',
  message: '点击购买按钮',
  data: { productId: 123 }
});

// 自动捕获（可配置）
- 网络请求
- 路由跳转
```

**存储**:
- 错误上报时附带最近20条面包屑
- 存储在errors表的breadcrumbs字段（JSON）

---

#### P1-2: 告警规则引擎
**目标**: 自动触发告警  
**工作量**: 4-5小时

**规则示例**:
```javascript
{
  name: "JS错误频繁告警",
  condition: {
    errorType: "javascript",
    threshold: 10,       // 10次
    timeWindow: 300      // 5分钟
  },
  notification: {
    email: ["dev@example.com"],
    wecom: "webhook-url"
  }
}
```

**实现**:
- 定时任务（node-cron）
- 每分钟检查规则
- 触发时发送通知

---

#### P1-3: 邮件/企微通知
**目标**: 告警通知  
**技术**: nodemailer / 企微Webhook  
**工作量**: 2-3小时

---

### 🟢 P2 - 管理后台

#### P2-1: Dashboard首页
- 关键指标卡片
- 错误趋势图（ECharts）
- Top错误排行
- 健康度总览

#### P2-2: 错误列表页
- 表格展示（分页、筛选）
- 显示原始位置（SourceMap解析后）
- 错误详情弹窗
- Breadcrumbs展示

#### P2-3: 配置管理页
- 配置表单
- 灰度控制
- 紧急关闭开关

---

## 🏗️ 技术栈

### 前端SDK
```
语言: JavaScript (ES6+)
构建: Webpack 5
打包: Babel
体积: 56KB (gzip后约13KB)
```

### Node.js后端
```
框架: Express.js
数据库: SQLite3
SourceMap: source-map
定时任务: node-cron
进程管理: PM2
日志: winston (可选)
```

### 管理后台
```
框架: Vue 2
UI: Element UI
图表: ECharts
HTTP: Fetch API（统一请求适配层）
```

### 部署
```
服务器: Linux (Ubuntu/CentOS)
反向代理: Nginx
进程管理: PM2
数据库: SQLite (文件)
```

---

## 🌐 服务器部署方案

### 方案对比

| 方案 | 成本 | 难度 | 适用场景 |
|------|------|------|----------|
| **实体服务器** | 一次性 | ⭐⭐ | 公司内部有机器 |
| **云服务器** | 按月 | ⭐ | 推荐，灵活 |
| **Vercel/Netlify** | 免费 | ⭐ | 前端静态，不适合 |

---

### 🏆 推荐方案：云服务器

#### 为什么选云服务器？

**优势**:
1. ✅ **简单**: 开箱即用，无需配置硬件
2. ✅ **便宜**: 2核4G约200元/月，学生机更便宜
3. ✅ **稳定**: 7x24小时运行，自动备份
4. ✅ **弹性**: 流量大了随时升级
5. ✅ **外网访问**: 有公网IP，H5页面可访问

**云服务商**:
- **阿里云ECS** - 推荐（稳定，文档全）
- 腾讯云CVM
- 华为云ECS

**配置建议**:
```
CPU: 2核
内存: 4GB
硬盘: 40GB
带宽: 1-3Mbps
系统: Ubuntu 20.04 / CentOS 7

价格: ~200元/月
学生机: ~10元/月（新用户优惠）
```

---

#### 实体服务器方案（备选）

**你同事的做法**:
- ✅ 有实体服务器（公司机房/个人电脑）
- ✅ 安装Linux
- ✅ 配置公网IP（通过路由器端口映射）
- ✅ 部署Node应用

**限制**:
- ⚠️ 需要保持开机
- ⚠️ 网络不稳定（断电、断网）
- ⚠️ 公网IP配置复杂（家庭宽带通常是动态IP）
- ⚠️ 安全性问题（需要配置防火墙）

**适用场景**:
- 仅公司内部使用
- 有专人维护
- 成本敏感（不想付云服务器费用）

---

### 📋 云服务器部署步骤

#### Step 1: 购买云服务器（10分钟）
```
1. 打开阿里云/腾讯云官网
2. 选择ECS/CVM
3. 配置: 2核4G, Ubuntu 20.04
4. 购买（按月/按量）
5. 记录公网IP（例如：123.45.67.89）
```

#### Step 2: 连接服务器（5分钟）
```bash
# Windows: 使用Xshell/PuTTY
# Mac/Linux: 使用终端
ssh root@123.45.67.89

# 输入密码（购买时设置的）
```

#### Step 3: 安装环境（15分钟）
```bash
# 1. 更新系统
apt update && apt upgrade -y

# 2. 安装Node.js (使用nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
node -v  # 验证

# 3. 安装PM2
npm install -g pm2

# 4. 安装Nginx
apt install nginx -y
```

#### Step 4: 上传代码（5分钟）
```bash
# 方案A: Git（推荐）
cd /var/www
git clone <你的仓库地址>
cd 云监控

# 方案B: 手动上传（使用SFTP工具，如FileZilla）
# 上传到 /var/www/云监控
```

#### Step 5: 启动服务（5分钟）
```bash
# 进入后端目录
cd /var/www/云监控/前端告警系统v1.0

# 安装依赖
npm install

# 使用PM2启动
pm2 start server.js --name "monitor-backend"
pm2 save
pm2 startup  # 开机自启

# 查看状态
pm2 status
```

#### Step 6: 配置Nginx（10分钟）
```nginx
# 编辑配置
nano /etc/nginx/sites-available/monitor

# 配置内容
server {
    listen 80;
    server_name 123.45.67.89;  # 改成你的公网IP

    # 管理后台
    location / {
        root /var/www/云监控/告警监控可视化网页/dist;
        try_files $uri $uri/ /index.html;
    }

    # API代理
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
}

# 启用配置
ln -s /etc/nginx/sites-available/monitor /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### Step 7: 验证部署（5分钟）
```bash
# 访问管理后台
http://123.45.67.89

# 测试API
curl http://123.45.67.89/wczj/monitor/config
```

---

## 📅 完整实施计划

### Week 1: Node后端核心（关键）

**Day 1: 环境搭建**
- ✅ 购买云服务器
- ✅ 安装Node/PM2/Nginx
- ✅ 部署测试

**Day 2-3: SourceMap解析**
- ✅ 实现解析服务
- ✅ 集成到错误上报
- ✅ 测试效果

**Day 4-5: SQLite数据库**
- ✅ 表设计
- ✅ 错误入库
- ✅ 查询接口

**Day 6-7: 查询和统计接口**
- ✅ 列表、详情、统计API
- ✅ 分页、筛选
- ✅ 测试

---

### Week 2: 增强功能

**Day 1-2: Breadcrumbs**
- SDK埋点API
- 错误上报附带

**Day 3-4: 告警规则**
- 规则引擎
- 定时检查

**Day 5-7: 管理后台**
- Dashboard
- 错误列表
- 配置管理

---

### Week 3: 完善和推广

**Day 1-2: 测试和优化**
- 压力测试
- 性能优化
- 安全加固

**Day 3-4: 文档**
- 使用文档
- 部署文档
- API文档

**Day 5-7: 试点和推广**
- 接入1-2个项目
- 收集反馈
- 准备演示

---

## 📂 项目文件结构

```
云监控/
├── 监控sdk源码/                    # SDK项目
│   ├── src/
│   │   ├── core/
│   │   │   ├── monitor_sdk.js     # SDK入口
│   │   │   └── modules/
│   │   │       ├── error-monitor.js
│   │   │       ├── network-monitor.js
│   │   │       └── white-screen-monitor.js
│   │   └── utils/
│   │       └── sanitizer.js       # 脱敏工具
│   ├── dist/                      # 构建产物
│   │   ├── monitor.min.js
│   │   ├── monitor.min.js.map
│   │   └── sourcemaps/
│   │       └── 1.0.0/
│   │           └── monitor.min.js.map
│   ├── scripts/
│   │   └── copy-sourcemap.js      # 版本化脚本
│   ├── webpack.config.js
│   └── package.json
│
├── 前端告警系统v1.0/                # 后端 + 测试前端
│   ├── server.js                  # 🆕 Node后端（需完善）
│   ├── public/
│   │   ├── index.html             # 测试页面
│   │   └── monitor.min.js         # SDK
│   ├── database/                  # 🆕 SQLite数据库（待创建）
│   │   └── monitor.db
│   ├── sourcemaps/                # 🆕 SourceMap存储（待创建）
│   │   └── 1.0.0/
│   └── package.json
│
└── 告警监控可视化网页/              # 管理后台
    ├── src/
    │   ├── views/
    │   │   ├── Dashboard.vue      # 🆕 待开发
    │   │   ├── ErrorList.vue      # 🆕 待开发
    │   │   └── Config.vue         # 🆕 待开发
    │   └── api/
    │       └── monitor.js         # 🆕 API封装（待开发）
    └── package.json
```

---

## 🔑 关键配置文件

### 1. SDK配置（前端集成）
```javascript
// 业务项目中
const monitor = new DynamicWebMonitor({
  configUrl: 'http://123.45.67.89/wczj/monitor/config',
  project: '风口掘金2.0',
  env: 'production',
  apiParams: {
    appKey: 'xxx',
    customer_name: '标准版',
    service_name: '风口掘金2.0'
  },
  monitorReport: async (data) => {
    return await fetch('http://123.45.67.89/wczj/alarm/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json());
  }
});

await monitor.init();
```

### 2. Node后端配置
```javascript
// server.js
const config = {
  port: 3001,
  database: './database/monitor.db',
  sourcemapDir: './sourcemaps',
  cors: {
    origin: '*',  // 生产环境改为具体域名
    credentials: true
  }
};
```

---

## 📚 重要文档

### 已输出文档（保存在artifacts）
1. **Config API规范** - [config_api_spec.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/7c100843-e1d3-44e5-b34a-3e0ff055a4b0/config_api_spec.md)
2. **API改动文档 v1.1** - [api_changelog_v1.1.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/7c100843-e1d3-44e5-b34a-3e0ff055a4b0/api_changelog_v1.1.md)
3. **紧急配置刷新方案** - [emergency_config_refresh.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/7c100843-e1d3-44e5-b34a-3e0ff055a4b0/emergency_config_refresh.md)
4. **生产价值评估** - [production_value_assessment.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/7c100843-e1d3-44e5-b34a-3e0ff055a4b0/production_value_assessment.md)
5. **Node后端可行性** - [node_backend_feasibility.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/7c100843-e1d3-44e5-b34a-3e0ff055a4b0/node_backend_feasibility.md)
6. **SourceMap完整方案** - [sourcemap_guide.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/7c100843-e1d3-44e5-b34a-3e0ff055a4b0/sourcemap_guide.md)
7. **实施计划** - [implementation_plan.md](file:///C:/Users/xtxdy/.gemini/antigravity/brain/7c100843-e1d3-44e5-b34a-3e0ff055a4b0/implementation_plan.md)

---

## 🚀 下一步行动

### 立即开始（新对话）

**第一优先级**: 搭建Node后端核心
1. SQLite数据库设计
2. SourceMap解析服务
3. 查询接口

**预计时间**: 1周完成核心功能

**成果**: 
- ✅ 完整可用的监控系统
- ✅ 错误可定位到源代码
- ✅ 数据持久化存储

---

## 💬 给下个对话的提示

**开场白**（复制给新对话）:
```
我有一个云监控告警系统项目，已完成前端SDK核心功能（错误捕获、去重、脱敏、配置管理、SourceMap生成）。

现在需要开发Node.js后端：
1. SQLite数据库设计
2. SourceMap解析服务  
3. 错误查询接口
4. Breadcrumbs埋点API

我决定独立完成（不依赖Java后端）。请帮我实现后端核心功能。

项目详情见：[附上这个总结文档的路径]
```

---

**准备好开始新对话了吗？** 🚀

**记得**：
- ✅ 保存这份文档
- ✅ 云服务器可以先买起来（有优惠）
- ✅ 新对话中直接开始撸代码

**加油！这将是你的亮点项目！** 💪
