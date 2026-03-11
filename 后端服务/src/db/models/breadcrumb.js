/**
 * Breadcrumb（面包屑）数据模型
 * 负责用户操作轨迹的存储和查询
 * 表名: user_breadcrumbs (符合公司规范)
 */

class BreadcrumbModel {
    constructor(db) {
        this.db = db;
    }

    /**
     * 批量插入面包屑（关联到错误）
     */
    async insertBatch(errorId, breadcrumbs) {
        if (!breadcrumbs || breadcrumbs.length === 0) {
            return { count: 0 };
        }

        try {
            let count = 0;
            for (const breadcrumb of breadcrumbs) {
                const { category, message, type = '', data, timestamp } = breadcrumb;
                await this.db.runAsync(`
                    INSERT INTO user_breadcrumbs (error_id, breadcrumb_type, category, breadcrumb_message, breadcrumb_data, event_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    errorId,
                    type,
                    category || '',
                    message || '',
                    data ? JSON.stringify(data) : '',
                    timestamp || 0
                ]);
                count++;
            }

            return { count };
        } catch (error) {
            console.error('批量插入面包屑失败:', error);
            throw error;
        }
    }

    /**
     * 查询错误的所有面包屑
     */
    async findByErrorId(errorId) {
        try {
            const results = await this.db.allAsync(`
        SELECT * FROM user_breadcrumbs 
        WHERE error_id = ? 
        ORDER BY event_time ASC
      `, [errorId]);

            // 解析 JSON 数据
            results.forEach(row => {
                if (row.breadcrumb_data) {
                    try {
                        row.data = JSON.parse(row.breadcrumb_data);
                    } catch {
                        row.data = {};
                    }
                }
            });

            return results;
        } catch (error) {
            console.error('查询面包屑失败:', error);
            throw error;
        }
    }

    /**
     * 删除错误的面包屑
     */
    async deleteByErrorId(errorId) {
        try {
            const result = await this.db.runAsync('DELETE FROM user_breadcrumbs WHERE error_id = ?', [errorId]);
            return result.changes;
        } catch (error) {
            console.error('删除面包屑失败:', error);
            throw error;
        }
    }
}

module.exports = BreadcrumbModel;
