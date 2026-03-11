
/**
 * 指标数据模型
 * 表名: monitor_index_defs (符合公司规范)
 */
class IndexModel {
    constructor(db) {
        this.db = db;
    }

    // 添加指标
    async add(data) {
        const { index_code, index_name, index_desc } = data;
        try {
            await this.db.runAsync(
                `INSERT INTO monitor_index_defs (index_code, index_name, index_desc) VALUES (?, ?, ?)`,
                [index_code, index_name, index_desc || '']
            );
            return true;
        } catch (e) {
            console.error('Add index failed', e);
            throw e;
        }
    }

    // 更新指标
    async update(data) {
        const { index_code, index_name, index_desc } = data;
        try {
            const res = await this.db.runAsync(
                `UPDATE monitor_index_defs SET index_name = ?, index_desc = ? WHERE index_code = ?`,
                [index_name, index_desc || '', index_code]
            );
            return res.changes > 0;
        } catch (e) {
            console.error('Update index failed', e);
            throw e;
        }
    }

    // 删除指标
    async delete(index_code) {
        try {
            const res = await this.db.runAsync(`DELETE FROM monitor_index_defs WHERE index_code = ?`, [index_code]);
            return res.changes > 0;
        } catch (e) {
            console.error('Delete index failed', e);
            throw e;
        }
    }

    // 查询列表 (分页 + 搜索)
    async findList(params) {
        const { page = 1, per = 20, index_name, index_code } = params;
        const offset = (page - 1) * per;

        let where = [];
        let args = [];

        if (index_name) {
            where.push("monitor_index_defs.index_name LIKE ?");
            args.push(`%${index_name}%`);
        }
        if (index_code) {
            where.push("monitor_index_defs.index_code LIKE ?");
            args.push(`%${index_code}%`);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        try {
            const countRes = await this.db.getAsync(`SELECT COUNT(*) as total FROM monitor_index_defs ${whereClause}`, args);
            const list = await this.db.allAsync(
                `SELECT * FROM monitor_index_defs ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
                [...args, per, offset]
            );

            return {
                data: list,
                count: countRes.total
            };
        } catch (e) {
            console.error('Find index list failed', e);
            throw e;
        }
    }
}

module.exports = IndexModel;
