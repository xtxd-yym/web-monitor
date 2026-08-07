/**
 * 配置数据模型
 * 负责监控配置的 CRUD 操作
 * 表名: monitor_configs (符合公司规范)
 */

class ConfigModel {
    constructor(db) {
        this.db = db;
    }

    /**
     * 插入或更新配置
     * 按 appkey + customer_name 唯一定位
     */
    async upsert(configData) {
        const { appkey, customer_name = '', project = '', env = 'production', config } = configData;
        const now = Date.now();

        try {
            // 检查是否已存在 (按 appkey + customer_name)
            const existing = await this.db.getAsync(`
        SELECT id FROM monitor_configs 
        WHERE appkey = ? AND customer_name = ?
      `, [appkey, customer_name]);

            if (existing) {
                // 更新配置
                await this.db.runAsync(`
          UPDATE monitor_configs 
          SET config_json = ?, project = ?, env = ?, updated_at = ?
          WHERE id = ?
        `, [JSON.stringify(config), project, env, now, existing.id]);

                return { id: existing.id, updated: true };
            } else {
                // 插入新配置
                const result = await this.db.runAsync(`
          INSERT INTO monitor_configs (appkey, customer_name, project, env, config_json, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, '')
        `, [appkey, customer_name, project, env, JSON.stringify(config), now]);

                return { id: result.lastID, updated: false };
            }
        } catch (error) {
            console.error('插入/更新配置失败:', error);
            throw error;
        }
    }

    /**
     * 查询配置 (按 appkey + customer_name)
     */
    async findOne(appkey, customer_name = '') {
        try {
            const result = await this.db.getAsync(`
        SELECT * FROM monitor_configs 
        WHERE appkey = ? AND customer_name = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `, [appkey, customer_name]);

            if (result) {
                result.config = result.config_json ? JSON.parse(result.config_json) : {};
            }

            return result;
        } catch (error) {
            console.error('查询配置失败:', error);
            throw error;
        }
    }

    /**
     * 查询所有配置
     */
    async findAll(params = {}) {
        const { appkey, customer_name, project, env } = params;

        try {
            // 固定排除系统内部配置（如 AI 日报收件人），不暴露给业务列表
            let whereConditions = ["appkey != '__system__'"];
            let queryParams = [];

            if (appkey) {
                whereConditions.push('appkey LIKE ?');
                queryParams.push(`%${appkey}%`);
            }
            if (customer_name) {
                whereConditions.push('customer_name LIKE ?');
                queryParams.push(`%${customer_name}%`);
            }
            if (project) {
                whereConditions.push('project = ?');
                queryParams.push(project);
            }
            if (env) {
                whereConditions.push('env = ?');
                queryParams.push(env);
            }

            const whereClause = whereConditions.length > 0
                ? 'WHERE ' + whereConditions.join(' AND ')
                : '';

            const results = await this.db.allAsync(`
        SELECT * FROM monitor_configs ${whereClause} ORDER BY updated_at DESC
      `, queryParams);

            // 解析 JSON 配置
            results.forEach(row => {
                row.config = row.config_json ? JSON.parse(row.config_json) : {};
            });

            return results;
        } catch (error) {
            console.error('查询所有配置失败:', error);
            throw error;
        }
    }

    /**
     * 删除配置
     */
    async delete(id) {
        try {
            const result = await this.db.runAsync('DELETE FROM monitor_configs WHERE id = ?', [id]);
            return result.changes > 0;
        } catch (error) {
            console.error('删除配置失败:', error);
            throw error;
        }
    }

    /**
     * 删除配置 (按 appkey + customer_name)
     */
    async deleteByKeys(appkey, customer_name = '') {
        try {
            const result = await this.db.runAsync(
                'DELETE FROM monitor_configs WHERE appkey = ? AND customer_name = ?',
                [appkey, customer_name]
            );
            return result.changes > 0;
        } catch (error) {
            console.error('删除配置失败:', error);
            throw error;
        }
    }

    /**
     * 禁用配置 (由于新表没有 is_active 字段，直接返回 true 表示成功)
     */
    async disable(id) {
        // 新表结构没有 is_active 字段，此方法暂时不做实际操作
        // 如果需要此功能，需要在数据库表中添加相应字段
        console.warn(`[ConfigModel] disable(${id}) called but is_active field not in schema`);
        return true;
    }

    /**
     * 启用配置 (由于新表没有 is_active 字段，直接返回 true 表示成功)
     */
    async enable(id) {
        // 新表结构没有 is_active 字段，此方法暂时不做实际操作
        console.warn(`[ConfigModel] enable(${id}) called but is_active field not in schema`);
        return true;
    }

    /**
     * 读取系统全局配置（key-value 存储，appkey='__system__'）
     * @param {string} key 配置键，如 'ai_daily_report_recipients'
     */
    async getSystemConfig(key) {
        try {
            const row = await this.db.getAsync(
                "SELECT config_json FROM monitor_configs WHERE appkey = '__system__' AND customer_name = ? LIMIT 1",
                [key]
            );
            if (!row) return null;
            try { return JSON.parse(row.config_json); } catch (_) { return row.config_json; }
        } catch (err) {
            console.error('[ConfigModel] 读取系统配置失败:', err);
            return null;
        }
    }

    /**
     * 写入/更新系统全局配置
     * @param {string} key   配置键
     * @param {*}      value 配置值（对象或字符串，自动 JSON 序列化）
     */
    async setSystemConfig(key, value) {
        const now = Date.now();
        const jsonVal = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
        try {
            const existing = await this.db.getAsync(
                "SELECT id FROM monitor_configs WHERE appkey = '__system__' AND customer_name = ? LIMIT 1",
                [key]
            );
            if (existing) {
                await this.db.runAsync(
                    "UPDATE monitor_configs SET config_json = ?, updated_at = ? WHERE id = ?",
                    [jsonVal, now, existing.id]
                );
                return { updated: true };
            } else {
                const result = await this.db.runAsync(
                    "INSERT INTO monitor_configs (appkey, customer_name, project, env, config_json, updated_at, updated_by) VALUES ('__system__', ?, '', 'production', ?, ?, 'system')",
                    [key, jsonVal, now]
                );
                return { updated: false, id: result.lastID };
            }
        } catch (err) {
            console.error('[ConfigModel] 写入系统配置失败:', err);
            throw err;
        }
    }
}

module.exports = ConfigModel;
