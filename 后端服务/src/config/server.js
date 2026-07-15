/**
 * 服务器配置
 */

const isProd = process.env.NODE_ENV === 'production';

// 生产环境强制校验 JWT_SECRET，防止弱密钥上线
if (isProd && !process.env.JWT_SECRET) {
    throw new Error('[AUTH] 生产环境必须通过环境变量 JWT_SECRET 配置 JWT 签名密钥，拒绝启动！');
}

// 生产环境数据库配置
// ⚠️ 所有敏感值必须通过环境变量注入，请勿在此硬编码真实密码
// 部署时在容器平台「配置管理」中设置以下环境变量：
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
const PROD_DB = {
    host: process.env.DB_HOST || 'your-mysql-proxysql-host',
    port: parseInt(process.env.DB_PORT || '6033'),
    user: process.env.DB_USER || 'your-db-user',
    password: process.env.DB_PASSWORD || '', // 必须通过环境变量注入
    database: process.env.DB_NAME || 'your-db-name'
};

module.exports = {
    // 服务器端口
    port: process.env.PORT || 9998,

    // 数据库配置
    database: {
        type: process.env.DB_TYPE || (isProd ? 'mysql' : 'sqlite'), // 生产环境强制用 MySQL

        // SQLite 配置 (本地默认)
        path: process.env.DB_PATH || './database/monitor.db',

        // MySQL 配置
        // 逻辑：优先读环境变量 -> 其次读硬编码的生产配置(仅限生产环境) -> 最后回退到本地默认
        host: process.env.DB_HOST || (isProd ? PROD_DB.host : 'localhost'),
        port: process.env.DB_PORT || (isProd ? PROD_DB.port : 3306),
        user: process.env.DB_USER || (isProd ? PROD_DB.user : 'root'),
        password: process.env.DB_PASSWORD || (isProd ? PROD_DB.password : 'root'),
        database: process.env.DB_NAME || (isProd ? PROD_DB.database : 'monitor_system'),
        timezone: process.env.DB_TIMEZONE || '+08:00'
    },

    // SourceMap 配置
    sourcemap: {
        dir: process.env.SOURCEMAP_DIR || './sourcemaps'
    },

    // OSS 配置（S3 兼容协议，用于 SourceMap 文件持久化存储）
    // 部署时在容器平台「配置管理」中设置以下环境变量：
    //   OSS_ENDPOINT, OSS_ACCESS_KEY, OSS_SECRET_KEY, OSS_BUCKET
    oss: {
        endpoint:  process.env.OSS_ENDPOINT  || '',
        accessKey: process.env.OSS_ACCESS_KEY || '',
        secretKey: process.env.OSS_SECRET_KEY || '',
        bucket:    process.env.OSS_BUCKET     || 'b2b-web-monitor.sourcemap',
    },

    // CORS 配置
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true
    },

    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || '../logs'
    },

    // 邮件发送配置 (SMTP)
    // ⚠️ SMTP 密码必须通过环境变量 SMTP_PASS 注入，请勿硬编码
    email: {
        enabled: process.env.EMAIL_ENABLED !== 'false', // 默认开启
        host: process.env.SMTP_HOST || 'your-smtp-host',
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: process.env.SMTP_SECURE !== 'false', // true for 465 (smtps)
        auth: {
            user: process.env.SMTP_USER || 'your-smtp-user@example.com',
            pass: process.env.SMTP_PASS || '' // 必须通过环境变量注入
        },
        from: process.env.SMTP_FROM || '云监控告警系统 <your-smtp-user@example.com>'
    },

    // 管理员鉴权配置
    auth: {
        username: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASS || 'admin',
        // 开发环境有 fallback 默认值；生产环境必须设置 JWT_SECRET 环境变量（见上方强校验）
        jwtSecret: process.env.JWT_SECRET || 'monitor-dev-secret-do-not-use-in-prod',
        tokenExpire: '24h',
        cookieName: 'monitor_token'
    },

    // 大模型配置
    ai: {
        baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
        apiKey: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL || 'deepseek-chat'
    },

    // 环境
    env: process.env.NODE_ENV || 'development'
};
