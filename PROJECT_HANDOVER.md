# 项目交接：云监控系统 (Monitor System)

**最后更新时间**：2026-02-05
**当前环境**：测试环境
**部署状态**：已部署，镜像构建成功

---

## 1. 项目概览

云监控告警系统是一套完整的前端监控解决方案，包含 SDK、可视化管理后台和数据接收后端。

### 1.1 核心技术栈

| 组件 | 技术栈 | 备注 |
|------|--------|------|
| **前端 (Console)** | Vue 3 + Vite + Element Plus | 源码目录：`./告警信息可视化网页` |
| **后端 (Server)** | Node.js + Express + SQLite/MySQL | 源码目录：`./后端服务` |
| **SDK** | 原生 JavaScript | 源码目录：`./监控sdk源码` |

### 1.2 数据库策略

*   **本地开发**：默认使用 SQLite (`./后端服务/src/db/database/monitor.db`)
*   **生产/测试环境**：**强制使用 MySQL**，通过环境变量 `DB_TYPE=mysql` 开启。

---

## 2. 关键配置与环境变量

部署时通过环境变量配置数据库连接和系统行为。

### 2.1 必填配置 (Docker/云平台)

```bash
# 数据库类型 (必须为 mysql)
DB_TYPE=mysql

# MySQL 连接信息
DB_HOST=<内网MySQL地址>
DB_PORT=3306
DB_USER=<用户名>
DB_PASSWORD=<密码>
DB_NAME=<数据库名>
```

### 2.2 可选配置

```bash
# 错误去重时间窗口 (单位: 秒)
# 默认 3600 秒 (1小时)。在此窗口内，相同指纹的错误会合并统计，不新增记录。
ERROR_DEDUPE_WINDOW_SECONDS=3600
```

---

## 3. 最近修复与功能更新 (2026-02-05)

以下是最近一次迭代中修复的关键 Bug 和新增功能：

### ✅ 已修复 Bug

1.  **监控概览 Top 5 问题**：
    *   修复了 Top 5 错误显示为 10 条的问题 (后端 `LIMIT` 修正)。
    *   修复了点击 Top 5 无法跳转详情的问题 (补充返回 `id`)。

2.  **实例更新字段缺失**：
    *   修复了更新实例时项目名为空的问题 (前端增加 `project` -> `project_name` 字段映射)。

3.  **错误去重逻辑优化**：
    *   去除了网络错误信息中的动态时间值（如 `after 500ms`），确保同一类网络错误能正确合并。
    *   逻辑：(相同指纹 + 相同项目 + 相同环境 + `ERROR_DEDUPE_WINDOW_SECONDS` 时间内) = 合并。

4.  **错误日志搜索**：
    *   前端和后端均已支持按 `customer_name` (客户名) 和 `service_name` (服务名) 进行筛选。

5.  **实例 ID 逻辑修正**：
    *   **问题**：创建实例时输入 ID (如 `test1`)，但列表回显和删除接口却使用数据库自增 ID (数字)，导致无法通过自定义 ID 删除。
    *   **修复**：
        *   后端：`delete` 接口支持传入 `instance_id` (字符串) 进行删除。
        *   前端：实例列表和详情页统一展示 `instance_id`，隐藏内部自增 ID。

6.  **错误日志字段修复**：
    *   **问题**：错误列表中的 客户名/AppKey/组件名 显示为空或格式错误 (如 `0: {`)。
    *   **修复**：后端写入 `extra_data` 时增加了类型检查，防止将 JSON 字符串再次序列化导致数据损坏。

7.  **实例监控筛选增强**：
    *   **新增**：实例监控列表页增加 AppKey、客户名、组件名 列显示 (解析 rules 字段)。
    *   **新增**：实例监控查询栏增加 AppKey、客户名、组件名 筛选条件。

8.  **告警记录等级筛选不完整**：
    *   **问题**：筛选仅有 L1-L3，但创建实例时可选 L1-L5。
    *   **修复**：告警记录筛选项增加 L4 (关注) 和 L5 (信息)。

9.  **告警记录 客户名/AppKey/服务名 为空**：
    *   **问题**：触发告警后，告警记录列表中这三个字段显示为空。
    *   **修复**：后端 `errors.js` 在触发告警时，将这三个字段传递给 `alarmModel.add()`。

10. **监控概览 Top 5 错误详情跳转空白页**：
    *   **问题**：点击 Top 5 错误详情跳转到新页面但显示空白。
    *   **修复**：改为在当前页面弹出抽屉显示错误详情，与错误日志页面保持一致。

11. **告警等级不匹配**：
    *   **问题**：创建 L5 实例，触发的告警却显示为 L1。
    *   **原因**：后端错误使用 `rule.level` (始终为 undefined)，应使用 `ruleConfig.level` (从 rules_json 解析)。
    *   **修复**：后端 `errors.js` 改为使用 `ruleConfig.level`。

12. **删除实例后告警记录丢失实例名称**：
    *   **问题**：删除告警实例后，历史告警记录中的实例名称变为空。
    *   **原因**：原来通过 JOIN 查询实例名称，实例删除后 JOIN 失效。
    *   **修复**：`alarm_records` 表新增 `instance_name` 和 `instance_uuid` 字段，在创建告警时快照保存。

### ✨ 新增功能/重构

1.  **Config 管理重构 (AppKey 维度)**：
    *   **背景**：原 Config 仅支持 Project 维度，无法满足多租户/多组件需求。
    *   **改动**：
        *   数据库 `monitor_configs` 表增加 `appkey` 字段，唯一索引改为 `(appkey, customer_name)`。
        *   新增前端 **Config 管理** 页面 (`/console/config`)，支持增删改查。
        *   后端接口全面支持按 `appkey` 查询配置。
    *   **兼容性**：后端接口仍保留对旧版 `project + env` 查配置的向下兼容。

3.  **监控概览体验优化**：
    *   **改动**：监控概览页 (Dashboard) 的"项目"筛选由手动输入改为下拉选择。
    *   **新增**：后端 `/errors/projects` 接口，支持获取所有已上报错误的项目列表。
    *   **体验**：进入页面自动选中第一个项目并加载数据。

4.  **前端导航优化**：
    *   **新增**：侧边栏增加 "配置管理" 菜单，指向 `/console/config`。

3.  **数据删除功能**：
    *   **新增**：后端 `/alarm/delete` 和 `/errors/delete` 接口。
    *   **新增**：前端告警记录和错误日志列表增加删除按钮 (含确认提示)。

---

## 4. 数据库维护

### 4.1 表结构变更 (MySQL)

如果部署到新环境，请执行 `migration_config_appkey.sql` 以支持最新的 Config 管理功能。

```sql
ALTER TABLE `monitor_configs` 
ADD COLUMN `appkey` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'AppKey',
DROP INDEX `uniq_configs_project_env_customer`,
ADD UNIQUE KEY `uk_appkey_customer` (`appkey`, `customer_name`),
ADD KEY `idx_appkey` (`appkey`),
ADD KEY `idx_customer` (`customer_name`);
```

### 4.2 关键表说明

*   `error_logs`: 存储具体的错误日志。
*   `monitor_configs`: 存储监控配置 (AppKey + CustomerName)。
*   `alarm_instances`: 存储告警规则。
*   `alarm_records`: 存储触发的告警记录。

---

## 5. 项目目录结构说明

```text
/
├── 告警信息可视化网页/    # 前端管理后台源码
│   ├── src/views/       # 页面 (ConfigManagement.vue, Dashboard.vue 等)
│   └── src/api/         # 接口请求封装
├── 后端服务/             # Node.js 后端源码
│   ├── src/db/models/   # 数据模型 (error.js, config.js 等)
│   ├── src/routes/      # API 路由
│   └── src/db/          # 数据库初始化与 schema
└── 监控sdk源码/          # 前端监控 SDK
    └── src/core/        # SDK 核心逻辑
```

---

## 6. 待办事项 (Next Steps)

*   [ ] **冒烟测试**：验证测试环境下 `/health` 接口返回 200，且服务进程稳定。
*   [ ] **验证 Config**：在 Config 管理页面添加配置，验证 SDK 初始化时能否通过 appkey 拉取到。
*   [ ] **数据持久化**：确认云平台容器重启后 MySQL 数据不丢失（应已通过外置 MySQL 解决）。

---

*生成工具: Antigravity Agent*
