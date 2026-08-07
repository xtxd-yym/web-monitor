/**
 * AI 巡检日报 REST 接口
 */

const express = require('express');
const router = express.Router();

/**
 * @param {import('../db/models/dailyReport')} dailyReportModel
 * @param {import('../db/models/config')}      configModel
 * @param {import('../services/aiDailyReport')} aiDailyReportService
 * @param {import('../services/vanish')} vanishService
 */
module.exports = (dailyReportModel, configModel, aiDailyReportService, vanishService) => {

    // ─────────────────────────────────────────────
    // POST /api/ai-daily-report/trigger
    // 手动触发生成日报
    // Body: { date?: 'YYYY-MM-DD', skipEmail?: boolean, skipVanish?: boolean }
    // ─────────────────────────────────────────────
    router.post('/trigger', async (req, res) => {
        try {
            const { date, skipEmail = false, skipVanish = false } = req.body;

            // 简单校验日期格式
            if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ success: false, msg: '日期格式错误，应为 YYYY-MM-DD' });
            }

            const result = await aiDailyReportService.generateReport({
                date,
                skipEmail: !!skipEmail,
                skipVanish: !!skipVanish,
                triggerType: 'manual'
            });

            res.json({
                success: true,
                msg: `日报生成成功，邮件${result.emailSent ? '已发送' : '未发送'}，Vanish ${result.vanishSent ? '已发送' : '未发送'}`,
                data: {
                    id: result.id,
                    reportDate: result.reportDate,
                    emailSent: result.emailSent,
                    vanishSent: result.vanishSent,
                    total: result.statData?.total || 0,
                    headline: result.aiSummary?.headline || ''
                }
            });
        } catch (err) {
            console.error('[AiDailyReport Route] 触发日报失败:', err);
            res.status(500).json({ success: false, msg: '日报生成失败', error: err.message });
        }
    });

    // ─────────────────────────────────────────────
    // GET /api/ai-daily-report/list
    // 历史日报列表（分页）
    // Query: { page, pageSize }
    // ─────────────────────────────────────────────
    router.get('/list', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 20;
            const result = await dailyReportModel.findList({ page, pageSize });
            res.json({ success: true, data: result });
        } catch (err) {
            console.error('[AiDailyReport Route] 查询列表失败:', err);
            res.status(500).json({ success: false, msg: '查询失败', error: err.message });
        }
    });

    // ─────────────────────────────────────────────
    // GET /api/ai-daily-report/recipients
    // 读取收件人配置
    // ─────────────────────────────────────────────
    router.get('/recipients', async (req, res) => {
        try {
            const [settings, legacyRecipients] = await Promise.all([
                configModel.getSystemConfig('ai_daily_report_notifications'),
                configModel.getSystemConfig('ai_daily_report_recipients')
            ]);
            const recipients = settings?.emailRecipients || legacyRecipients || '';
            res.json({ success: true, data: { recipients } });
        } catch (err) {
            res.status(500).json({ success: false, msg: '读取收件人配置失败', error: err.message });
        }
    });

    // ─────────────────────────────────────────────
    // POST /api/ai-daily-report/recipients
    // 更新收件人配置
    // Body: { recipients: 'a@b.com,c@d.com' }
    // ─────────────────────────────────────────────
    router.post('/recipients', async (req, res) => {
        try {
            const { recipients } = req.body;
            if (typeof recipients !== 'string') {
                return res.status(400).json({ success: false, msg: 'recipients 字段必须为字符串' });
            }
            await configModel.setSystemConfig('ai_daily_report_recipients', recipients);
            const current = await configModel.getSystemConfig('ai_daily_report_notifications');
            await configModel.setSystemConfig('ai_daily_report_notifications', {
                ...(current && typeof current === 'object' ? current : {}),
                emailRecipients: recipients
            });
            res.json({ success: true, msg: '收件人配置已保存' });
        } catch (err) {
            res.status(500).json({ success: false, msg: '保存失败', error: err.message });
        }
    });

    // GET /api/ai-daily-report/notification-settings
    // 只返回安全状态，不返回扶摇 URL 或 AK。
    router.get('/notification-settings', async (req, res) => {
        try {
            const [settings, legacyRecipients] = await Promise.all([
                configModel.getSystemConfig('ai_daily_report_notifications'),
                configModel.getSystemConfig('ai_daily_report_recipients')
            ]);
            const value = settings && typeof settings === 'object' ? settings : {};
            res.json({
                success: true,
                data: {
                    emailEnabled: value.emailEnabled !== false,
                    emailRecipients: value.emailRecipients || legacyRecipients || '',
                    vanishEnabled: value.vanishEnabled === true,
                    vanishRecipients: value.vanishRecipients || '',
                    vanishChannel: vanishService.getStatus()
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, msg: '读取通知设置失败', error: err.message });
        }
    });

    // POST /api/ai-daily-report/notification-settings
    router.post('/notification-settings', async (req, res) => {
        try {
            const { emailEnabled, emailRecipients, vanishEnabled, vanishRecipients } = req.body || {};
            if (typeof emailEnabled !== 'boolean' || typeof vanishEnabled !== 'boolean') {
                return res.status(400).json({ success: false, msg: '通知渠道开关必须为布尔值' });
            }
            if (typeof emailRecipients !== 'string' || typeof vanishRecipients !== 'string') {
                return res.status(400).json({ success: false, msg: '收件人字段必须为字符串' });
            }
            if (vanishEnabled) {
                vanishService.validateRecipients(vanishRecipients);
            }

            const settings = { emailEnabled, emailRecipients, vanishEnabled, vanishRecipients };
            await configModel.setSystemConfig('ai_daily_report_notifications', settings);
            // 同步旧键，保持已有调用方兼容。
            await configModel.setSystemConfig('ai_daily_report_recipients', emailRecipients);
            res.json({ success: true, msg: '日报通知设置已保存' });
        } catch (err) {
            res.status(400).json({ success: false, msg: err.message || '保存通知设置失败' });
        }
    });

    // ─────────────────────────────────────────────
    // GET /api/ai-daily-report/:id
    // 日报详情（含完整 stat_json + ai_summary_json）
    // ─────────────────────────────────────────────
    router.get('/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ success: false, msg: '无效的 ID' });
            }
            const report = await dailyReportModel.findById(id);
            if (!report) {
                return res.status(404).json({ success: false, msg: '日报记录不存在' });
            }
            res.json({ success: true, data: report });
        } catch (err) {
            console.error('[AiDailyReport Route] 查询详情失败:', err);
            res.status(500).json({ success: false, msg: '查询失败', error: err.message });
        }
    });

    return router;
};
