-- ===========================================
-- 注意：生产 MySQL 仅允许数据库工单/人工执行 DDL。
-- 应用启动不会执行本文件，也不得在代码中增加自动建表或自动迁移逻辑。
-- 具体变更命令由交付回复直接提供，不额外创建迁移 SQL 文件。
-- ===========================================

-- ===========================================
-- 云监控系统 MySQL 建表脚本 (符合公司规范版 v3)
-- 生成时间: 2026-02-03
-- ===========================================

-- 1. 错误日志表
CREATE TABLE IF NOT EXISTS `error_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `project` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '项目标识',
  `env` VARCHAR(50) NOT NULL DEFAULT 'production' COMMENT '环境: production/development',
  `error_type` VARCHAR(50) NOT NULL DEFAULT 'javascript' COMMENT '错误类型: javascript/promise/resource/network',
  `error_message` LONGTEXT COMMENT '错误信息',
  `error_stack` LONGTEXT COMMENT '错误堆栈',
  `error_file` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '错误文件路径',
  `error_line` INT NOT NULL DEFAULT 0 COMMENT '错误行号',
  `error_col` INT NOT NULL DEFAULT 0 COMMENT '错误列号',
  `user_id` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '用户ID',
  `fingerprint` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '错误指纹(用于去重)',
  `error_status` VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT '状态: open/resolved/ignored',
  `occurrence_count` INT NOT NULL DEFAULT 1 COMMENT '发生次数',
  `created_at` BIGINT NOT NULL DEFAULT 0 COMMENT '创建时间戳(毫秒)',
  `updated_at` BIGINT NOT NULL DEFAULT 0 COMMENT '更新时间戳(毫秒)',
  `extra_data` LONGTEXT COMMENT '额外数据(JSON)',
  PRIMARY KEY (`id`)
) DEFAULT CHARSET=utf8mb4 COMMENT='错误日志表';

CREATE INDEX `idx_error_logs_project_env` ON `error_logs` (`project`, `env`);
CREATE INDEX `idx_error_logs_fingerprint` ON `error_logs` (`fingerprint`);
CREATE INDEX `idx_error_logs_created_at` ON `error_logs` (`created_at`);

-- 2. 配置表
CREATE TABLE IF NOT EXISTS `monitor_configs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `appkey` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'AppKey',
  `project` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '项目标识',
  `env` VARCHAR(50) NOT NULL DEFAULT 'production' COMMENT '环境',
  `customer_name` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '客户名称',
  `config_json` LONGTEXT COMMENT '配置内容(JSON)',
  `updated_at` BIGINT NOT NULL DEFAULT 0 COMMENT '更新时间戳(毫秒)',
  `updated_by` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '更新人',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_appkey_customer` (`appkey`, `customer_name`),
  KEY `idx_appkey` (`appkey`),
  KEY `idx_customer` (`customer_name`)
) DEFAULT CHARSET=utf8mb4 COMMENT='监控配置表';

-- 3. 面包屑表 (用户行为追踪)
CREATE TABLE IF NOT EXISTS `user_breadcrumbs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `error_id` INT NOT NULL DEFAULT 0 COMMENT '关联的错误ID',
  `breadcrumb_type` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '类型: click/navigation/xhr等',
  `category` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '分类',
  `breadcrumb_message` LONGTEXT COMMENT '描述信息',
  `breadcrumb_data` LONGTEXT COMMENT '数据(JSON)',
  `event_time` BIGINT NOT NULL DEFAULT 0 COMMENT '事件时间戳(毫秒)',
  PRIMARY KEY (`id`)
) DEFAULT CHARSET=utf8mb4 COMMENT='用户行为面包屑表';

CREATE INDEX `idx_breadcrumbs_error_id` ON `user_breadcrumbs` (`error_id`);

-- 4. 指标定义表
CREATE TABLE IF NOT EXISTS `monitor_index_defs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `index_code` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '指标代码',
  `index_name` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '指标名称',
  `index_desc` TEXT COMMENT '指标描述',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_index_code` (`index_code`)
) DEFAULT CHARSET=utf8mb4 COMMENT='监控指标定义表';

INSERT IGNORE INTO `monitor_index_defs` (`index_code`, `index_name`, `index_desc`) VALUES
('javascript', 'JS错误', 'JavaScript运行时错误'),
('promise', 'Promise错误', '未捕获的Promise拒绝'),
('resource', '资源错误', '静态资源加载失败'),
('network', '接口错误', 'AJAX/Fetch请求失败'),
('performance', '性能问题', '页面加载性能不达标'),
('white_screen', '白屏异常', '页面内容缺失');

-- 5. 告警实例表 (告警规则配置)
CREATE TABLE IF NOT EXISTS `alarm_instances` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `instance_id` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '实例ID(用户定义)',
  `instance_name` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '实例名称',
  `project` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '项目标识',
  `index_code` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '关联的指标代码',
  `threshold` INT NOT NULL DEFAULT 0 COMMENT '告警阈值',
  `time_frame` INT NOT NULL DEFAULT 60 COMMENT '时间窗口(秒)',
  `rules_json` LONGTEXT COMMENT '规则配置(JSON)',
  `instance_status` INT NOT NULL DEFAULT 1 COMMENT '状态: 1启用 0禁用',
  `created_at` BIGINT NOT NULL DEFAULT 0 COMMENT '创建时间戳(毫秒)',
  `updated_at` BIGINT NOT NULL DEFAULT 0 COMMENT '更新时间戳(毫秒)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_instance_id` (`instance_id`)
) DEFAULT CHARSET=utf8mb4 COMMENT='告警实例配置表';

CREATE INDEX `idx_alarm_instances_project` ON `alarm_instances` (`project`);

-- 6. 告警记录表
CREATE TABLE IF NOT EXISTS `alarm_records` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `project` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '项目标识',
  `instance_id` INT NOT NULL DEFAULT 0 COMMENT '关联的告警实例ID',
  `instance_name` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '实例名称(快照)',
  `instance_uuid` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '实例ID字符串(快照)',
  `error_id` INT NOT NULL DEFAULT 0 COMMENT '关联的错误ID',
  `alarm_level` VARCHAR(20) NOT NULL DEFAULT 'L1' COMMENT '告警级别: L1/L2/L3',
  `alarm_message` TEXT COMMENT '告警消息',
  `alarm_status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/confirmed/resolved',
  `customer_name` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '客户名称',
  `appkey` VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'AppKey',
  `service_name` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '服务名称',
  `created_at` BIGINT NOT NULL DEFAULT 0 COMMENT '创建时间戳(毫秒)',
  `updated_at` BIGINT NOT NULL DEFAULT 0 COMMENT '更新时间戳(毫秒)',
  PRIMARY KEY (`id`)
) DEFAULT CHARSET=utf8mb4 COMMENT='告警记录表';

CREATE INDEX `idx_alarm_records_created_at` ON `alarm_records` (`created_at`);
CREATE INDEX `idx_alarm_records_status` ON `alarm_records` (`alarm_status`);

-- 7. AppKey 注册中心表
CREATE TABLE IF NOT EXISTS `appkey_registry` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `appkey` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'AppKey(全局唯一)',
  `customer_name` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '所属客户名称',
  `service_name` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '关联服务/组件名称',
  `app_owner` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '申请人/负责人',
  `app_status` INT NOT NULL DEFAULT 1 COMMENT '状态: 1启用 0禁用',
  `created_at` BIGINT NOT NULL DEFAULT 0 COMMENT '创建时间戳(毫秒)',
  `updated_at` BIGINT NOT NULL DEFAULT 0 COMMENT '更新时间戳(毫秒)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_appkey` (`appkey`),
  KEY `idx_customer` (`customer_name`)
) DEFAULT CHARSET=utf8mb4 COMMENT='AppKey注册表';

-- ===========================================
-- 执行完毕！共 7 张表
-- ===========================================

-- ===========================================
-- 8. AI 巡检日报记录表（2026-08 新增）
-- ===========================================
-- AI 巡检日报记录表（2026-08 新增）
-- 所属数据库：monitor_system（即后端服务连接的业务库）

CREATE TABLE IF NOT EXISTS `daily_reports` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `report_date`     VARCHAR(10)   NOT NULL DEFAULT ''     COMMENT '报告日期 YYYY-MM-DD',
  `stat_json`       LONGTEXT      NOT NULL                COMMENT '原始统计数据(JSON)',
  `ai_summary_json` LONGTEXT      NOT NULL                COMMENT 'AI生成的结构化摘要(JSON)',
  `recipients`      VARCHAR(4096) NOT NULL DEFAULT ''     COMMENT '发送收件人列表(逗号分隔)',
  `email_sent`      TINYINT(1)    NOT NULL DEFAULT 0      COMMENT '邮件是否发送成功: 0否 1是',
  `vanish_recipients` VARCHAR(4096) NOT NULL DEFAULT ''   COMMENT 'Vanish收件账号列表(逗号分隔)',
  `vanish_sent`     TINYINT(1)    NOT NULL DEFAULT 0      COMMENT 'Vanish是否发送成功: 0否 1是',
  `trigger_type`    VARCHAR(20)   NOT NULL DEFAULT 'auto' COMMENT '触发方式: auto/manual',
  `created_at`      BIGINT        NOT NULL DEFAULT 0      COMMENT '创建时间戳(毫秒)',
  PRIMARY KEY (`id`),
  KEY `idx_report_date` (`report_date`),
  KEY `idx_created_at` (`created_at`)
) DEFAULT CHARSET=utf8mb4 COMMENT='AI巡检日报记录表';
