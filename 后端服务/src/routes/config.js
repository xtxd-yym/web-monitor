/**
 * 配置相关路由
 */

const express = require('express');
const router = express.Router();

module.exports = (configModel) => {
    /**
     * GET /api/config
     * 获取监控配置
     * 支持两种方式: 
     * 1. appkey + customer_name (推荐)
     * 2. project + env + customer_name (向后兼容)
     */
    router.get('/', async (req, res) => {
        try {
            const { appkey, customer_name, project, env } = req.query;

            // 方式1: appkey + customer_name
            if (appkey) {
                const config = await configModel.findOne(appkey, customer_name || '');
                const finalConfig = getDefaultConfig();

                if (config && config.config) {
                    deepMerge(finalConfig, config.config);
                }

                return res.json(finalConfig);
            }

            // 方式2: 向后兼容 (project + env)
            if (!project || !env) {
                return res.status(400).json({
                    success: false,
                    msg: '缺少必填参数: appkey 或 (project + env)'
                });
            }

            const configs = await configModel.findAll({ project, env, customer_name });
            const finalConfig = getDefaultConfig();

            if (configs && configs.length > 0) {
                deepMerge(finalConfig, configs[0].config);
            }

            res.json(finalConfig);
        } catch (error) {
            console.error('获取配置失败:', error);
            res.status(500).json({
                success: false,
                msg: '获取配置失败',
                error: error.message
            });
        }
    });

    /**
     * POST /api/config/update
     * 更新监控配置
     * 支持按 appkey + customer_name 管理
     */
    router.post('/update', async (req, res) => {
        try {
            const { appkey, customer_name, project, env, config } = req.body;

            if (!appkey || config === undefined) {
                return res.status(400).json({
                    success: false,
                    msg: '缺少必填参数: appkey, config'
                });
            }

            const result = await configModel.upsert({
                appkey,
                customer_name: customer_name || '',
                project: project || '',
                env: env || 'production',
                config
            });

            res.json({
                success: true,
                msg: '配置更新成功',
                data: result
            });
        } catch (error) {
            console.error('更新配置失败:', error);
            res.status(500).json({
                success: false,
                msg: '更新配置失败',
                error: error.message
            });
        }
    });

    /**
     * GET /api/config/list
     * 获取所有配置
     * 支持按 appkey, customer_name 筛选
     */
    router.get('/list', async (req, res) => {
        try {
            const { appkey, customer_name, project, env } = req.query;

            const configs = await configModel.findAll({ appkey, customer_name, project, env });

            res.json({
                success: true,
                data: configs
            });
        } catch (error) {
            console.error('获取配置列表失败:', error);
            res.status(500).json({
                success: false,
                msg: '获取配置列表失败',
                error: error.message
            });
        }
    });

    /**
     * POST /api/config/delete
     * 删除配置 (按 appkey + customer_name)
     */
    router.post('/delete', async (req, res) => {
        try {
            const { appkey, customer_name } = req.body;

            if (!appkey) {
                return res.status(400).json({
                    success: false,
                    msg: '缺少必填参数: appkey'
                });
            }

            const deleted = await configModel.deleteByKeys(appkey, customer_name || '');

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    msg: '配置不存在'
                });
            }

            res.json({
                success: true,
                msg: '配置已删除'
            });
        } catch (error) {
            console.error('删除配置失败:', error);
            res.status(500).json({
                success: false,
                msg: '删除配置失败',
                error: error.message
            });
        }
    });

    /**
     * POST /api/config/:id/disable
     * 禁用配置
     */
    router.post('/:id/disable', async (req, res) => {
        try {
            const { id } = req.params;
            const disabled = await configModel.disable(parseInt(id));

            if (!disabled) {
                return res.status(404).json({
                    success: false,
                    msg: '配置不存在'
                });
            }

            res.json({
                success: true,
                msg: '配置已禁用'
            });
        } catch (error) {
            console.error('禁用配置失败:', error);
            res.status(500).json({
                success: false,
                msg: '禁用配置失败',
                error: error.message
            });
        }
    });

    /**
     * POST /api/config/:id/enable
     * 启用配置
     */
    router.post('/:id/enable', async (req, res) => {
        try {
            const { id } = req.params;
            const enabled = await configModel.enable(parseInt(id));

            if (!enabled) {
                return res.status(404).json({
                    success: false,
                    msg: '配置不存在'
                });
            }

            res.json({
                success: true,
                msg: '配置已启用'
            });
        } catch (error) {
            console.error('启用配置失败:', error);
            res.status(500).json({
                success: false,
                msg: '启用配置失败',
                error: error.message
            });
        }
    });

    return router;
};

/**
 * 深度合并对象
 */
function deepMerge(target, source) {
    if (!source) return target;
    for (const key in source) {
        if (source[key] instanceof Object && key in target && target[key] instanceof Object && !Array.isArray(target[key])) {
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

/**
 * 默认配置
 */
function getDefaultConfig() {
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
            samplingRates: {
                javascript: 1.0,
                promise: 1.0,
                resource: 0.5,
                network: 0.3
            },
            maxErrorsPerMinute: 100,
            dedupeWindow: 300,
            logLevel: 'warn'
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
