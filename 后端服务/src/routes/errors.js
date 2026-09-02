
/**
 * 错误相关路由
 */

const express = require('express');
const vanishService = require('../services/vanish');
const {
    buildAlarmAggregationScope,
    normalizeLevel,
    resolveEffectiveThreshold
} = require('../services/alarmPolicy');
const { generateFingerprint, resolveServerDropReason } = require('../services/reportPolicy');
const router = express.Router();


// const sourcemapService = require('../services/sourcemap'); // Removed

module.exports = (errorModel, sourcemapService, instanceModel, alarmModel, breadcrumbModel, appkeyModel, configModel) => {
    /**
     * POST /api/errors/report
     * 错误上报接口（新接口，与 /wczj/alarm/report 功能相同）
     */
    const reportHandler = async (req, res) => {
        try {
            const body = req.body;

            // --- AppKey 强校验拦截器 ---
            let appkeysToVerify = new Set();
            if (body.appkey) appkeysToVerify.add(body.appkey);
            if (body.list && Array.isArray(body.list)) {
                body.list.forEach(item => {
                    if (item.appkey) appkeysToVerify.add(item.appkey);
                });
            }

            if (appkeysToVerify.size === 0) {
                return res.status(403).json({ success: false, msg: 'Forbidden: Missing AppKey' });
            }

            const verifiedAppkeys = new Map();
            if (appkeyModel) {
                for (let ak of appkeysToVerify) {
                    const record = await appkeyModel.findByAppkey(ak);
                    if (!record || record.status !== 1) {
                        return res.status(403).json({
                            success: false,
                            msg: `Forbidden: Invalid or disabled AppKey [${ak}]`
                        });
                    }
                    verifiedAppkeys.set(ak, record);
                }
            }
            // ---------------------------

            let errorList = [];

            // 适配 SDK 的 list 格式
            if (body.list && Array.isArray(body.list)) {
                errorList = body.list.map(item => {
                    return {
                        ...item,
                        // 核心字段直接使用 (SDK 已标准化)
                        type: item.type || 'unknown',
                        message: item.message || '',
                        timestamp: typeof item.timestamp === 'string' ? Date.parse(item.timestamp) : (item.timestamp || Date.now()),

                        // 确保有 project 和 env
                        project: item.project || body.project || 'default',
                        env: item.env || body.env || 'development',
                        sdkVersion: item.sdkVersion || body.sdkVersion || '1.0.0',

                        // 确保 customer_name 从 body 级传递（如果 item 没有）
                        customer_name: item.customer_name || body.customer_name ||
                            verifiedAppkeys.get(item.appkey || body.appkey)?.customer_name || '',
                        service_name: item.service_name || body.service_name ||
                            verifiedAppkeys.get(item.appkey || body.appkey)?.service_name || '',

                        // SourceMap 相关字段
                        filename: item.filename || '',
                        lineno: item.lineno || 0,
                        colno: item.colno || 0,

                        // 其他字段
                        url: item.url || '',
                        stack: item.stack || ''
                    };
                });
            } else {
                // 兼容旧的单条上报
                errorList = [body];
            }

            const results = [];
            const configByScope = new Map();

            // 遍历处理每条错误
            // 取本次上报的 appkey（用于 SourceMap 精准定位业务组件的构建产物）
            for (const item of errorList) {
                const reportAppkey = item.appkey || body.appkey || '';
                const appkeyRecord = verifiedAppkeys.get(reportAppkey);
                const reportCustomer = item.customer_name || body.customer_name ||
                    appkeyRecord?.customer_name || '';
                const reportService = item.service_name || body.service_name ||
                    appkeyRecord?.service_name || '';
                const configScopeKey = `${reportAppkey}\u0000${reportCustomer}`;
                let matchedConfig = configByScope.get(configScopeKey);

                if (matchedConfig === undefined) {
                    matchedConfig = configModel
                        ? await configModel.findOne(reportAppkey, reportCustomer)
                        : null;
                    configByScope.set(configScopeKey, matchedConfig || null);
                }

                const dropReason = resolveServerDropReason(matchedConfig?.config, item.type || 'unknown');
                if (dropReason) {
                    results.push({
                        status: 'dropped',
                        reason: dropReason,
                        type: item.type || 'unknown'
                    });
                    continue;
                }

                // [TD-02] SourceMap 解析已移至 GET /:id 详情接口按需执行。
                // 上报接口只管快速落库，original_stack 留空占位，彻底消除高并发下的 Event Loop 阻塞。
                const originalStack = '';

                const errorData = {
                    project: item.project || body.project || 'default',
                    env: item.env || body.env || 'production',
                    type: item.type || 'unknown',
                    message: item.message || '',
                    stack: item.stack || '',
                    // 将解析后的堆栈和页面 URL 放入 extra_data 字段
                    extra_data: JSON.stringify({
                        ...(item.data || item.expand || {}),
                        ...(item.context || {}),
                        original_stack: '',   // [TD-02] 占位，查询详情时实时翻译
                        userAgent: item.userAgent || '',
                        pageUrl: item.url || '',  // 页面 URL
                        clientFingerprint: item.fingerprint || '',
                        runtimeId: item.runtimeId || body.runtimeId || '',
                        sdkVersion: item.sdkVersion || body.sdkVersion || '1.0.0',
                        configVersion: item.configVersion || body.configVersion ||
                            (matchedConfig?.updated_at ? String(matchedConfig.updated_at) : 'default'),
                        configMatched: Boolean(matchedConfig)
                    }),
                    // filename: 优先取脚本文件名，其次取页面 URL
                    filename: item.filename || item.url || '',
                    lineno: item.lineno || 0,
                    colno: item.colno || 0,
                    // user_id: 优先取 customer_name (SDK 上报的用户名)
                    user_id: reportCustomer || item.userId || item.user_id || '',
                    timestamp: item.timestamp || Date.now(),
                    created_at: Date.now(),
                    // 确保传递扩展业务字段，供 Model 写入 extra_data
                    customer_name: reportCustomer,
                    appkey: reportAppkey,
                    service_name: reportService
                };

                if (!errorData.type || !errorData.project || !errorData.env) {
                    console.warn('收到不完整的错误上报数据，已跳过:', errorData);
                    continue;
                }

                const fingerprint = generateFingerprint({
                    ...errorData,
                    context: item.context || item.data || item.expand || {}
                });
                errorData.fingerprint = fingerprint;

                // 插入数据库 (ErrorModel.insert 会处理去重/更新)
                const result = await errorModel.insert(errorData);

                // 结果处理
                // insert 返回 { id, updated, occurrence_count }
                results.push({
                    id: result.id,
                    status: result.updated ? 'updated' : 'created',
                    count: result.occurrence_count
                });

                // 💾 保存面包屑（仅首次插入时写入，去重更新跳过避免重复）
                if (!result.updated && breadcrumbModel && item.breadcrumbs && item.breadcrumbs.length > 0) {
                    breadcrumbModel.insertBatch(result.id, item.breadcrumbs).catch(err => {
                        console.error('[Breadcrumb] 保存面包屑失败:', err);
                    });
                }

                // ==========================================
                // 🚨 告警判定逻辑 (Alarm Logic)
                // ==========================================
                try {
                    // 1. 获取该项目的告警规则
                    const projectRules = await instanceModel.matchRules(errorData.project, reportAppkey);

                    // 2. 遍历规则进行匹配
                    for (const rule of projectRules) {
                        // 匹配指标ID (如 'javascript', 'resource')
                        if (rule.index_code === errorData.type) {

                            // 解析规则详细配置
                            let ruleConfig = {};
                            try {
                                ruleConfig = rule.rules_json ? JSON.parse(rule.rules_json) : {};
                            } catch (e) {
                                console.error('Parse rules_json failed', e);
                            }

                            // 2.1 严格匹配检查 (Strict Matching)
                            // 检查 AppKey
                            if (ruleConfig.appkey && ruleConfig.appkey !== errorData.appkey) {
                                continue; // Mismatch
                            }
                            if (ruleConfig.customer_name && ruleConfig.customer_name !== errorData.customer_name) {
                                continue;
                            }
                            if (ruleConfig.service_name && ruleConfig.service_name !== errorData.service_name) {
                                continue;
                            }
                            // 检查 User ID (如果规则配置了特定用户)
                            // 注意: errorData.user_id 可能为空，如果规则强制要求用户，则需匹配
                            // 这里假设 demo1/demo2 场景是明确配置了 user_id
                            if (ruleConfig.user_id && ruleConfig.user_id !== errorData.user_id) {
                                continue; // Mismatch
                            }

                            // 2.2 检查是否在静默期 (Silence Check)
                            const silenceInterval = (ruleConfig.repeat_interval || 600) * 1000; // default 10min
                            const lastAlarm = await alarmModel.findLatest({ instance_id: rule.id });

                            if (lastAlarm) {
                                const timeSinceLast = Date.now() - lastAlarm.created_at;
                                if (timeSinceLast < silenceInterval) {
                                    console.log(`[Alarm] Silenced: ${rule.instance_name} (Last: ${timeSinceLast / 1000}s ago < ${silenceInterval / 1000}s)`);
                                    continue; // Skip alarm
                                }
                            }

                            // 2.3 检查 repeat_count：在 time_frame 窗口内，触发次数不得超过 repeat_count
                            // repeat_count 语义：每个时间窗口内最多发送 N 封邮件
                            const repeatCount = parseInt(ruleConfig.repeat_count) || 0; // 0 表示不限制
                            if (repeatCount > 0) {
                                const timeFrame4Count = (rule.time_frame || 60) * 1000;
                                const windowStart = Date.now() - timeFrame4Count;
                                const firedInWindow = await alarmModel.countInWindow(rule.id, windowStart);
                                if (firedInWindow >= repeatCount) {
                                    console.log(`[Alarm] repeat_count reached: ${rule.instance_name} (fired ${firedInWindow}/${repeatCount} in window)`);
                                    continue; // 当前时间窗口内已达最大发送次数，跳过
                                }
                            }

                            // 按当前错误的完整业务维度和指纹统计，避免同项目下其他组件或错误互相抬高计数。
                            const timeFrame = rule.time_frame || 60; // default 60s
                            const now = Date.now();
                            const startTime = now - (timeFrame * 1000);
                            const level = normalizeLevel(ruleConfig.level);
                            const effectiveThreshold = resolveEffectiveThreshold(rule.threshold, level);

                            const errorCount = await errorModel.count({
                                ...buildAlarmAggregationScope(errorData),
                                startTime: startTime,
                                endTime: now
                            });

                            if (errorCount >= effectiveThreshold) {
                                // 触发告警！
                                console.log(`[Alarm] Rule matched: ${rule.instance_name}, Count: ${errorCount}/${effectiveThreshold}`);

                                const alarmRecord = {
                                    project: errorData.project,
                                    instance_id: rule.id, // Revert to using PK (Int) as instance_id
                                    instance_name: rule.instance_name || '', // Persist for history
                                    instance_uuid: rule.instance_id || '', // Persist user-defined ID
                                    error_id: result.id,
                                    level,
                                    message: `[${rule.instance_name}] 触发告警: ${timeFrame}秒内同一组件、客户、服务和错误指纹发生 ${errorCount} 次 (有效阈值: ${effectiveThreshold})`,
                                    status: 'pending',
                                    customer_name: errorData.customer_name || '',
                                    appkey: errorData.appkey || '',
                                    service_name: errorData.service_name || '',
                                    error_message: errorData.message || '',
                                    error_stack: errorData.stack || '',
                                    env: errorData.env || ''
                                };

                                await alarmModel.add(alarmRecord);

                                // 触发邮件告警 (异步执行，不阻塞后续流程)
                                if (ruleConfig.notice_person) {
                                    const emailService = require('../services/email');
                                    emailService.sendAlarmEmail(ruleConfig.notice_person, alarmRecord).catch(err => {
                                        console.error('[Alarm] 发送告警邮件失败:', err);
                                    });
                                }

                                // Vanish 与邮件并行作为独立通知渠道；失败不影响错误上报和告警落库。
                                if (ruleConfig.vanish_enabled === true && ruleConfig.vanish_notice_person) {
                                    vanishService.sendAlarm(ruleConfig.vanish_notice_person, alarmRecord).catch(err => {
                                        console.error('[Alarm] 发送 Vanish 告警失败:', err.message);
                                    });
                                }
                            }
                        }
                    }
                } catch (alarmErr) {
                    console.error('[Alarm] Check failed:', alarmErr);
                }
            }

            res.json({
                success: true,
                msg: '错误上报成功',
                data: results
            });
        } catch (error) {
            console.error('错误上报失败:', error);
            res.status(500).json({
                success: false,
                msg: '错误上报失败',
                error: error.message
            });
        }
    };

    router.post('/report', reportHandler);
    router.reportHandler = reportHandler;

    /**
     * GET /api/errors/list
     * 获取错误列表
     */
    router.get('/list', async (req, res) => {
        try {
            const {
                page = 1,
                pageSize = 20,
                project,
                env,
                type,
                severity,
                keyword,
                startTime,
                endTime,
                customer_name,
                appkey,
                service_name
            } = req.query;

            const result = await errorModel.findList({
                page: parseInt(page),
                pageSize: parseInt(pageSize),
                project,
                env,
                type,
                severity,
                keyword,
                startTime: startTime ? parseInt(startTime) : null,
                endTime: endTime ? parseInt(endTime) : null,
                customer_name,
                appkey,
                service_name
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('查询错误列表失败:', error);
            res.status(500).json({
                success: false,
                msg: '查询错误列表失败',
                error: error.message
            });
        }
    });

    // 删除错误记录
    router.post('/delete', async (req, res) => {
        try {
            const { id } = req.body;
            if (!id) {
                return res.status(400).json({
                    success: false,
                    msg: '缺少错误记录ID'
                });
            }
            const deleted = await errorModel.delete(id);
            if (deleted) {
                res.json({ success: true, data: { deleted: true } });
            } else {
                res.status(404).json({ success: false, msg: '未找到该错误记录' });
            }
        } catch (error) {
            console.error('删除错误记录失败:', error);
            res.status(500).json({
                success: false,
                msg: '删除错误记录失败',
                error: error.message
            });
        }
    });

    // ⚠️ 注意：/:id 路由已移至 /stats 和 /trend 路由之后
    // 因为 Express 按顺序匹配，/:id 会拦截 /stats 等请求

    /**
     * GET /api/errors/dashboard
     * Dashboard 综合统计接口，一次性返回：
     *   - statsByAppkey: 按 AppKey 分组的错误量（含 byType）
     *   - trend:         7天按天趋势（含分类）
     *   - topErrors:     高频错误 Top 10
     *   - recentAlarms:  最近 5 条告警快照
     */
    router.get('/dashboard', async (req, res) => {
        try {
            // === 修改点 1: 提取 project 和 env ===
            const { project, env } = req.query;
            const days = parseInt(req.query.days) || 7;
            const endTime = Date.now();
            const startTime = endTime - days * 24 * 60 * 60 * 1000;

            // === 修改点 2: 将参数透传给底层 Model ===
            const [statsByAppkey, trendData, statsGlobal] = await Promise.all([
                errorModel.getStatsByAppkey({ project, env, startTime, endTime }),
                errorModel.getTrend({ project, env, startTime, endTime, interval: 'day' }),
                errorModel.getStats({ project, env, startTime, endTime })
            ]);

            // 最近告警（直接查 alarm_records）
            let recentAlarms = [];
            if (alarmModel) {
                const alarmResult = await alarmModel.findList({
                    page: 1,
                    per: 5,
                    project, // 增加按项目过滤
                    env      // 增加按环境过滤
                });
                recentAlarms = alarmResult.data || [];
            }

            res.json({
                success: true,
                data: {
                    statsByAppkey,
                    trend: trendData.timeline || [],
                    topErrors: (statsGlobal.topErrors || []).slice(0, 10),
                    typeDistribution: statsGlobal.byType || {},
                    totalErrors: statsGlobal.total || 0,
                    recentAlarms,
                    timeRange: { startTime, endTime, days }
                }
            });
        } catch (error) {
            console.error('Dashboard 数据获取失败:', error);
            res.status(500).json({ success: false, msg: 'Dashboard 数据获取失败', error: error.message });
        }
    });

    /**
     * GET /api/errors/stats
     * 获取错误统计
     */
    router.get('/stats', async (req, res) => {
        try {
            const { project, env, startTime, endTime } = req.query;

            // 如果缺少参数，返回空数据而不是报错
            if (!project || !env) {
                return res.json({
                    success: true,
                    data: { total: 0, byType: {}, topErrors: [] }
                });
            }

            const stats = await errorModel.getStats({
                project,
                env,
                startTime: startTime ? parseInt(startTime) : null,
                endTime: endTime ? parseInt(endTime) : null
            });

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('获取错误统计失败:', error);
            res.status(500).json({
                success: false,
                msg: '获取错误统计失败',
                error: error.message
            });
        }
    });

    /**
     * GET /api/errors/trend
     * 获取错误趋势
     */
    router.get('/trend', async (req, res) => {
        try {
            const { project, env, startTime, endTime, interval = 'hour' } = req.query;

            // 如果缺少参数，返回空数据而不是报错
            if (!project || !env) {
                return res.json({
                    success: true,
                    data: { timeline: [] }
                });
            }

            const trend = await errorModel.getTrend({
                project,
                env,
                startTime: startTime ? parseInt(startTime) : null,
                endTime: endTime ? parseInt(endTime) : null,
                interval
            });

            res.json({
                success: true,
                data: trend
            });
        } catch (error) {
            console.error('获取错误趋势失败:', error);
            res.status(500).json({
                success: false,
                msg: '获取错误趋势失败',
                error: error.message
            });
        }
    });

    /**
     * GET /api/errors/projects
     * 获取所有项目列表
     */
    router.get('/projects', async (req, res) => {
        try {
            const projects = await errorModel.getProjects();
            res.json({
                success: true,
                data: projects
            });
        } catch (error) {
            console.error('获取项目列表失败:', error);
            res.status(500).json({
                success: false,
                msg: '获取项目列表失败',
                error: error.message
            });
        }
    });

    /**
     * GET /api/errors/:id
     * 获取错误详情
     * ⚠️ 必须放在 /stats, /trend 等具名路由之后，否则会拦截这些请求
     */
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const error = await errorModel.findById(parseInt(id));

            if (!error) {
                return res.status(404).json({
                    success: false,
                    msg: '错误记录不存在'
                });
            }

            // 关联查询该错误的用户行为面包屑
            let breadcrumbs = [];
            if (breadcrumbModel) {
                try {
                    breadcrumbs = await breadcrumbModel.findByErrorId(parseInt(id));
                } catch (e) {
                    console.warn('[Breadcrumb] 查询面包屑失败，忽略:', e.message);
                }
            }

            // [TD-02] 按需实时解析 SourceMap：仅在查看详情时执行，不在上报时执行。
            // 读取 extra_data 中的占位 original_stack，若为空则触发解析。
            let originalStack = '';
            try {
                const extraData = error.extra_data ? JSON.parse(error.extra_data) : {};
                if (extraData.original_stack) {
                    // 已有解析结果（历史兼容），直接使用
                    originalStack = extraData.original_stack;
                } else if (error.stack && sourcemapService) {
                    // 占位为空，按需实时解析
                    const appkey = error.appkey || '';
                    originalStack = await sourcemapService.parseStack(error.stack, appkey);
                }
            } catch (e) {
                console.warn('[SourceMap] 按需解析失败，降级返回原始堆栈:', e.message);
                originalStack = error.stack || ''; // 降级：返回混淆堆栈
            }

            res.json({
                success: true,
                data: {
                    ...error,
                    original_stack: originalStack,
                    breadcrumbs
                }
            });
        } catch (error) {
            console.error('查询错误详情失败:', error);
            res.status(500).json({
                success: false,
                msg: '查询错误详情失败',
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/errors/:id
     * 删除错误记录
     */
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const deleted = await errorModel.delete(parseInt(id));

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    msg: '错误记录不存在'
                });
            }

            res.json({
                success: true,
                msg: '删除成功'
            });
        } catch (error) {
            console.error('删除错误记录失败:', error);
            res.status(500).json({
                success: false,
                msg: '删除错误记录失败',
                error: error.message
            });
        }
    });

    return router;
};
