const { randomUUID } = require('crypto');
const config = require('../config/server');

const VANISH_EMAIL_PATTERN = /^[^\s,@]+@myhexin\.com$/i;

class VanishService {
    constructor(options = {}) {
        this.enabled = options.enabled ?? config.vanish.enabled;
        this.url = options.url ?? config.vanish.url;
        this.ak = options.ak ?? config.vanish.ak;
        this.timeoutMs = options.timeoutMs ?? config.vanish.timeoutMs;
        this.fetchImpl = options.fetchImpl ?? global.fetch;
    }

    getStatus() {
        const urlConfigured = typeof this.url === 'string' && this.url.trim().length > 0;
        const akConfigured = typeof this.ak === 'string' && this.ak.trim().length > 0;
        return {
            enabled: this.enabled,
            configured: this.enabled && urlConfigured && akConfigured,
            urlConfigured,
            akConfigured
        };
    }

    normalizeRecipients(value) {
        const items = Array.isArray(value)
            ? value
            : String(value || '').split(/[,，\n;]/);
        return [...new Set(items.map(item => String(item).trim().toLowerCase()).filter(Boolean))];
    }

    validateRecipients(value) {
        const recipients = this.normalizeRecipients(value);
        if (recipients.length === 0) {
            throw new Error('Vanish 收件账号不能为空');
        }
        if (recipients.length > 100) {
            throw new Error('Vanish 收件账号不能超过 100 个');
        }
        const invalid = recipients.find(email => !VANISH_EMAIL_PATTERN.test(email));
        if (invalid) {
            throw new Error(`Vanish 收件账号必须是 @myhexin.com 邮箱：${invalid}`);
        }
        return recipients;
    }

    createRequestId(kind) {
        return `cloud-monitor-${kind}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    }

    async sendText({ recipients, content, kind = 'message', markdown = true }) {
        const status = this.getStatus();
        if (!status.configured) {
            console.warn('[VanishService] URL 或 AK 未配置，跳过发送');
            return false;
        }
        if (typeof this.fetchImpl !== 'function') {
            console.error('[VanishService] 当前 Node.js 运行时不支持 fetch');
            return false;
        }

        const emails = this.validateRecipients(recipients);
        const requestId = this.createRequestId(kind);
        const safeContent = String(content || '').trim().slice(0, 6000);
        if (!safeContent) {
            throw new Error('Vanish 消息内容不能为空');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(this.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Vanish-AK': this.ak
                },
                body: JSON.stringify({
                    requestId,
                    target: { type: 'email', emails },
                    message: {
                        type: 'txt',
                        content: safeContent,
                        markdown: !!markdown,
                        hideLink: true
                    }
                }),
                signal: controller.signal
            });

            let result;
            try {
                result = await response.json();
            } catch (_) {
                console.error(`[VanishService] 响应不是合法 JSON，requestId=${requestId}，http=${response.status}`);
                return false;
            }

            const downstreamStatus = result?.data?.downstreamStatus;
            const succeeded = response.ok
                && result?.status_code === 0
                && result?.succeed === true
                && String(downstreamStatus) === '0';

            if (!succeeded) {
                console.error(
                    `[VanishService] 发送失败，requestId=${requestId}，http=${response.status}，status_code=${result?.status_code ?? 'unknown'}，downstream=${downstreamStatus ?? 'unknown'}`
                );
                return false;
            }

            console.log(`[VanishService] 发送成功，requestId=${requestId}`);
            return true;
        } catch (error) {
            const reason = error?.name === 'AbortError' ? '请求超时，结果未知' : error?.message;
            console.error(`[VanishService] 发送异常，requestId=${requestId}，原因=${reason}`);
            return false;
        } finally {
            clearTimeout(timeout);
        }
    }

    async sendAlarm(recipients, alarmData) {
        const time = new Date(alarmData.timestamp || alarmData.created_at || Date.now()).toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour12: false
        });
        const envPrefix = config.env === 'production' ? '' : '【测试环境】';
        const content = [
            `${envPrefix}## 云监控告警 · ${alarmData.level || 'L1'}`,
            `- 规则：${alarmData.instance_name || '未命名告警规则'}`,
            `- 概览：${alarmData.message || '未提供描述'}`,
            `- 项目：${alarmData.project || '未知项目'} / ${alarmData.env || '未知环境'}`,
            `- 组件：${alarmData.service_name || alarmData.appkey || '-'}`,
            `- 客户：${alarmData.customer_name || '-'}`,
            `- 错误：${String(alarmData.error_message || '无').slice(0, 500)}`,
            `- 时间：${time}`
        ].join('\n');
        return this.sendText({ recipients, content, kind: 'alarm', markdown: true });
    }

    async sendDailyReport(recipients, reportDate, stat, ai) {
        const trend = stat.trendPct === null || stat.trendPct === undefined
            ? '首次记录'
            : stat.trendDiff > 0
                ? `上升 ${Math.abs(stat.trendPct)}%`
                : stat.trendDiff < 0
                    ? `下降 ${Math.abs(stat.trendPct)}%`
                    : '持平';
        const components = (stat.byAppkey || []).slice(0, 3)
            .map((item, index) => `${index + 1}. ${item.service_name || item.appkey || '未知组件'}：${item.total} 次`);
        const issues = (stat.topErrors || []).slice(0, 3)
            .map((item, index) => `${index + 1}. [${item.error_type || 'unknown'}] ${String(item.error_message || item.message || '').slice(0, 180)}（${item.count} 次）`);
        const envPrefix = config.env === 'production' ? '' : '【测试环境】';
        const content = [
            `${envPrefix}## AI 巡检日报 · ${reportDate}`,
            `**${ai.headline || '云监控巡检摘要'}**`,
            ai.overview || '',
            '',
            `- 总错误：${stat.total || 0} 次`,
            `- 较前日：${trend}`,
            '',
            components.length ? '**Top 组件**' : '',
            ...components,
            issues.length ? '\n**Top 问题**' : '',
            ...issues,
            ai.action ? `\n**今日建议**：${ai.action}` : ''
        ].filter(Boolean).join('\n');
        return this.sendText({ recipients, content, kind: 'daily-report', markdown: true });
    }
}

const vanishService = new VanishService();

module.exports = vanishService;
module.exports.VanishService = VanishService;
module.exports.VANISH_EMAIL_PATTERN = VANISH_EMAIL_PATTERN;
