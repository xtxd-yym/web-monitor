
-- 云监控告警系统 - 数据库表结构 (SQLite版，与MySQL schema_mysql.sql保持同步)
-- SQLite Database Schema

-- ============================================
-- 1. error_logs 表 - 错误数据存储
-- ============================================
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL DEFAULT '',
  env TEXT NOT NULL DEFAULT 'production',
  error_type TEXT NOT NULL DEFAULT 'javascript',
  error_message TEXT,
  error_stack TEXT,
  error_file TEXT NOT NULL DEFAULT '',
  error_line INTEGER NOT NULL DEFAULT 0,
  error_col INTEGER NOT NULL DEFAULT 0,
  user_id TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL DEFAULT '',
  error_status TEXT NOT NULL DEFAULT 'open',
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  extra_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_logs_project_env ON error_logs(project, env);
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);


-- ============================================
-- 2. monitor_configs 表 - 监控配置管理
-- 按组件管理：唯一标识为 appkey + customer_name
-- ============================================
CREATE TABLE IF NOT EXISTS monitor_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appkey TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  env TEXT NOT NULL DEFAULT 'production',
  config_json TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  
  UNIQUE(appkey, customer_name)
);

CREATE INDEX IF NOT EXISTS idx_configs_appkey ON monitor_configs(appkey);
CREATE INDEX IF NOT EXISTS idx_configs_customer ON monitor_configs(customer_name);


-- ============================================
-- 3. user_breadcrumbs 表 - 用户操作轨迹
-- ============================================
CREATE TABLE IF NOT EXISTS user_breadcrumbs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_id INTEGER NOT NULL DEFAULT 0,
  breadcrumb_type TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  breadcrumb_message TEXT,
  breadcrumb_data TEXT,
  event_time INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_breadcrumbs_error_id ON user_breadcrumbs(error_id);


-- ============================================
-- 4. monitor_index_defs 表 - 指标定义
-- ============================================
CREATE TABLE IF NOT EXISTS monitor_index_defs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  index_code TEXT NOT NULL DEFAULT '' UNIQUE,
  index_name TEXT NOT NULL DEFAULT '',
  index_desc TEXT
);

-- 预置指标数据
INSERT OR IGNORE INTO monitor_index_defs (index_code, index_name, index_desc) VALUES
('javascript', 'JS错误', 'JavaScript运行时错误'),
('promise', 'Promise错误', '未捕获的Promise拒绝'),
('resource', '资源错误', '静态资源加载失败'),
('network', '接口错误', 'AJAX/Fetch请求失败'),
('performance', '性能问题', '页面加载性能不达标'),
('white_screen', '白屏异常', '页面内容缺失');


-- ============================================
-- 5. alarm_instances 表 - 告警实例/规则
-- ============================================
CREATE TABLE IF NOT EXISTS alarm_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL DEFAULT '' UNIQUE,
  instance_name TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  index_code TEXT NOT NULL DEFAULT '',
  threshold INTEGER NOT NULL DEFAULT 0,
  time_frame INTEGER NOT NULL DEFAULT 60,
  rules_json TEXT,
  instance_status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alarm_instances_project ON alarm_instances(project);


-- ============================================
-- 6. alarm_records 表 - 告警记录
-- ============================================
CREATE TABLE IF NOT EXISTS alarm_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL DEFAULT '',
  instance_id INTEGER NOT NULL DEFAULT 0,
  instance_name TEXT NOT NULL DEFAULT '',
  instance_uuid TEXT NOT NULL DEFAULT '',
  error_id INTEGER NOT NULL DEFAULT 0,
  alarm_level TEXT NOT NULL DEFAULT 'L1',
  alarm_message TEXT,
  alarm_status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT,
  appkey TEXT,
  service_name TEXT,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alarm_records_created_at ON alarm_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alarm_records_status ON alarm_records(alarm_status);

-- ============================================
-- 7. appkey_registry 表 - AppKey 注册中心
-- ============================================
CREATE TABLE IF NOT EXISTS appkey_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appkey TEXT NOT NULL DEFAULT '' UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  service_name TEXT NOT NULL DEFAULT '',
  app_owner TEXT NOT NULL DEFAULT '',
  app_status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_registry_appkey ON appkey_registry(appkey);
CREATE INDEX IF NOT EXISTS idx_registry_customer ON appkey_registry(customer_name);

-- ============================================
-- 8. daily_reports 表 - AI 巡检日报记录
-- ============================================
CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL DEFAULT '',
  stat_json TEXT,
  ai_summary_json TEXT,
  recipients TEXT NOT NULL DEFAULT '',
  email_sent INTEGER NOT NULL DEFAULT 0,
  vanish_recipients TEXT NOT NULL DEFAULT '',
  vanish_sent INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL DEFAULT 'auto',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_created_at ON daily_reports(created_at DESC);
