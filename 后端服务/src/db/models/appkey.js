const crypto = require('crypto');

/**
 * AppKey 注册模型
 * 表名: appkey_registry
 */
class AppkeyModel {
    constructor(db) {
        this.db = db;
    }

    /**
     * 新增 AppKey 记录
     * @param {Object} data 
     * @returns {Object} 包含新插入记录的对象
     */
    async create(data) {
        const { appkey, customer_name, service_name, owner } = data;
        
        if (!appkey || !customer_name || !service_name) {
            throw new Error('缺少必填字段: appkey, customer_name, service_name');
        }

        // 检查是否已存在
        const exists = await this.findByAppkey(appkey);
        if (exists) {
            throw new Error(`AppKey [${appkey}] 已被注册`);
        }

        const now = Date.now();
        const sql = `INSERT INTO appkey_registry 
            (appkey, customer_name, service_name, app_owner, app_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`;

        const values = [
            appkey,
            customer_name,
            service_name,
            owner || '',
            1, // 默认启用状态
            now,
            now
        ];

        try {
            const result = await this.db.runAsync(sql, values);
            return {
                id: result.lastID,
                appkey,
                customer_name,
                service_name,
                owner: owner || '',
                status: 1,
                created_at: now,
                updated_at: now
            };
        } catch (e) {
            console.error('Create appkey failed', e);
            throw e;
        }
    }

    /**
     * 查询 AppKey 列表
     * @param {Object} params 查询参数
     */
    async list(params = {}) {
        const { page = 1, pageSize = 20, appkey, customer_name, service_name, status } = params;
        const offset = (page - 1) * pageSize;

        let where = [];
        let args = [];

        if (appkey) {
            where.push('appkey LIKE ?');
            args.push(`%${appkey}%`);
        }
        if (customer_name) {
            where.push('customer_name LIKE ?');
            args.push(`%${customer_name}%`);
        }
        if (service_name) {
            where.push('service_name LIKE ?');
            args.push(`%${service_name}%`);
        }
        if (status !== undefined && status !== '') {
            where.push('app_status = ?');
            args.push(parseInt(status));
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        try {
            const countRes = await this.db.getAsync(
                `SELECT COUNT(*) as total FROM appkey_registry ${whereClause}`,
                args
            );

            const data = await this.db.allAsync(
                `SELECT * FROM appkey_registry ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                [...args, parseInt(pageSize), offset]
            );

            const mappedData = data.map(item => {
                const mapped = { ...item, owner: item.app_owner, status: item.app_status };
                delete mapped.app_owner;
                delete mapped.app_status;
                return mapped;
            });

            return {
                data: mappedData,
                total: countRes.total
            };
        } catch (e) {
            console.error('Find appkey list failed', e);
            throw e;
        }
    }

    /**
     * 根据 appkey 精确查询
     */
    async findByAppkey(appkey) {
        try {
            const sql = 'SELECT * FROM appkey_registry WHERE appkey = ? LIMIT 1';
            const record = await this.db.getAsync(sql, [appkey]);
            if (record) {
                record.owner = record.app_owner;
                record.status = record.app_status;
                delete record.app_owner;
                delete record.app_status;
            }
            return record;
        } catch (e) {
            console.error('Find by appkey failed', e);
            throw e;
        }
    }

    /**
     * 更新状态 (启用/禁用)
     * @param {number} id 
     * @param {number} status (1 or 0)
     */
    async updateStatus(id, status) {
        try {
            const now = Date.now();
            const result = await this.db.runAsync(
                'UPDATE appkey_registry SET app_status = ?, updated_at = ? WHERE id = ?',
                [status, now, id]
            );
            return result.changes > 0;
        } catch (e) {
            console.error('Update appkey status failed', e);
            throw e;
        }
    }
}

module.exports = AppkeyModel;
