
/**
 * 实例/规则数据模型
 * 表名: alarm_instances (符合公司规范)
 */
class InstanceModel {
    constructor(db) {
        this.db = db;
    }

    async add(data) {
        const now = Date.now();
        const sql = `INSERT INTO alarm_instances 
            (instance_id, instance_name, project, index_code, threshold, time_frame, rules_json, instance_status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [
            data.instance_id || '', // Include instance_id
            data.instance_name || '',
            data.project || data.project_name || '',
            data.index_id || data.index_code || '',
            data.threshold || 0,
            data.time_frame || 60,
            JSON.stringify(data.rules || {}),
            data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
            now,
            now
        ];

        try {
            const result = await this.db.runAsync(sql, values);
            return { id: result.lastID, ...data };
        } catch (e) {
            console.error('Add instance failed', e);
            throw e;
        }
    }

    async update(data) {
        const { id, instance_id, ...updates } = data;
        let targetId = id;

        // 编辑页可能只提交部分进阶配置；合并已有 rules_json，避免保存其他字段时
        // 意外清空邮件/Vanish 收件人、级别和重复策略。
        if (updates.rules) {
            const existing = targetId
                ? await this.db.getAsync('SELECT rules_json FROM alarm_instances WHERE id = ?', [targetId])
                : await this.db.getAsync('SELECT rules_json FROM alarm_instances WHERE instance_id = ?', [instance_id]);
            let existingRules = {};
            try {
                existingRules = existing?.rules_json ? JSON.parse(existing.rules_json) : {};
            } catch (_) {
                existingRules = {};
            }
            updates.rules = { ...existingRules, ...updates.rules };
        }

        // 如果没有 id 但有 instance_id，则通过 instance_id 查找
        // 注意：这里我们假设 instance_id 是唯一的。如果更新需要基于 instance_id 定位记录

        // Define allowed fields to prevent SQL errors with unknown columns
        const fieldMapping = {
            'instance_id': 'instance_id', // Allow updating instance_id if needed, or searching by it
            'instance_name': 'instance_name',
            'index_id': 'index_code',
            'index_code': 'index_code',
            'project': 'project',
            'project_name': 'project',
            'threshold': 'threshold',
            'time_frame': 'time_frame',
            'rules': 'rules_json',
            'enabled': 'instance_status'
        };

        const setClauses = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (fieldMapping[key]) {
                const dbField = fieldMapping[key];
                let value = updates[key];

                if (key === 'rules') {
                    value = JSON.stringify(value);
                } else if (key === 'enabled') {
                    value = value ? 1 : 0;
                }

                setClauses.push(`${dbField} = ?`);
                values.push(value);
            }
        });

        if (setClauses.length === 0) return false;

        const now = Date.now();
        setClauses.push('updated_at = ?');
        values.push(now);

        let whereClause = '';
        if (targetId) {
            whereClause = 'WHERE id = ?';
            values.push(targetId);
        } else if (instance_id) {
            whereClause = 'WHERE instance_id = ?';
            values.push(instance_id);
        } else {
            throw new Error('Missing id or instance_id for update');
        }

        const sql = `UPDATE alarm_instances SET ${setClauses.join(', ')} ${whereClause}`;

        try {
            const res = await this.db.runAsync(sql, values);
            return res.changes > 0;
        } catch (e) {
            console.error('Update instance failed', e);
            throw e;
        }
    }

    async delete(id) {
        try {
            // Try to delete by ID (int) first
            let result = await this.db.runAsync(`DELETE FROM alarm_instances WHERE id = ?`, [id]);

            // If no rows affected, try deleting by instance_id (string)
            if (result.changes === 0) {
                result = await this.db.runAsync(`DELETE FROM alarm_instances WHERE instance_id = ?`, [id]);
            }
            return result.changes > 0;
        } catch (e) {
            console.error('Delete instance failed', e);
            throw e;
        }
    }

    async findList(params) {
        const { page = 1, per = 20, instance_name, instance_id, project, appkey, customer_name } = params;
        const offset = (page - 1) * per;

        let where = [];
        let args = [];

        if (instance_name) {
            where.push("alarm_instances.instance_name LIKE ?");
            args.push(`%${instance_name}%`);
        }
        if (instance_id) {
            where.push("alarm_instances.instance_id LIKE ?");
            args.push(`%${instance_id}%`);
        }
        if (project) {
            where.push("alarm_instances.project LIKE ?");
            args.push(`%${project}%`);
        }

        // JSON Field Filters
        if (appkey) {
            where.push("alarm_instances.rules_json LIKE ?");
            args.push(`%${appkey}%`); // Fuzzy match anywhere in rules_json
        }
        if (customer_name) {
            where.push("alarm_instances.rules_json LIKE ?");
            args.push(`%${customer_name}%`);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        try {
            const countRes = await this.db.getAsync(`SELECT COUNT(*) as total FROM alarm_instances ${whereClause}`, args);
            const list = await this.db.allAsync(
                `SELECT * FROM alarm_instances ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                [...args, per, offset]
            );

            return {
                data: list,
                count: countRes.total
            };
        } catch (e) {
            console.error('Find instance list failed', e);
            throw e;
        }
    }

    /**
     * 匹配规则
     * @param {string} project 项目名称
     */
    async matchRules(project) {
        try {
            const sql = `SELECT * FROM alarm_instances WHERE project = ? AND instance_status = 1`;
            return await this.db.allAsync(sql, [project]);
        } catch (e) {
            console.error('Match rules failed', e);
            return [];
        }
    }
}

module.exports = InstanceModel;
