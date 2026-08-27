# Incident 平台复用云监控 MySQL 接入说明

> 文档日期：2026-08-27
>
> 适用范围：Incident 平台参考云监控现有方式，通过 b2bpass 环境变量接入 MySQL。
>
> 安全要求：本文只记录变量名和配置方式，禁止填写真实密码、Token、Secret、数据库账号或内部地址。

## 1. 接入方案

- Incident **正式环境复用云监控正式 MySQL**；如果 Incident 另有 TEST 部署，则由 b2bpass 注入对应 TEST MySQL 配置，TEST 服务不连接正式库。
- 连接方式与云监控一致：通过 **ProxySQL** 访问 MySQL，不在代码中写死真实 Host、Port、账号或密码。
- 正式环境使用的 database 为 `monitor_system`。
- 本次复用方案不要求新建独立 schema，Incident 在 `monitor_system` 中使用四张统一带 `incident_` 前缀的业务表，与云监控现有表隔离。
- Incident 直接沿用云监控的 `DB_*` 环境变量名。不同项目运行在不同容器中，变量名相同不会冲突，不需要增加 `INCIDENT_` 前缀。
- b2bpass 负责向 Incident 容器注入实际配置；Incident 代码只读取环境变量，不需要知道真实配置值。

## 2. MySQL 基础配置

| 项目 | Incident 接入配置 |
|---|---|
| 使用环境 | Incident 正式环境使用云监控正式 MySQL；TEST 环境使用对应 TEST 配置 |
| MySQL 版本 | 沿用云监控所在 MySQL 实例版本，由数据库平台统一维护；应用不单独配置版本。开发兼容基线按 MySQL 8.0 处理 |
| 连接方式 | ProxySQL |
| Host | 通过 `DB_HOST` 注入，可放在 b2bpass 普通配置中，不在本文记录真实值 |
| Port | 通过 `DB_PORT` 注入，可放在 b2bpass 普通配置中，不在本文记录真实值 |
| database | `monitor_system`，通过 `DB_NAME` 注入 |
| 独立 schema | 本次不新建；如数据库平台后续分配独立 schema，只需调整 `DB_NAME` 和账号授权，应用代码无需改变 |
| Incident 表 | 在 `monitor_system` 中创建四张 `incident_` 前缀表，准确表名以 Incident 项目的建表 DDL 为准 |
| 时区 | `+08:00`，通过 `DB_TIMEZONE` 注入；页面展示使用 `Asia/Shanghai` |
| 字符集 | 四张表统一使用 `utf8mb4`；Incident 数据库客户端也保持 `utf8mb4` |
| 连接池 | 默认按云监控现有配置设置为每个应用实例 10 个连接 |

MySQL 精确版本、ProxySQL 真实地址、端口和数据库账号均由现有数据库平台及 b2bpass 管理，不需要 Incident 负责人手工收集或写入接入文档。

## 3. Incident 需要读取的环境变量

Incident 可以直接参考云监控的数据库配置代码，读取以下变量：

| 环境变量 | 是否敏感 | 配置方式 | 说明 |
|---|---|---|---|
| `DB_TYPE` | 否 | b2bpass 普通配置 | 固定为 `mysql` |
| `DB_HOST` | 通常否 | b2bpass 普通配置 | ProxySQL Host，由平台注入 |
| `DB_PORT` | 通常否 | b2bpass 普通配置 | ProxySQL Port，由平台注入 |
| `DB_USER` | 是 | b2bpass Secret 引用 | 数据库账号，不在代码或文档中记录真实值 |
| `DB_PASSWORD` | 是 | b2bpass Secret 引用 | 数据库密码，必须使用 Secret 注入 |
| `DB_NAME` | 否 | b2bpass 普通配置 | 固定为 `monitor_system` |
| `DB_TIMEZONE` | 否 | b2bpass 普通配置 | 固定为 `+08:00` |

参考读取方式：

```js
const databaseConfig = {
    type: process.env.DB_TYPE || 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'monitor_system',
    timezone: process.env.DB_TIMEZONE || '+08:00'
};
```

以上代码只展示变量读取方式，不包含任何真实配置。正式环境不应为 Host、账号或密码设置代码内默认值，缺少必要变量时应拒绝启动。

## 4. b2bpass 注入方式

1. 在 Incident 的 b2bpass 容器配置中增加与云监控相同名称的 `DB_*` 环境变量。
2. `DB_TYPE`、`DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_TIMEZONE` 使用普通环境配置。
3. `DB_USER`、`DB_PASSWORD` 通过 b2bpass Secret 引用映射到容器环境变量，不复制 Secret 实际值。
4. Incident 是独立容器，不能自动继承云监控容器中的变量；需要在 Incident 的部署配置中建立对应映射，但代码层不需要重新设计数据库配置。
5. TEST 与正式环境分别维护配置和 Secret 引用，不能把正式数据库凭证复制到 TEST。
6. 应用日志不得输出 `DB_USER`、`DB_PASSWORD`、完整数据库连接串或 Secret 值。

数据库平台为 Incident 创建独立数据库账号，并通过 `DB_USER`、`DB_PASSWORD` 注入。独立账号的创建和授权由 DBA 执行，Incident 代码不需要增加新的配置变量，文档也不保存真实账号信息。

## 5. 四张表和数据库权限

环境变量只能解决“如何连接数据库”，不能替代建表和授权。本次接入需要完成以下数据库侧动作：

- Incident 项目提供四张 `incident_` 前缀表的准确表名和 DDL。
- 四张表创建在 `monitor_system`，字符集统一为 `utf8mb4`。
- 生产 DDL 由 DBA 通过数据库工单或人工执行；Incident 和云监控应用均不得自动建表或自动迁移。
- `DB_USER` 对四张 Incident 表只需要 `SELECT`、`INSERT`、`UPDATE`、`DELETE`。
- 不授予 `CREATE`、`ALTER`、`DROP`、`GRANT` 等权限，也不扩大到 `monitor_system.*` 全库权限。
- Incident 不读写云监控的 `error_logs`、`monitor_configs`、`alarm_records` 等现有业务表。

如果数据库平台后续允许并分配独立 schema，只需要：

1. DBA 在新 schema 中创建相同四张表并完成授权；
2. b2bpass 将 `DB_NAME` 改为新 schema；
3. 滚动重启 Incident 服务。

Incident 代码和其他环境变量不需要改变。

## 6. 网络和连接池

- Incident 通过 `DB_HOST`、`DB_PORT` 使用云监控现有 ProxySQL 链路，不直连 MySQL 主库。
- 如果 Incident 与云监控处于相同 b2bpass 网络访问域，直接复用现有数据库访问方式，不需要额外提供 Host 或 Port。
- 如果 Incident 所在命名空间默认无法访问 ProxySQL，由基础设施平台按 Incident 服务身份补充网络白名单；不需要把真实地址写入代码或本文。
- Incident 连接池默认上限为每实例 10，与云监控当前配置一致。
- 数据库侧最大连接数和 ProxySQL 限流沿用现有平台策略。只有 Incident 扩容后出现连接不足或计划大规模增加副本时，才需要重新评估连接预算。

## 7. 备份、保留和客户问题文本

### 7.1 备份和恢复

- Incident 四张表随 `monitor_system` 复用现有 MySQL 备份机制，不为本次接入单独建设备份系统。
- 数据库备份和恢复操作由 DBA 负责。
- Incident 负责人负责在恢复后校验四张 Incident 表的数据完整性；云监控负责人负责确认云监控现有表未受影响。

### 7.2 数据保留

- 本次接入不新增数据库自动清理任务，Incident 表数据按照 `monitor_system` 现有存储和备份生命周期保留。
- 如果 Incident 业务要求固定保留天数，应由 Incident 项目单独实现并评审清理策略，不能直接清理云监控表或由本接入文档预设未经确认的天数。

### 7.3 客户问题文本

Incident 允许保存事件处置所必需的、已经脱敏的客户问题文本，但必须满足：

- 不保存密码、Token、Secret、Cookie、Authorization 头或其他凭证；
- 不保存个人敏感信息、完整账号和带敏感查询参数的 URL；
- 不保存与事件处置无关的客户原始问题全文；
- 脱敏应在写入数据库之前完成，日志和数据导出遵守相同规则。

## 8. 故障联系人和回滚方式

### 8.1 处理责任

| 故障类型 | 第一处理方 | 配合方 |
|---|---|---|
| Incident 应用报错、SQL 错误 | Incident 项目负责人 | DBA |
| ProxySQL、连接数、数据库权限或恢复 | DBA/数据库值班 | Incident 项目负责人 |
| b2bpass 配置或 Secret 注入失败 | b2bpass 平台值班 | Incident 项目负责人 |
| 网络、DNS、白名单问题 | 基础设施平台值班 | Incident 项目负责人 |
| 影响云监控现有表或服务 | 云监控负责人 | Incident 项目负责人、DBA |

具体人员和联系方式使用公司内部通讯录和值班系统维护，不在本文记录私人手机号或其他敏感信息。

### 8.2 回滚方式

1. 回滚 Incident 应用版本，或关闭 Incident 数据库写入入口。
2. 回退 Incident b2bpass 中本次新增的 `DB_*` 环境变量映射并滚动重启。
3. 如存在异常连接或越权风险，由 DBA 临时锁定 Incident 使用的数据库账号，或由平台撤销 Incident 到 ProxySQL 的访问权限。
4. 数据写入错误时，由 Incident 负责人提供影响时间范围和记录条件，DBA 按现有备份机制处理恢复。
5. 禁止使用 `DROP TABLE`、`TRUNCATE TABLE` 或删除整个 schema 作为常规回滚手段。

## 9. 接入检查清单

- [ ] Incident 代码已读取 `DB_TYPE`、`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`、`DB_TIMEZONE`。
- [ ] b2bpass 已完成普通配置和 Secret 引用映射，代码、文档和日志中没有真实凭证。
- [ ] `DB_NAME` 为 `monitor_system`，时区为 `+08:00`。
- [ ] 四张 `incident_` 前缀表已由 DBA 创建，字符集为 `utf8mb4`。
- [ ] `DB_USER` 对四张表具有 `SELECT/INSERT/UPDATE/DELETE`，且不能访问无关云监控表。
- [ ] Incident 容器能够通过 ProxySQL 建立连接。
- [ ] 已完成四张表的最小增、查、改、删验证和越权拒绝验证。
- [ ] 连接池上限为每实例 10，应用不会自动建表或修改表结构。
- [ ] 已确认故障时由 Incident 先停写/回滚，数据库恢复由 DBA 执行。

## 10. 禁止事项

- 禁止在代码、Markdown、SQL、日志、截图或工单描述中记录真实密码、Token 或 Secret。
- 禁止在 Incident 代码中写死正式 Host、Port、账号或密码。
- 禁止 Incident 应用执行 `CREATE TABLE`、`ALTER TABLE`、`DROP TABLE`、`TRUNCATE TABLE`、`GRANT` 或自动迁移。
- 禁止 Incident 账号获得 `monitor_system.*` 全库权限。
- 禁止绕过 ProxySQL 直连正式 MySQL 主库。
- 禁止保存未脱敏的客户问题文本。
