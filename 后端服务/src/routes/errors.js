
/**
 * 错误相关路由
 */

const express = require('express');
const router = express.Router();


const configModel = require('../db/models/config');
// const sourcemapService = require('../services/sourcemap'); // Removed

module.exports = (errorModel, sourcemapService, instanceModel, alarmModel, breadcrumbModel, appkeyModel) => {
    /**
     * POST /api/errors/report
     * 错误上报接口（新接口，与 /wczj/alarm/report 功能相同）
     */
    router.post('/report', async (req, res) => {
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

            if (appkeyModel) {
                for (let ak of appkeysToVerify) {
                    const record = await appkeyModel.findByAppkey(ak);
                    if (!record || record.status !== 1) {
                        return res.status(403).json({
                            success: false,
                            msg: `Forbidden: Invalid or disabled AppKey [${ak}]`
                        });
                    }
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
                        customer_name: item.customer_name || body.customer_name || body.appkey || '', // Fallback to appkey if no customer name? User req 1 says customer name -> keys. User says "correspond to frontend customer_name"
                        service_name: item.service_name || body.service_name || '', // Extract service_name

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
            // 获取 SDK 版本，用于 SourceMap 解析
            const sdkVersion = body.sdkVersion || '1.0.0';

            // 遍历处理每条错误
            // 取本次上报的 appkey（用于 SourceMap 精准定位业务组件的构建产物）
            const reportAppkey = body.appkey || '';

            for (const item of errorList) {
                // 🔍 尝试通过 SourceMap 解析堆栈（按 appkey 定位对应的 .map 文件）
                let originalStack = '';
                if (item.stack) {
                    try {
                        const appkey = item.appkey || reportAppkey;
                        originalStack = await sourcemapService.parseStack(item.stack, appkey);
                    } catch (e) {
                        console.warn('[SourceMap] 堆栈解析失败:', e.message);
                    }
                }

                const errorData = {
                    project: item.project || body.project || 'default',
                    env: item.env || body.env || 'production',
                    type: item.type || 'unknown',
                    message: item.message || '',
                    stack: item.stack || '',
                    // 将解析后的堆栈和页面 URL 放入 extra_data 字段
                    extra_data: JSON.stringify({
                        ...(item.data || item.expand || {}),
                        original_stack: originalStack,
                        userAgent: item.userAgent || '',
                        pageUrl: item.url || ''  // 页面 URL
                    }),
                    // filename: 优先取脚本文件名，其次取页面 URL
                    filename: item.filename || item.url || '',
                    lineno: item.lineno || 0,
                    colno: item.colno || 0,
                    // user_id: 优先取 customer_name (SDK 上报的用户名)
                    user_id: item.customer_name || item.userId || item.user_id || '',
                    timestamp: item.timestamp || Date.now(),
                    created_at: Date.now(),
                    // 确保传递扩展业务字段，供 Model 写入 extra_data
                    customer_name: item.customer_name || body.customer_name || '',
                    appkey: item.appkey || body.appkey || '',
                    service_name: item.service_name || body.service_name || ''
                };

                if (!errorData.type || !errorData.project || !errorData.env) {
                    console.warn('收到不完整的错误上报数据，已跳过:', errorData);
                    continue;
                }

                const fingerprint = generateFingerprint(errorData);
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
                    const projectRules = await instanceModel.matchRules(errorData.project, body.appkey);

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
                            if (ruleConfig.appkey && ruleConfig.appkey !== body.appkey) {
                                continue; // Mismatch
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

                            // Implemented threshold check 
                            const timeFrame = rule.time_frame || 60; // default 60s
                            const now = Date.now();
                            const startTime = now - (timeFrame * 1000);

                            const errorCount = await errorModel.count({
                                project: errorData.project,
                                env: errorData.env,
                                type: errorData.type,
                                // Use precise user_id for count if rule is user-specific
                                // (Optional: user might want count of ALL errors for this project, or just this user?
                                // Usually if rule is specific to user, count should be specific to user.
                                // But errorModel.count currently doesn't support user_id filter.
                                // Let's keep it project-level for now as per errorModel capability)
                                startTime: startTime,
                                endTime: now
                            });

                            if (errorCount >= rule.threshold) {
                                // 触发告警！
                                console.log(`[Alarm] Rule matched: ${rule.instance_name}, Count: ${errorCount}/${rule.threshold}`);

                                const alarmRecord = {
                                    project: errorData.project,
                                    instance_id: rule.id, // Revert to using PK (Int) as instance_id
                                    instance_name: rule.instance_name || '', // Persist for history
                                    instance_uuid: rule.instance_id || '', // Persist user-defined ID
                                    error_id: result.id,
                                    level: ruleConfig.level || 'L1', // Use level from rules_json
                                    message: `[${rule.instance_name}] 触发告警: ${timeFrame}秒内发生 ${errorCount} 次 (阈值: ${rule.threshold})`,
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
    });

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

            res.json({
                success: true,
                data: {
                    ...error,
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

/**
 * 生成错误指纹（用于去重）
 * 对message进行标准化处理，移除动态内容（如耗时ms）
 */
function generateFingerprint(errorData) {
    let { type, message, filename, lineno } = errorData;
    const crypto = require('crypto');

    // 标准化 message，移除动态时间值
    // 这样相同类型的网络错误（即使耗时不同）也能被正确合并
    let normalizedMessage = (message || '')
        .replace(/after \d+ms/g, 'after Xms')           // timeout after 500ms
        .replace(/\(actual: \d+ms\)/g, '(actual: Xms)') // (actual: 300ms)
        .replace(/耗时: \d+ms/g, '耗时: Xms')           // 请求耗时: 123ms
        .replace(/请求耗时: \d+ms/g, '请求耗时: Xms')
        .replace(/\d+ms内/g, 'Xms内');                   // 500ms内

    const data = `${type}:${normalizedMessage}:${filename}:${lineno}`;
    return crypto.createHash('md5').update(data).digest('hex');
}
