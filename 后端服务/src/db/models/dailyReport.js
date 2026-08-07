/**
 * AI 巡检日报数据模型
 * 表名: daily_reports
 */

class DailyReportModel {
    constructor(db) {
        this.db = db;
    }

    /**
     * 新增日报记录
     */
    async create(data) {
        const {
            report_date, stat_json, ai_summary_json, recipients, email_sent = 0,
            vanish_recipients = '', vanish_sent = 0, trigger_type = 'auto'
        } = data;
        const now = Date.now();

        try {
            const result = await this.db.runAsync(
                `INSERT INTO daily_reports (report_date, stat_json, ai_summary_json, recipients, email_sent, vanish_recipients, vanish_sent, trigger_type, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    report_date,
                    typeof stat_json === 'string' ? stat_json : JSON.stringify(stat_json),
                    typeof ai_summary_json === 'string' ? ai_summary_json : JSON.stringify(ai_summary_json),
                    recipients,
                    email_sent,
                    vanish_recipients,
                    vanish_sent,
                    trigger_type,
                    now
                ]
            );
            return { id: result.lastID };
        } catch (error) {
            console.error('[DailyReport] 创建日报记录失败:', error);
            throw error;
        }
    }

    /**
     * 分页查询历史日报列表
     */
    async findList({ page = 1, pageSize = 20 } = {}) {
        const offset = (page - 1) * pageSize;
        try {
            const { total } = await this.db.getAsync('SELECT COUNT(*) as total FROM daily_reports');
            const list = await this.db.allAsync(
                `SELECT id, report_date, recipients, email_sent, vanish_recipients, vanish_sent, trigger_type, created_at,
                        ai_summary_json
                 FROM daily_reports
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [pageSize, offset]
            );

            // 提取 ai_summary_json 中的 headline 字段用于列表展示，避免返回大量数据
            const simplifiedList = list.map(item => {
                let headline = '';
                try {
                    const summary = JSON.parse(item.ai_summary_json || '{}');
                    headline = summary.headline || '';
                } catch (_) {}
                return {
                    id: item.id,
                    report_date: item.report_date,
                    recipients: item.recipients,
                    email_sent: item.email_sent,
                    vanish_recipients: item.vanish_recipients,
                    vanish_sent: item.vanish_sent,
                    trigger_type: item.trigger_type,
                    created_at: item.created_at,
                    headline
                };
            });

            return {
                list: simplifiedList,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize)
            };
        } catch (error) {
            console.error('[DailyReport] 查询日报列表失败:', error);
            throw error;
        }
    }

    /**
     * 查询日报详情（含完整 stat_json 和 ai_summary_json）
     */
    async findById(id) {
        try {
            const row = await this.db.getAsync('SELECT * FROM daily_reports WHERE id = ?', [id]);
            if (!row) return null;

            // 解析 JSON 字段
            try { row.stat_json = JSON.parse(row.stat_json || '{}'); } catch (_) { row.stat_json = {}; }
            try { row.ai_summary_json = JSON.parse(row.ai_summary_json || '{}'); } catch (_) { row.ai_summary_json = {}; }

            return row;
        } catch (error) {
            console.error('[DailyReport] 查询日报详情失败:', error);
            throw error;
        }
    }

    /**
     * 查询指定报告日期是否已有 auto 触发记录（Cron 幂等保护）
     */
    async findAutoByDate(reportDate) {
        try {
            return await this.db.getAsync(
                "SELECT id, email_sent, vanish_sent FROM daily_reports WHERE report_date = ? AND trigger_type = 'auto' ORDER BY created_at DESC LIMIT 1",
                [reportDate]
            );
        } catch (error) {
            console.error('[DailyReport] 查询自动日报失败:', error);
            return null;
        }
    }

    /**
     * 获取指定日期的统计数据（用于环比计算）
     */
    async findByDate(date) {
        try {
            const row = await this.db.getAsync(
                'SELECT stat_json FROM daily_reports WHERE report_date = ? ORDER BY created_at DESC LIMIT 1',
                [date]
            );
            if (!row) return null;
            try { return JSON.parse(row.stat_json || '{}'); } catch (_) { return null; }
        } catch (error) {
            return null;
        }
    }

}

module.exports = DailyReportModel;
