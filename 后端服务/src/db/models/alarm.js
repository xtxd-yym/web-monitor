
/**
 * 告警记录数据模型
 * 表名: alarm_records (符合公司规范)
 *
 * 设计说明：
 * 告警记录是历史审计日志，其中 instance_name / instance_uuid 是写入时的快照。
 * 查询时不依赖 alarm_instances 是否存在，即使关联实例被删除，历史告警记录仍完整保留。
 */
class AlarmModel {
    constructor(db) {
        this.db = db;
    }

    /**
     * 新增告警
     * @param {Object} data
     */
    async add(data) {
        const now = Date.now();
        const sql = `INSERT INTO alarm_records 
            (project, instance_id, instance_name, instance_uuid, error_id, alarm_level, alarm_message, alarm_status, customer_name, appkey, service_name, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [
            data.project || '',
            data.instance_id || 0,
            data.instance_name || '',  // 持久化快照：实例名称
            data.instance_uuid || '',  // 持久化快照：用户自定义实例ID
            data.error_id || 0,
            data.level || 'L1',
            data.message || '',
            data.status || 'pending',
            data.customer_name || '',
            data.appkey || '',
            data.service_name || '',
            now,
            now
        ];

        try {
            const result = await this.db.runAsync(sql, values);
            return {
                id: result.lastID,
                ...data
            };
        } catch (e) {
            console.error('Add alarm failed', e);
            throw e;
        }
    }

    /**
     * 查询告警列表（纯快照查询，不 JOIN alarm_instances）
     * 即使关联实例已删除，记录依然稳定返回
     */
    async findList(params) {
        const { page = 1, per = 20, project, status, level, instance_id, startTime, endTime } = params;
        const offset = (page - 1) * per;

        let where = [];
        let args = [];

        if (project) {
            where.push('project = ?');
            args.push(project);
        }
        if (status) {
            where.push('alarm_status = ?');
            args.push(status);
        }
        if (level) {
            where.push('alarm_level = ?');
            args.push(level);
        }
        if (instance_id) {
            // 查快照字段 instance_uuid，不依赖实例是否仍然存在
            where.push('instance_uuid LIKE ?');
            args.push(`%${instance_id}%`);
        }
        if (startTime) {
            where.push('created_at >= ?');
            args.push(startTime);
        }
        if (endTime) {
            where.push('created_at <= ?');
            args.push(endTime);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        try {
            const countRes = await this.db.getAsync(
                `SELECT COUNT(*) as total FROM alarm_records ${whereClause}`,
                args
            );

            const list = await this.db.allAsync(
                `SELECT * FROM alarm_records ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                [...args, per, offset]
            );

            return {
                data: list,
                count: countRes.total
            };
        } catch (e) {
            console.error('Find alarm list failed', e);
            throw e;
        }
    }

    /**
     * 查询某实例最新的一条告警记录（用于静默期判断）
     */
    async findLatest(params) {
        const { instance_id } = params;
        try {
            const sql = `SELECT * FROM alarm_records WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1`;
            return await this.db.getAsync(sql, [instance_id]);
        } catch (e) {
            console.error('Find latest alarm failed', e);
            throw e;
        }
    }

    /**
     * 删除告警记录
     */
    async delete(id) {
        try {
            const result = await this.db.runAsync(`DELETE FROM alarm_records WHERE id = ?`, [id]);
            return result.changes > 0;
        } catch (e) {
            console.error('Delete alarm failed', e);
            throw e;
        }
    }
}

module.exports = AlarmModel;
