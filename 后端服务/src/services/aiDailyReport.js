/**
 * AI 巡检日报核心服务
 * 职责：数据聚合 → AI 生成结构化摘要 → 渲染 HTML 邮件 → 发送 → 落库
 */

const emailService = require('./email');
const vanishService = require('./vanish');
const serverConfig = require('../config/server');

class AiDailyReportService {
    constructor(errorModel, configModel, dailyReportModel, notificationServices = {}) {
        this.errorModel = errorModel;
        this.configModel = configModel;
        this.dailyReportModel = dailyReportModel;
        this.emailService = notificationServices.emailService || emailService;
        this.vanishService = notificationServices.vanishService || vanishService;
    }

    // ─────────────────────────────────────────────────────────
    // 主入口
    // ─────────────────────────────────────────────────────────

    /**
     * 生成日报
     * @param {Object} options
     * @param {string}  [options.date]       指定日期 YYYY-MM-DD，默认昨日
     * @param {boolean} [options.skipEmail]  是否跳过发送邮件
     * @param {boolean} [options.skipVanish] 是否跳过发送 Vanish 消息
     * @param {string}  [options.triggerType] 'auto' | 'manual'
     */
    async generateReport({ date, skipEmail = false, skipVanish = false, triggerType = 'auto' } = {}) {
        const reportDate = date || this._getYesterdayDateStr();
        console.log(`[AiDailyReport] 开始生成日报，日期: ${reportDate}`);

        // Cron 每分钟检查一次。自动任务先按报告日期幂等判断，避免一分钟内重复通知。
        if (triggerType === 'auto') {
            const existing = await this.dailyReportModel.findAutoByDate(reportDate);
            if (existing) {
                console.log(`[AiDailyReport] ${reportDate} 自动日报已存在，跳过重复生成`);
                return { id: existing.id, reportDate, emailSent: existing.email_sent || 0, vanishSent: existing.vanish_sent || 0, skipped: true };
            }
        }

        // 1. 聚合统计数据
        const statData = await this._gatherStats(reportDate);

        // 2. 调用 AI 生成结构化摘要
        let aiSummary = {};
        try {
            aiSummary = await this._callAI(reportDate, statData);
        } catch (err) {
            console.error('[AiDailyReport] AI 调用失败，降级为空摘要:', err.message);
            aiSummary = {
                headline: `${reportDate} 监控日报（AI 分析失败）`,
                overview: 'AI 服务暂时不可用，请查看数据统计部分了解昨日情况。',
                highlights: [],
                topIssues: [],
                trend: '暂无趋势分析',
                action: '请人工查阅监控面板'
            };
        }

        // 3. 渲染 HTML 邮件
        const htmlContent = this._buildEmailHtml(reportDate, statData, aiSummary);

        // 4. 读取通知设置，按渠道分别发送
        const notificationSettings = await this._getNotificationSettings();
        let emailSent = 0;
        let vanishSent = 0;
        const recipients = this._parseRecipients(notificationSettings.emailRecipients);
        const vanishRecipients = this.vanishService.normalizeRecipients(notificationSettings.vanishRecipients);

        if (!skipEmail && notificationSettings.emailEnabled && recipients.length > 0) {
            const sent = await this.emailService.sendDailyReportEmail(recipients, htmlContent, reportDate);
            emailSent = sent ? 1 : 0;
        } else if (!skipEmail && notificationSettings.emailEnabled && recipients.length === 0) {
            console.warn('[AiDailyReport] 未配置收件人，跳过发送邮件');
        }

        if (!skipVanish && notificationSettings.vanishEnabled && vanishRecipients.length > 0) {
            const sent = await this.vanishService.sendDailyReport(
                vanishRecipients,
                reportDate,
                statData,
                aiSummary
            );
            vanishSent = sent ? 1 : 0;
        } else if (!skipVanish && notificationSettings.vanishEnabled && vanishRecipients.length === 0) {
            console.warn('[AiDailyReport] 未配置 Vanish 收件账号，跳过发送');
        }

        // 5. 落库
        const record = await this.dailyReportModel.create({
            report_date: reportDate,
            stat_json: statData,
            ai_summary_json: aiSummary,
            recipients: Array.isArray(recipients) ? recipients.join(',') : '',
            email_sent: emailSent,
            vanish_recipients: vanishRecipients.join(','),
            vanish_sent: vanishSent,
            trigger_type: triggerType
        });

        console.log(`[AiDailyReport] 日报生成完成，ID: ${record.id}，邮件=${emailSent ? '成功' : '未发送'}，Vanish=${vanishSent ? '成功' : '未发送'}`);
        return { id: record.id, reportDate, emailSent, vanishSent, statData, aiSummary };
    }

    // ─────────────────────────────────────────────────────────
    // 数据聚合
    // ─────────────────────────────────────────────────────────

    async _gatherStats(reportDate) {
        // 计算上海时区该日期的 00:00 ~ 23:59:59 的毫秒时间戳
        const { startTs, endTs } = this._getDateRange(reportDate);

        // 基础统计：总量、按类型分布、Top5
        const baseStats = await this.errorModel.getStats({ startTime: startTs, endTime: endTs });

        // 按 AppKey 组件分布
        const byAppkey = await this.errorModel.getStatsByAppkey({ startTime: startTs, endTime: endTs });

        // 前一日数据（用于环比）
        const prevDate = this._getPrevDateStr(reportDate);
        const prevStat = await this.dailyReportModel.findByDate(prevDate);
        const prevTotal = prevStat?.total || 0;
        const currTotal = baseStats.total || 0;
        const trendDiff = currTotal - prevTotal;
        const trendPct = prevTotal === 0 ? null : Math.round((trendDiff / prevTotal) * 100);

        return {
            reportDate,
            total: currTotal,
            byType: baseStats.byType || {},
            topErrors: baseStats.topErrors || [],
            byAppkey: byAppkey.slice(0, 5),  // Top5 组件
            prevTotal,
            trendDiff,
            trendPct,  // null 表示无前日数据
            startTs,
            endTs
        };
    }

    // ─────────────────────────────────────────────────────────
    // AI 调用
    // ─────────────────────────────────────────────────────────

    async _callAI(reportDate, statData) {
        const apiKey = serverConfig.ai.apiKey;
        const baseUrl = serverConfig.ai.baseUrl;
        const modelName = serverConfig.ai.model;

        if (!apiKey) throw new Error('AI API Key 未配置');

        const systemPrompt = `你是一名资深前端监控运营专家。你将收到昨日监控系统的错误统计数据，请输出一份结构化日报分析。
必须以合法的 JSON 格式回复（不要包含任何 markdown 代码块标记，直接输出 JSON），结构如下：
{
  "headline": "一句话总结（15字以内，点明核心问题或亮点）",
  "overview": "2-3句话的整体概括，必须包含具体数字，说明昨日整体错误状况",
  "highlights": [
    { "type": "warning|info|success", "text": "关键洞察内容（每条20字以内）" }
  ],
  "topIssues": [
    { "component": "组件名", "issue": "问题描述（简洁）", "suggestion": "具体修复建议（可含代码关键字）" }
  ],
  "trend": "与前日对比分析，说明是上升/持平/下降及幅度，若无前日数据则说明这是首次记录",
  "action": "今日建议优先处理的1-2条事项"
}
highlights 数组提供3-5条关键洞察，topIssues 提供 Top3 问题及建议（不足3个则按实际数量）。`;

        const trendDesc = statData.trendPct === null
            ? '无前日数据（首次记录）'
            : `较前日(${statData.prevTotal}次) ${statData.trendDiff > 0 ? '上升' : '下降'} ${Math.abs(statData.trendDiff)} 次（${statData.trendDiff > 0 ? '+' : ''}${statData.trendPct}%）`;

        const byTypeDesc = Object.entries(statData.byType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => `${type}: ${count}次`)
            .join(', ');

        const byAppkeyDesc = statData.byAppkey
            .map(item => `${item.service_name || item.appkey}: ${item.total}次`)
            .join(', ');

        const topErrorsDesc = (statData.topErrors || [])
            .slice(0, 5)
            .map((e, i) => `${i + 1}. [${e.error_type}] ${e.error_message} (共${e.count}次)`)
            .join('\n');

        const userPrompt = `【${reportDate} 错误统计数据】

总错误数：${statData.total} 次
环比趋势：${trendDesc}

按错误类型分布：
${byTypeDesc || '暂无数据'}

按组件分布（Top5）：
${byAppkeyDesc || '暂无数据'}

Top5 高频错误：
${topErrorsDesc || '暂无数据'}

请根据以上数据生成结构化日报分析 JSON。`;

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`AI API Error: ${errText}`);
        }

        const data = await response.json();
        let content = data.choices[0]?.message?.content || '{}';

        // 清洗：去除可能的 markdown 代码块包裹
        content = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

        try {
            return JSON.parse(content);
        } catch (_) {
            console.warn('[AiDailyReport] AI 返回非法 JSON，降级处理');
            return {
                headline: '监控日报',
                overview: content.slice(0, 200),
                highlights: [],
                topIssues: [],
                trend: trendDesc,
                action: '请查阅监控面板'
            };
        }
    }

    // ─────────────────────────────────────────────────────────
    // 邮件 HTML 渲染
    // ─────────────────────────────────────────────────────────

    _buildEmailHtml(reportDate, stat, ai) {
        const total = stat.total || 0;
        const prevTotal = stat.prevTotal || 0;
        const trendDiff = stat.trendDiff || 0;
        const trendPct = stat.trendPct;

        const trendText = trendPct === null
            ? '首次记录'
            : (trendDiff > 0 ? `↑ ${trendPct}%` : trendDiff < 0 ? `↓ ${Math.abs(trendPct)}%` : '持平');
        const trendColor = trendDiff > 0 ? '#f56c6c' : trendDiff < 0 ? '#67c23a' : '#909399';

        // 影响组件数
        const affectedComponents = (stat.byAppkey || []).filter(a => a.total > 0).length;

        // 最高频错误类型
        const topType = Object.entries(stat.byType || {}).sort((a, b) => b[1] - a[1])[0];
        const topTypeLabel = topType ? `${topType[0]} (${topType[1]}次)` : '暂无';

        // 错误类型柱状图
        const typeTotal = Object.values(stat.byType || {}).reduce((s, v) => s + v, 0) || 1;
        const TYPE_COLORS = {
            javascript: '#f56c6c',
            promise: '#e6a23c',
            resource: '#909399',
            network: '#409eff',
            white_screen: '#9b59b6',
            performance: '#1abc9c'
        };
        const typeBarRows = Object.entries(stat.byType || {})
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => {
                const pct = Math.round((count / typeTotal) * 100);
                const color = TYPE_COLORS[type] || '#409eff';
                return `
                <tr>
                    <td style="width:80px;padding:4px 8px 4px 0;font-size:12px;color:#606266;white-space:nowrap;">${type}</td>
                    <td style="padding:4px 8px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="background:${color};width:${pct}%;height:14px;border-radius:3px;"></td>
                                <td style="width:${100 - pct}%;"></td>
                            </tr>
                        </table>
                    </td>
                    <td style="width:55px;padding:4px 0;font-size:12px;color:#303133;text-align:right;white-space:nowrap;">${count}次 (${pct}%)</td>
                </tr>`;
            }).join('');

        // Top5 组件排行
        const appkeyRows = (stat.byAppkey || []).slice(0, 5).map((item, idx) => {
            const pct = total > 0 ? Math.round((item.total / total) * 100) : 0;
            return `
            <tr style="border-bottom:1px solid #f0f2f5;">
                <td style="padding:10px 8px;font-size:13px;color:#909399;text-align:center;width:32px;">${idx + 1}</td>
                <td style="padding:10px 8px;font-size:13px;color:#303133;">${item.service_name || item.appkey || '未知'}</td>
                <td style="padding:10px 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                            <td style="background:#409eff;width:${pct}%;height:8px;border-radius:4px;"></td>
                            <td style="width:${100 - pct}%;"></td>
                        </tr>
                    </table>
                </td>
                <td style="padding:10px 8px;font-size:13px;color:#303133;text-align:right;width:60px;white-space:nowrap;">${item.total}次</td>
            </tr>`;
        }).join('');

        // Top5 高频错误
        const topErrorRows = (stat.topErrors || []).slice(0, 5).map((err, idx) => {
            const TYPE_BG = {
                javascript: '#fef0f0', promise: '#fdf6ec', resource: '#f4f4f5',
                network: '#ecf5ff', white_screen: '#f9f0ff', performance: '#f0fff4'
            };
            const TYPE_TEXT = {
                javascript: '#f56c6c', promise: '#e6a23c', resource: '#909399',
                network: '#409eff', white_screen: '#9b59b6', performance: '#1abc9c'
            };
            const bg = TYPE_BG[err.error_type] || '#f4f4f5';
            const tc = TYPE_TEXT[err.error_type] || '#606266';
            return `
            <tr style="border-bottom:1px solid #f0f2f5;">
                <td style="padding:10px 8px;font-size:13px;color:#909399;text-align:center;width:32px;">${idx + 1}</td>
                <td style="padding:10px 8px;">
                    <span style="background:${bg};color:${tc};padding:2px 6px;border-radius:3px;font-size:11px;margin-right:6px;">${err.error_type}</span>
                    <span style="font-size:13px;color:#303133;">${(err.error_message || err.message || '').slice(0, 60)}${(err.error_message || '').length > 60 ? '...' : ''}</span>
                </td>
                <td style="padding:10px 8px;text-align:right;white-space:nowrap;">
                    <span style="background:#f0f9ff;color:#409eff;padding:2px 8px;border-radius:10px;font-size:12px;">${err.count}次</span>
                </td>
            </tr>`;
        }).join('');

        // AI 亮点洞察（highlights）
        const HIGHLIGHT_STYLES = {
            warning: { bg: '#fef8ed', border: '#f0a020', icon: '⚠️', color: '#b07800' },
            info: { bg: '#ecf5ff', border: '#409eff', icon: '💡', color: '#1a6bb5' },
            success: { bg: '#f0f9eb', border: '#67c23a', icon: '✅', color: '#3a8e10' }
        };
        const highlightRows = (ai.highlights || []).map(h => {
            const s = HIGHLIGHT_STYLES[h.type] || HIGHLIGHT_STYLES.info;
            return `
            <tr>
                <td style="padding:6px 0;">
                    <div style="background:${s.bg};border-left:3px solid ${s.border};padding:8px 12px;border-radius:0 4px 4px 0;font-size:13px;color:${s.color};">
                        ${s.icon}&nbsp;&nbsp;${h.text}
                    </div>
                </td>
            </tr>`;
        }).join('');

        // AI Top Issues
        const topIssueCards = (ai.topIssues || []).map((issue, idx) => `
            <tr>
                <td style="padding:8px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid #e4e7ed;border-radius:6px;overflow:hidden;">
                        <tr>
                            <td style="padding:12px 16px;">
                                <div style="font-size:12px;color:#909399;margin-bottom:4px;">组件：${issue.component || '未知'}</div>
                                <div style="font-size:14px;color:#303133;font-weight:500;margin-bottom:8px;">❗ ${issue.issue}</div>
                                <div style="font-size:13px;color:#606266;background:#f8f9fa;padding:8px 10px;border-radius:4px;border-left:3px solid #409eff;">
                                    🔧 ${issue.suggestion}
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>`).join('');

        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
        <td style="background:linear-gradient(135deg,#1a2a4a 0%,#2563eb 100%);padding:32px 32px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td>
                        <div style="font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">CLOUD MONITOR · AI DAILY REPORT</div>
                        <div style="font-size:24px;color:#fff;font-weight:700;letter-spacing:-0.5px;">🤖 AI 巡检日报</div>
                        <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:4px;">${reportDate} · 自动生成</div>
                    </td>
                    <td align="right" valign="top">
                        <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:10px 16px;text-align:center;">
                            <div style="font-size:28px;font-weight:700;color:#fff;">${total}</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.7);">昨日总错误</div>
                        </div>
                    </td>
                </tr>
            </table>
            <!-- AI Headline -->
            <div style="margin-top:20px;background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 16px;font-size:14px;color:#fff;border-left:3px solid #60a5fa;">
                ${ai.headline || '监控日报已生成，请查阅详情'}
            </div>
        </td>
    </tr>

    <!-- 4 数据卡片 -->
    <tr>
        <td style="padding:24px 24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td width="25%" style="padding:0 6px 0 0;">
                        <div style="background:#f8f9ff;border-radius:8px;padding:14px;text-align:center;border:1px solid #e8ecff;">
                            <div style="font-size:22px;font-weight:700;color:#303133;">${total}</div>
                            <div style="font-size:11px;color:#909399;margin-top:3px;">总错误数</div>
                        </div>
                    </td>
                    <td width="25%" style="padding:0 3px;">
                        <div style="background:#f8f9ff;border-radius:8px;padding:14px;text-align:center;border:1px solid #e8ecff;">
                            <div style="font-size:22px;font-weight:700;color:#303133;">${affectedComponents}</div>
                            <div style="font-size:11px;color:#909399;margin-top:3px;">影响组件数</div>
                        </div>
                    </td>
                    <td width="25%" style="padding:0 3px;">
                        <div style="background:#f8f9ff;border-radius:8px;padding:14px;text-align:center;border:1px solid #e8ecff;">
                            <div style="font-size:11px;font-weight:700;color:#303133;word-break:break-all;">${topTypeLabel}</div>
                            <div style="font-size:11px;color:#909399;margin-top:3px;">最高频类型</div>
                        </div>
                    </td>
                    <td width="25%" style="padding:0 0 0 6px;">
                        <div style="background:#f8f9ff;border-radius:8px;padding:14px;text-align:center;border:1px solid #e8ecff;">
                            <div style="font-size:18px;font-weight:700;color:${trendColor};">${trendText}</div>
                            <div style="font-size:11px;color:#909399;margin-top:3px;">较前日环比</div>
                        </div>
                    </td>
                </tr>
            </table>
        </td>
    </tr>

    ${typeBarRows ? `
    <!-- 错误类型分布 -->
    <tr>
        <td style="padding:24px 24px 0;">
            <div style="font-size:15px;font-weight:600;color:#303133;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #f0f2f5;">📊 错误类型分布</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${typeBarRows}
            </table>
        </td>
    </tr>` : ''}

    ${appkeyRows ? `
    <!-- Top5 组件 -->
    <tr>
        <td style="padding:24px 24px 0;">
            <div style="font-size:15px;font-weight:600;color:#303133;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #f0f2f5;">🏆 Top5 高频组件</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${appkeyRows}
            </table>
        </td>
    </tr>` : ''}

    ${topErrorRows ? `
    <!-- Top5 高频错误 -->
    <tr>
        <td style="padding:24px 24px 0;">
            <div style="font-size:15px;font-weight:600;color:#303133;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #f0f2f5;">🔴 Top5 高频错误</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${topErrorRows}
            </table>
        </td>
    </tr>` : ''}

    <!-- AI 分析区 -->
    <tr>
        <td style="padding:24px;">
            <div style="background:linear-gradient(135deg,#f8f9ff 0%,#eff3ff 100%);border-radius:10px;padding:20px;border:1px solid #dbe4ff;">
                <div style="font-size:15px;font-weight:600;color:#1a2a4a;margin-bottom:14px;">
                    🤖 AI 智能分析
                    <span style="font-size:11px;font-weight:400;color:#909399;margin-left:8px;">由大语言模型生成</span>
                </div>

                <!-- 整体概况 -->
                <div style="font-size:13px;color:#303133;line-height:1.8;margin-bottom:14px;padding:12px;background:#fff;border-radius:6px;border-left:3px solid #2563eb;">
                    ${ai.overview || '暂无概况'}
                </div>

                ${highlightRows ? `
                <!-- 关键洞察 -->
                <div style="font-size:13px;font-weight:600;color:#606266;margin-bottom:8px;">关键洞察</div>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${highlightRows}
                </table>` : ''}

                ${topIssueCards ? `
                <!-- 问题建议 -->
                <div style="font-size:13px;font-weight:600;color:#606266;margin-top:14px;margin-bottom:8px;">问题 & 修复建议</div>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${topIssueCards}
                </table>` : ''}

                ${ai.trend ? `
                <!-- 趋势 -->
                <div style="margin-top:14px;padding:10px 12px;background:#fff;border-radius:6px;font-size:13px;color:#606266;border:1px solid #e4e7ed;">
                    📈 <strong>趋势分析：</strong>${ai.trend}
                </div>` : ''}

                ${ai.action ? `
                <!-- 今日行动 -->
                <div style="margin-top:12px;padding:10px 12px;background:#fff7ed;border-radius:6px;font-size:13px;color:#b45309;border-left:3px solid #f59e0b;">
                    🎯 <strong>今日优先处理：</strong>${ai.action}
                </div>` : ''}
            </div>
        </td>
    </tr>

    <!-- Footer -->
    <tr>
        <td style="padding:16px 24px;border-top:1px solid #f0f2f5;text-align:center;">
            <div style="font-size:12px;color:#c0c4cc;">
                此邮件由云监控 AI 巡检系统自动生成 · ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
            </div>
            <div style="font-size:11px;color:#dcdfe6;margin-top:4px;">请勿直接回复此邮件</div>
        </td>
    </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
    }

    // ─────────────────────────────────────────────────────────
    // 通知设置
    // ─────────────────────────────────────────────────────────

    async _getNotificationSettings() {
        try {
            const [settings, legacyRecipients] = await Promise.all([
                this.configModel.getSystemConfig('ai_daily_report_notifications'),
                this.configModel.getSystemConfig('ai_daily_report_recipients')
            ]);
            const value = settings && typeof settings === 'object' ? settings : {};
            return {
                emailEnabled: value.emailEnabled !== false,
                emailRecipients: typeof value.emailRecipients === 'string'
                    ? value.emailRecipients
                    : (typeof legacyRecipients === 'string' ? legacyRecipients : ''),
                vanishEnabled: value.vanishEnabled === true,
                vanishRecipients: typeof value.vanishRecipients === 'string' ? value.vanishRecipients : ''
            };
        } catch (err) {
            console.error('[AiDailyReport] 读取通知设置失败:', err.message);
            return { emailEnabled: true, emailRecipients: '', vanishEnabled: false, vanishRecipients: '' };
        }
    }

    _parseRecipients(value) {
        return [...new Set(String(value || '').split(/[,，\n;]/).map(s => s.trim()).filter(s => s.includes('@')))];
    }

    // ─────────────────────────────────────────────────────────
    // 工具方法
    // ─────────────────────────────────────────────────────────

    _getYesterdayDateStr() {
        const d = new Date(new Date().toLocaleString('en', { timeZone: 'Asia/Shanghai' }));
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    _getPrevDateStr(dateStr) {
        const d = new Date(dateStr + 'T00:00:00+08:00');
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    _getDateRange(dateStr) {
        // 在上海时区，该日期的 0 点 ~ 23:59:59.999 的 UTC 毫秒戳
        const startTs = new Date(dateStr + 'T00:00:00+08:00').getTime();
        const endTs = new Date(dateStr + 'T23:59:59.999+08:00').getTime();
        return { startTs, endTs };
    }
}

module.exports = AiDailyReportService;
