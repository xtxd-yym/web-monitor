const nodemailer = require('nodemailer');
const config = require('../config/server');

class EmailService {
    constructor() {
        this.enabled = config.email.enabled;
        if (!this.enabled) {
            console.log('[EmailService] 邮件服务已禁用');
            return;
        }

        try {
            this.transporter = nodemailer.createTransport({
                host: config.email.host,
                port: config.email.port,
                secure: config.email.secure,
                auth: {
                    user: config.email.auth.user,
                    pass: config.email.auth.pass,
                }
            });

            // 验证连接配置
            this.transporter.verify((error, success) => {
                if (error) {
                    console.error('[EmailService] SMTP 连接验证失败:', error.message);
                } else {
                    console.log('[EmailService] SMTP 服务器连接成功，可以发送邮件');
                }
            });
        } catch (e) {
            console.error('[EmailService] 初始化失败:', e);
            this.enabled = false;
        }
    }

    /**
     * 发送告警邮件
     * @param {string|string[]} to 接收人列表（逗号分隔或数组）
     * @param {Object} alarmData 告警及错误详细数据
     */
    async sendAlarmEmail(to, alarmData) {
        if (!this.enabled || !this.transporter) {
            console.warn('[EmailService] 邮件服务未启用或未初始化成功，跳过发送📩');
            return;
        }

        if (!to) {
            console.warn('[EmailService] 接收人为空，跳过发送');
            return;
        }

        const envPrefix = config.env === 'production' ? '' : '【测试环境】';
        const title = `${envPrefix}[云监控] 规则触发告警: ${alarmData.instance_name || '未命名告警规则'}`;

        const htmlContent = this.buildHtmlTemplate(alarmData);

        const mailOptions = {
            from: config.email.from,
            to: Array.isArray(to) ? to.join(',') : to,
            subject: title,
            html: htmlContent
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log(`[EmailService] 邮件发送成功: ${info.messageId}`);
            return true;
        } catch (error) {
            console.error('[EmailService] 邮件发送失败:', error);
            return false;
        }
    }

    /**
     * 发送 AI 巡检日报邮件
     * @param {string|string[]} to 接收人列表
     * @param {string} htmlContent 已渲染好的 HTML 内容
     * @param {string} reportDate 报告日期，如 2026-08-03
     */
    async sendDailyReportEmail(to, htmlContent, reportDate) {
        if (!this.enabled || !this.transporter) {
            console.warn('[EmailService] 邮件服务未启用，跳过日报发送');
            return false;
        }
        if (!to) {
            console.warn('[EmailService] 日报收件人为空，跳过发送');
            return false;
        }

        const envPrefix = config.env === 'production' ? '' : '【测试环境】';
        const subject = `${envPrefix}[云监控] AI 巡检日报 · ${reportDate}`;

        const mailOptions = {
            from: config.email.from,
            to: Array.isArray(to) ? to.join(',') : to,
            subject,
            html: htmlContent
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log(`[EmailService] 日报邮件发送成功: ${info.messageId}`);
            return true;
        } catch (error) {
            console.error('[EmailService] 日报邮件发送失败:', error);
            return false;
        }
    }

    /**
     * 构建 HTML 邮件模板
     */
    buildHtmlTemplate(data) {
        // 优先取客户端上报的 timestamp（SDK 采集时的毫秒时间戳），
        // 其次取数据库入库时间 created_at，最后才 fallback 到服务器当前时间。
        // 强制指定 zh-CN / Asia/Shanghai 时区，防止服务器时区不是 UTC+8 导致时间偏差。
        const rawTs = data.timestamp || data.created_at || Date.now();
        const time = new Date(rawTs).toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f7fa; margin: 0; padding: 20px; color: #333; }
                .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; }
                .header { background: #E6A23C; color: #fff; padding: 20px; text-align: center; }
                .header.level-L1 { background: #F56C6C; }
                .header.level-L2 { background: #E6A23C; }
                .header.level-L3 { background: #909399; }
                .title { margin: 0; font-size: 20px; }
                .content { padding: 30px 20px; }
                .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .info-table th { width: 100px; text-align: right; padding: 10px; color: #606266; font-weight: normal; vertical-align: top; }
                .info-table td { padding: 10px; color: #303133; font-weight: 500; }
                .error-box { background: #fef0f0; border-left: 4px solid #f56c6c; padding: 15px; margin-top: 20px; border-radius: 4px; }
                .error-msg { margin: 0 0 10px 0; font-weight: bold; color: #f56c6c; font-size: 15px; }
                .stack { font-family: Monaco, Consolas, monospace; font-size: 12px; color: #666; background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; margin: 0; border: 1px solid #fde2e2; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #909399; border-top: 1px solid #ebeef5; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header level-${data.level || 'L2'}">
                    <h2 class="title">监控系统异常告警</h2>
                </div>
                <div class="content">
                    <p style="margin-top:0;font-size:16px;">您好，监控系统检测到以下异常：</p>
                    
                    <table class="info-table">
                        <tr><th>告警概览：</th><td style="color:#e6a23c;">${data.message || '未提供描述'}</td></tr>
                        <tr><th>告警级别：</th><td>${data.level || 'L2'}</td></tr>
                        <tr><th>项目名称：</th><td>${data.project || '未知项目'}</td></tr>
                        <tr><th>运行环境：</th><td>${data.env || '未知环境'}</td></tr>
                        <tr><th>AppKey：</th><td>${data.appkey || '-'}</td></tr>
                        <tr><th>客户名称：</th><td>${data.customer_name || '-'}</td></tr>
                        <tr><th>服务名称：</th><td>${data.service_name || '-'}</td></tr>
                        <tr><th>触发时间：</th><td>${time}</td></tr>
                    </table>

                    ${data.error_message || data.error_stack ? `
                    <div class="error-box">
                        <p class="error-msg">${data.error_message || '未知错误信息'}</p>
                        ${data.error_stack ? `<pre class="stack">${data.error_stack}</pre>` : ''}
                    </div>
                    ` : ''}
                </div>
                <div class="footer">
                    此邮件由云监控告警系统自动发送，请勿回复。
                </div>
            </div>
        </body>
        </html>
        `;
    }
}

// 导出单例
module.exports = new EmailService();
