/**
 * Express 应用主文件
 * 整合所有模块，启动服务器
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// 导入配置
const serverConfig = require('./config/server');

// 导入数据库和模型
const DatabaseInit = require('./db/init');
const ErrorModel = require('./db/models/error');
const ConfigModel = require('./db/models/config');
const BreadcrumbModel = require('./db/models/breadcrumb');
const IndexModel = require('./db/models/index');
const InstanceModel = require('./db/models/instance');
const AlarmModel = require('./db/models/alarm');
const AppkeyModel = require('./db/models/appkey');
const DailyReportModel = require('./db/models/dailyReport');

// 导入服务
const SourceMapService    = require('./services/sourcemap');
const OssSourceMapService = require('./services/sourcemapOss');
const AiDailyReportService = require('./services/aiDailyReport');
const vanishService = require('./services/vanish');

// 导入路由
const createErrorRoutes = require('./routes/errors');
const createConfigRoutes = require('./routes/config');
const createSourceMapRoutes = require('./routes/sourcemap');
const createIndexRoutes = require('./routes/index');
const createInstanceRoutes = require('./routes/instance');
const createAlarmRoutes = require('./routes/alarm');
const createAppkeyRoutes = require('./routes/appkey');
const createAiRoutes = require('./routes/ai');
const createAiDailyReportRoutes = require('./routes/aiDailyReport');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/authMiddleware');

class MonitorServer {
    constructor() {
        this.app = express();
        this.db = null;
        this.models = {};
        this.services = {};
    }

    /**
     * 初始化数据库
     */
    async initDatabase() {
        console.log('📦 初始化数据库...');
        try {
            // Pass full config to support MySQL
            const dbInit = new DatabaseInit(serverConfig.database);
            this.db = await dbInit.init();
            console.log('✅ 数据库初始化完成');
        } catch (error) {
            console.error('⚠️  注意：数据库连接失败，服务将以 [无数据库模式] 启动。');
            console.error('   错误详情:', error.message);
            console.error('   说明: /health 接口将返回 200，但业务接口可能会报错 (500)。');
            this.db = null;
            // 启动自动重连定时器，数据库恢复后无需手动重启 Pod
            this.startReconnectTimer();
        }

        // 初始化模型 (即使无DB也初始化对象，防止空指针，但调用方法时会报错)
        this.models.error = new ErrorModel(this.db);
        this.models.config = new ConfigModel(this.db);
        this.models.breadcrumb = new BreadcrumbModel(this.db);
        this.models.index = new IndexModel(this.db);
        this.models.instance = new InstanceModel(this.db);
        this.models.alarm = new AlarmModel(this.db);
        this.models.appkey = new AppkeyModel(this.db);
        this.models.dailyReport = new DailyReportModel(this.db);
    }

    /**
     * 数据库自动重连
     * 每 30 秒尝试重连一次；成功后重建所有 model 实例，无需重启服务
     */
    startReconnectTimer() {
        if (this._reconnectTimer) return; // 避免重复启动
        console.log('🔄 启动数据库自动重连（每 30 秒）...');

        this._reconnectTimer = setInterval(async () => {
            if (this.db) {
                // 已经连通，停止重连
                clearInterval(this._reconnectTimer);
                this._reconnectTimer = null;
                return;
            }
            console.log('🔄 尝试重连数据库...');
            try {
                const dbInit = new DatabaseInit(serverConfig.database);
                const newDb = await dbInit.init();
                this.db = newDb;

                // 重建所有 model 实例，使其使用新连接
                this.models.error = new ErrorModel(this.db);
                this.models.config = new ConfigModel(this.db);
                this.models.breadcrumb = new BreadcrumbModel(this.db);
                this.models.index = new IndexModel(this.db);
                this.models.instance = new InstanceModel(this.db);
                this.models.alarm = new AlarmModel(this.db);
                this.models.appkey = new AppkeyModel(this.db);
                this.models.dailyReport = new DailyReportModel(this.db);

                console.log('✅ 数据库重连成功，所有服务已恢复！');
                clearInterval(this._reconnectTimer);
                this._reconnectTimer = null;
            } catch (err) {
                console.warn('❌ 重连失败，30 秒后再试:', err.message);
            }
        }, 30000);
    }

    /**
     * 初始化服务
     * 若 OSS 环境变量已完整配置，使用 OssSourceMapService；否则降级为本地文件模式。
     */
    initServices() {
        console.log('🔧 初始化服务...');

        const ossConfig = serverConfig.oss;
        const ossEnabled = ossConfig.endpoint && ossConfig.accessKey && ossConfig.secretKey;

        if (ossEnabled) {
            this.services.sourcemap = new OssSourceMapService(ossConfig);
            console.log('✅ OSS 模式已启用，SourceMap 将从 OSS 读取');
        } else {
            const sourcemapDir = path.resolve(__dirname, '..', serverConfig.sourcemap.dir);
            this.services.sourcemap = new SourceMapService(sourcemapDir);
            console.log('⚠️  OSS 未配置，降级为本地文件模式（OSS_ENDPOINT/OSS_ACCESS_KEY/OSS_SECRET_KEY 未设置）');
        }

        console.log('✅ 服务初始化完成');
    }

    /**
     * 配置中间件
     */
    setupMiddleware() {
        // CORS
        this.app.use(cors(serverConfig.cors));

        // JSON 解析
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // 静态文件服务
        this.app.use(express.static(path.join(__dirname, '../../')));

        // 请求日志
        this.app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * 配置路由
     */
    setupRoutes() {
        console.log('🛓️  配置路由...');

        // 鉴权路由（公开，无需 token）
        this.app.use('/api/auth', authRoutes);

        // 全局鉴权中间件（白名单在中间件内部处理）
        this.app.use(authMiddleware);

        // 新的 API 路由
        this.app.use('/api/errors', createErrorRoutes(this.models.error, this.services.sourcemap, this.models.instance, this.models.alarm, this.models.breadcrumb, this.models.appkey));
        this.app.use('/api/config', createConfigRoutes(this.models.config, this.models.appkey));
        this.app.use('/api/sourcemap', createSourceMapRoutes(this.services.sourcemap));
        this.app.use('/api/appkey', createAppkeyRoutes(this.models.appkey));
        this.app.use('/api/ai', createAiRoutes());

        // AI 巡检日报
        this.services.aiDailyReport = new AiDailyReportService(
            this.models.error,
            this.models.config,
            this.models.dailyReport,
            { vanishService }
        );
        this.app.use('/api/ai-daily-report', createAiDailyReportRoutes(
            this.models.dailyReport,
            this.models.config,
            this.services.aiDailyReport,
            vanishService
        ));

        // 指标和实例路由
        this.app.use('/api/index', createIndexRoutes(this.models.index));
        this.app.use('/api/instance', createInstanceRoutes(this.models.instance));
        this.app.use('/api/alarm', createAlarmRoutes(this.models.alarm));

        // 兼容旧接口：告警上报
        this.app.post('/wczj/alarm/report', async (req, res) => {
            try {
                const reportData = req.body;
                console.log('收到告警上报 (WCZJ格式):', JSON.stringify(reportData, null, 2));

                // 转换为统一格式
                const errorData = {
                    type: reportData.type || 'javascript',
                    message: reportData.message,
                    severity: reportData.severity || 'error',
                    url: reportData.url,
                    filename: reportData.filename,
                    lineno: reportData.lineno,
                    colno: reportData.colno,
                    stack: reportData.stack,
                    sdk_version: reportData.sdkVersion,
                    project: reportData.project,
                    env: reportData.env,
                    customer_name: reportData.customer_name,
                    user_agent: reportData.userAgent,
                    breadcrumbs: reportData.breadcrumbs || [],
                    extra_data: reportData.extraData || {},
                    timestamp: reportData.timestamp || Date.now()
                };

                // 生成错误指纹
                const crypto = require('crypto');
                const fingerprintData = `${errorData.type}:${errorData.message}:${errorData.filename}:${errorData.lineno}`;
                errorData.fingerprint = crypto.createHash('md5').update(fingerprintData).digest('hex');

                // 解析 SourceMap
                let parsedError = errorData;
                if (errorData.sdk_version && errorData.filename) {
                    parsedError = await this.services.sourcemap.parseError(errorData);
                }

                // 插入数据库
                const result = this.models.error.insert(parsedError);

                res.json({
                    success: true,
                    flag: 200,
                    msg: '告警上报成功',
                    data: {
                        errorId: result.id,
                        parsed: !!parsedError.original_filename
                    }
                });
            } catch (error) {
                console.error('处理告警上报失败:', error);
                res.status(500).json({
                    success: false,
                    flag: 500,
                    msg: 'Internal server error',
                    error: error.message
                });
            }
        });

        // 兼容旧接口：获取配置
        this.app.get('/wczj/monitor/config', async (req, res) => {
            try {
                const { project, env, customer_name, appkey } = req.query;

                console.log('[Config API] Request:', { project, env, customer_name, appkey });

                // --- AppKey 强校验拦截器（前置关闭 SDK）---
                if (appkey && this.models.appkey) {
                    const appkeyRecord = await this.models.appkey.findByAppkey(appkey);
                    if (!appkeyRecord || appkeyRecord.status !== 1) {
                        return res.json({
                            enabled: false,
                            appkeyInvalid: true,
                            emergency: {
                                closeMonitor: true,
                                reason: 'AppKey未注册或已被禁用'
                            }
                        });
                    }
                }
                // ----------------------------------------

                // 从数据库查询配置
                const dbConfig = this.models.config.findOne(project, env, customer_name || null);

                let responseConfig;
                if (dbConfig) {
                    responseConfig = dbConfig.config;
                } else {
                    // 返回默认配置
                    responseConfig = getDefaultConfig(env);
                }

                console.log('[Config API] Response:', JSON.stringify(responseConfig, null, 2));
                res.json(responseConfig);
            } catch (error) {
                console.error('[Config API] Error:', error);
                res.status(500).json({
                    error: 'Failed to fetch config',
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: Date.now(),
                database: this.db ? 'connected' : 'disconnected'
            });
        });

        // 数据库统计
        this.app.get('/api/db/stats', (req, res) => {
            try {
                const tables = ['errors', 'configs', 'breadcrumbs'];
                const stats = {};

                tables.forEach(table => {
                    const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                    stats[table] = result.count;
                });

                res.json({
                    success: true,
                    data: stats
                });
            } catch (error) {
                console.error('获取数据库统计失败:', error);
                res.status(500).json({
                    success: false,
                    msg: '获取数据库统计失败',
                    error: error.message
                });
            }
        });

        console.log('✅ 路由配置完成');
    }

    /**
     * 错误处理
     */
    setupErrorHandling() {
        // 404 处理
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                msg: 'API endpoint not found'
            });
        });

        // 全局错误处理
        this.app.use((err, req, res, next) => {
            console.error('全局错误:', err);
            res.status(500).json({
                success: false,
                msg: 'Internal server error',
                error: err.message
            });
        });
    }

    /**
     * AI 巡检日报定时调度
     * 每 60 秒检查一次：若当前为上海时间 09:00 且今日 auto 记录未生成，则触发
     */
    scheduleDailyReport() {
        if (this._dailyReportCron) return;
        console.log('🤖 AI 巡检日报 Cron 已启动（每天 09:00 上海时间自动触发）');

        this._dailyReportCron = setInterval(async () => {
            try {
                const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
                const now = new Date(nowStr);
                if (now.getHours() !== 9 || now.getMinutes() !== 0) return;

                console.log('[AiDailyReport Cron] 触发每日 09:00 自动巡检日报...');
                await this.services.aiDailyReport.generateReport({ triggerType: 'auto' });
            } catch (err) {
                console.error('[AiDailyReport Cron] 定时任务执行失败:', err.message);
            }
        }, 60 * 1000);
    }

    /**
     * 启动服务器
     */
    async start() {
        try {
            // 初始化
            await this.initDatabase();
            this.initServices();

            // 配置
            this.setupMiddleware();
            this.setupRoutes();
            this.setupErrorHandling();

            // 启动服务器
            const PORT = serverConfig.port;
            this.app.listen(PORT, () => {
                console.log('='.repeat(50));
                console.log('🚀 云监控告警系统后端服务已启动');
                console.log('='.repeat(50));
                console.log(`📍 服务地址: http://localhost:${PORT}`);
                console.log(`📦 数据库: ${serverConfig.database.path}`);
                console.log(`🗺️  SourceMap 目录: ${serverConfig.sourcemap.dir}`);
                console.log(`🌍 环境: ${serverConfig.env}`);
                console.log('='.repeat(50));
                console.log('\n可用接口清单:');
                console.log('--- 核心业务 ---');
                console.log('  POST   /api/errors/report          - 错误上报');
                console.log('  GET    /api/errors/list            - 错误列表');
                console.log('  GET    /api/errors/:id             - 错误详情');
                console.log('  DELETE /api/errors/:id             - 删除错误');
                console.log('  GET    /api/errors/stats           - 错误统计');
                console.log('  GET    /api/errors/trend           - 错误趋势');
                console.log('--- 配置管理 ---');
                console.log('  GET    /api/config                 - 获取配置');
                console.log('  POST   /api/config/update          - 更新配置');
                console.log('  GET    /api/config/list            - 配置列表');
                console.log('--- 管理台 ---');
                console.log('  POST   /api/alarm/query/page       - 告警记录');
                console.log('  POST   /api/index/query/page       - 指标监控');
                console.log('  POST   /api/instance/query/page    - 实例列表');
                console.log('  GET    /api/appkey/list            - AppKey查询');
                console.log('--- 系统 & 运维 ---');
                console.log('  POST   /api/sourcemap/parse        - SourceMap解析');
                console.log('  GET    /health                     - 健康检查');
                console.log('  GET    /api/db/stats               - 数据库统计');
                console.log('--- 兼容接口 ---');
                console.log('  POST   /wczj/alarm/report          - 老SDK上报');
                console.log('  GET    /wczj/monitor/config        - 老SDK配置');
                console.log('--- AI 巡检日报 ---');
                console.log('  POST   /api/ai-daily-report/trigger   - 手动触发日报');
                console.log('  GET    /api/ai-daily-report/list      - 历史日报列表');
                console.log('  GET    /api/ai-daily-report/:id       - 日报详情');
                console.log('  GET    /api/ai-daily-report/recipients- 读取收件人');
                console.log('  POST   /api/ai-daily-report/recipients- 更新收件人');
                console.log('='.repeat(50));
            });

            // 启动 AI 巡检日报 Cron（每 60 秒检查一次，09:00 上海时间自动触发）
            this.scheduleDailyReport();

            // 优雅关闭
            process.on('SIGINT', () => {
                console.log('\n正在关闭服务器...');
                if (this._dailyReportCron) clearInterval(this._dailyReportCron);
                if (this.db) {
                    this.db.close();
                }
                if (this.services.sourcemap) {
                    this.services.sourcemap.clearCache();
                }
                process.exit(0);
            });

        } catch (error) {
            console.error('❌ 启动服务器失败:', error);
            process.exit(1);
        }
    }
}

/**
 * 默认配置
 */
function getDefaultConfig(env) {
    return {
        enabled: true,
        config: {
            enableErrorMonitoring: true,
            enablePromiseRejection: true,
            enableResourceErrors: true,
            enableNetworkMonitoring: true,
            enableXHRMonitoring: true,
            enableFetchMonitoring: true,
            enablePerformanceMonitoring: false,
            enableWhiteScreenDetection: true,
            enableUserTracking: false,
            errorSampleRate: {
                javascript: 1.0,
                promise: 1.0,
                resource: 0.5,
                network: 0.3
            },
            maxErrorsPerMinute: 100,
            dedupeWindow: 300,
            logLevel: env === 'dev' ? 'debug' : 'warn'
        },
        grayControl: {
            enabled: false,
            strategy: 'percentage',
            percentage: 100
        },
        emergency: {
            closeMonitor: false,
            reason: null
        },
        meta: {
            version: '1.0.0',
            updatedAt: Date.now(),
            ttl: 300
        }
    };
}

// 导出服务器类
module.exports = MonitorServer;

// 如果直接运行此文件，启动服务器
if (require.main === module) {
    const server = new MonitorServer();
    server.start();
}
