
/**
 * 错误数据模型
 * 负责错误数据的 CRUD 操作
 * 表名: error_logs (符合公司规范)
 */

class ErrorModel {
    constructor(db) {
        this.db = db;
    }

    /**
     * 插入错误记录（支持去重）
     */
    async insert(errorData) {
        const {
            type, message, severity = 'error',
            url, filename, lineno, colno, stack,
            original_filename, original_lineno, original_colno, original_stack, source_snippet,
            sdk_version, project, env, customer_name,
            user_id, user_agent, browser_name, browser_version, os_name, device_type,
            breadcrumbs, extra_data,
            fingerprint, timestamp
        } = errorData;

        const now = Date.now();

        try {
            // 检查是否已存在相同指纹的错误 (默认1小时内的才合并，可通过环境变量配置)
            // 环境变量单位为秒，默认为 3600 秒 (1小时)
            const dedupeSeconds = parseInt(process.env.ERROR_DEDUPE_WINDOW_SECONDS) || 3600;
            const DEDUPE_WINDOW = dedupeSeconds * 1000;
            const existing = await this.db.getAsync(`
        SELECT id, occurrence_count FROM error_logs 
        WHERE fingerprint = ? AND project = ? AND env = ?
        AND updated_at > ?
        ORDER BY created_at DESC LIMIT 1
      `, [fingerprint, project, env, now - DEDUPE_WINDOW]);

            if (existing) {
                // 更新已存在的记录
                await this.db.runAsync(`
          UPDATE error_logs 
          SET occurrence_count = occurrence_count + 1,
              updated_at = ?
          WHERE id = ?
        `, [now, existing.id]);

                return { id: existing.id, updated: true, occurrence_count: existing.occurrence_count + 1 };
            } else {
                // 插入新记录
                // Check if extra_data is already a string/JSON. Parse it if so to merge correctly.
                let baseExtraData = extra_data || {};
                if (typeof baseExtraData === 'string') {
                    try {
                        baseExtraData = JSON.parse(baseExtraData);
                    } catch (e) {
                        console.warn('Failed to parse extra_data string, using as empty object', e);
                        baseExtraData = {};
                    }
                }

                // Merge data visibility fields into extra_data
                const mergedExtraData = {
                    ...baseExtraData,
                    customer_name: errorData.customer_name || '',
                    appkey: errorData.appkey || '',
                    service_name: errorData.service_name || ''
                };

                const result = await this.db.runAsync(`
          INSERT INTO error_logs (
            error_type, error_message, error_stack,
            error_file, error_line, error_col,
            project, env, user_id, fingerprint, 
            error_status, occurrence_count, 
            created_at, updated_at, extra_data
          ) VALUES (
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            'open', 1,
            ?, ?, ?
          )
        `, [
                    type, message || '', stack || '',
                    filename || '', lineno || 0, colno || 0,
                    project, env, user_id || '', fingerprint || '',
                    now, now, typeof mergedExtraData === 'string' ? mergedExtraData : JSON.stringify(mergedExtraData)
                ]);

                return { id: result.lastID, updated: false, occurrence_count: 1 };
            }
        } catch (error) {
            console.error('插入错误记录失败:', error);
            throw error;
        }
    }

    /**
     * 根据 ID 查询错误详情
     */
    async findById(id) {
        try {
            const error = await this.db.getAsync('SELECT * FROM error_logs WHERE id = ?', [id]);

            if (error) {
                // 解析 JSON 字段
                error.extra_data = error.extra_data ? JSON.parse(error.extra_data) : {};
            }

            return error;
        } catch (error) {
            console.error('查询错误详情失败:', error);
            throw error;
        }
    }

    /**
     * 查询错误列表（分页、筛选）
     */
    async findList(params) {
        const {
            page = 1,
            pageSize = 20,
            project,
            env,
            type,
            keyword,
            customer_name,
            appkey,
            service_name,
            startTime,
            endTime
        } = params;

        try {
            let whereConditions = [];
            let queryParams = [];

            if (project) {
                whereConditions.push('project = ?');
                queryParams.push(project);
            }
            if (env) {
                whereConditions.push('env = ?');
                queryParams.push(env);
            }
            if (type) {
                whereConditions.push('error_type = ?');
                queryParams.push(type);
            }
            if (keyword) {
                whereConditions.push('(error_message LIKE ? OR error_stack LIKE ?)');
                queryParams.push(`%${keyword}%`, `%${keyword}%`);
            }
            // 从 extra_data JSON 中筛选业务字段
            if (customer_name) {
                if (this.db.type === 'mysql') {
                    whereConditions.push("JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.customer_name')) LIKE ?");
                } else {
                    whereConditions.push('extra_data LIKE ?');
                }
                queryParams.push(`%${customer_name}%`);
            }
            if (appkey) {
                if (this.db.type === 'mysql') {
                    whereConditions.push("JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.appkey')) LIKE ?");
                } else {
                    whereConditions.push('extra_data LIKE ?');
                }
                queryParams.push(`%${appkey}%`);
            }
            if (service_name) {
                if (this.db.type === 'mysql') {
                    whereConditions.push("JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.service_name')) LIKE ?");
                } else {
                    whereConditions.push('extra_data LIKE ?');
                }
                queryParams.push(`%${service_name}%`);
            }
            if (startTime) {
                whereConditions.push('created_at >= ?');
                queryParams.push(startTime);
            }
            if (endTime) {
                whereConditions.push('created_at <= ?');
                queryParams.push(endTime);
            }

            const whereClause = whereConditions.length > 0
                ? 'WHERE ' + whereConditions.join(' AND ')
                : '';

            // 查询总数
            const { total } = await this.db.getAsync(`SELECT COUNT(*) as total FROM error_logs ${whereClause}`, queryParams);

            // 查询列表
            const offset = (page - 1) * pageSize;
            const list = await this.db.allAsync(`
        SELECT 
          id, error_type, error_message, error_file, error_line, error_col, error_stack,
          project, env, user_id,
          fingerprint, occurrence_count, created_at, updated_at, extra_data
        FROM error_logs
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, pageSize, offset]);

            // Parse extra_data if exists
            list.forEach(item => {
                if (item.extra_data) {
                    try {
                        item.parsedData = JSON.parse(item.extra_data);
                    } catch (e) {
                        item.parsedData = {};
                    }
                }
            });

            return {
                list,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize)
            };
        } catch (error) {
            console.error('查询错误列表失败:', error);
            throw error;
        }
    }

    /**
     * 获取错误统计数据
     */
    async getStats(params) {
        const { project, env, startTime, endTime } = params;

        try {
            let whereConditions = [];
            let queryParams = [];

            if (project) {
                whereConditions.push('project = ?');
                queryParams.push(project);
            }
            if (env) {
                whereConditions.push('env = ?');
                queryParams.push(env);
            }
            if (startTime) {
                whereConditions.push('created_at >= ?');
                queryParams.push(startTime);
            }
            if (endTime) {
                whereConditions.push('created_at <= ?');
                queryParams.push(endTime);
            }

            const whereClause = whereConditions.length > 0
                ? 'WHERE ' + whereConditions.join(' AND ')
                : '';

            // 总错误数
            const { total } = await this.db.getAsync(`SELECT COUNT(*) as total FROM error_logs ${whereClause}`, queryParams);

            // 按类型统计
            const byTypeRows = await this.db.allAsync(`
        SELECT error_type, COUNT(*) as count 
        FROM error_logs ${whereClause}
        GROUP BY error_type
      `, queryParams);
            const byType = {};
            byTypeRows.forEach(row => {
                byType[row.error_type] = row.count;
            });

            // Top 错误（按 fingerprint 聚合）
            const topErrorsRows = await this.db.allAsync(`
        SELECT fingerprint, error_message, error_type, id, SUM(occurrence_count) as count
        FROM error_logs ${whereClause}
        GROUP BY fingerprint
        ORDER BY count DESC
        LIMIT 5
      `, queryParams);

            const topErrors = topErrorsRows.map(row => ({
                ...row,
                message: row.error_message // Map for frontend
            }));

            return {
                total,
                byType,
                topErrors
            };
        } catch (error) {
            console.error('获取错误统计失败:', error);
            throw error;
        }
    }

    /**
     * 统计指定条件下的错误数量（用于告警判断）
     */
    async count(params) {
        const { project, env, type, startTime, endTime } = params;

        let where = [];
        let args = [];

        if (project) { where.push('project = ?'); args.push(project); }
        if (env) { where.push('env = ?'); args.push(env); }
        if (type) { where.push('error_type = ?'); args.push(type); }
        // Use updated_at to catch errors that happened recently but were created long ago
        if (startTime) { where.push('updated_at >= ?'); args.push(startTime); }
        if (endTime) { where.push('updated_at <= ?'); args.push(endTime); }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        try {
            const res = await this.db.getAsync(`SELECT SUM(occurrence_count) as total FROM error_logs ${whereClause}`, args);
            return res.total || 0;
        } catch (e) {
            console.error('Count errors failed', e);
            return 0;
        }
    }

    /**
     * 获取所有项目列表 (去重)
     */
    async getProjects() {
        try {
            const rows = await this.db.allAsync('SELECT DISTINCT project FROM error_logs ORDER BY project ASC');
            return rows.map(row => row.project).filter(p => p);
        } catch (error) {
            console.error('获取项目列表失败:', error);
            throw error;
        }
    }

    /**
     * 获取错误趋势数据
     */
    async getTrend(params) {
        const { project, env, startTime, endTime, interval = 'hour' } = params;

        try {
            // ================= 修复区域 =================
            let whereConditions = [];
            let queryParams = [];

            if (project) {
                whereConditions.push('project = ?');
                queryParams.push(project);
            }
            if (env) {
                whereConditions.push('env = ?');
                queryParams.push(env);
            }
            // ============================================

            if (startTime) {
                whereConditions.push('created_at >= ?');
                queryParams.push(startTime);
            }
            if (endTime) {
                whereConditions.push('created_at <= ?');
                queryParams.push(endTime);
            }

            const whereClause = 'WHERE ' + whereConditions.join(' AND ');

            // 根据间隔选择时间格式
            let timeFormat;
            if (this.db.type === 'mysql') {
                // MySQL syntax
                if (interval === 'hour') {
                    timeFormat = "DATE_FORMAT(FROM_UNIXTIME(created_at / 1000), '%Y-%m-%d %H:00:00')";
                } else {
                    timeFormat = "DATE(FROM_UNIXTIME(created_at / 1000))";
                }
            } else {
                // SQLite syntax
                if (interval === 'hour') {
                    timeFormat = "datetime(created_at / 1000, 'unixepoch', 'localtime', 'start of hour')";
                } else {
                    timeFormat = "date(created_at / 1000, 'unixepoch', 'localtime')";
                }
            }

            const results = await this.db.allAsync(`
        SELECT 
          ${timeFormat} as time,
          error_type,
          COUNT(*) as count
        FROM error_logs
        ${whereClause}
        GROUP BY time, error_type
        ORDER BY time ASC
      `, queryParams);

            // 转换为时间线格式
            const timelineMap = new Map();
            results.forEach(row => {
                if (!timelineMap.has(row.time)) {
                    timelineMap.set(row.time, { time: row.time, count: 0, types: {} });
                }
                const point = timelineMap.get(row.time);
                point.count += row.count;
                point.types[row.error_type] = row.count;
            });

            return {
                timeline: Array.from(timelineMap.values())
            };
        } catch (error) {
            console.error('获取错误趋势失败:', error);
            throw error;
        }
    }

    /**
     * 按 AppKey 分组统计错误量（用于 Dashboard）
     * 返回: [ { appkey, service_name, total, byType }, ... ]
     * @param {Object} params - { startTime, endTime }
     */
    async getStatsByAppkey(params = {}) {
        // === 修改点 1: 接收 project 和 env ===
        const { project, env, startTime, endTime } = params;

        let where = [];
        let args = [];

        // === 修改点 2: 增加动态 WHERE 条件 ===
        if (project) { where.push('project = ?'); args.push(project); }
        if (env) { where.push('env = ?'); args.push(env); }

        if (startTime) { where.push('created_at >= ?'); args.push(startTime); }
        if (endTime) { where.push('created_at <= ?'); args.push(endTime); }
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        try {
            // 全量取出 extra_data + 分类字段（数量级可控，按 appkey 聚合后返回）
            let rows;
            if (this.db.type === 'mysql') {
                rows = await this.db.allAsync(`
                    SELECT /* FORCE_MASTER */
                        JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.appkey'))       AS appkey,
                        JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.service_name')) AS service_name,
                        error_type,
                        SUM(occurrence_count) AS cnt
                    FROM error_logs
                    ${whereClause}
                    GROUP BY appkey, service_name, error_type
                    ORDER BY appkey ASC
                `, args);
            } else {
                // SQLite: 分两步（先取 extra_data 字符串，JS 侧解析）
                rows = await this.db.allAsync(`
                    SELECT extra_data, error_type, SUM(occurrence_count) AS cnt
                    FROM error_logs
                    ${whereClause}
                    GROUP BY extra_data, error_type
                `, args);
                // 展开 extra_data 中的 appkey / service_name
                rows = rows.map(r => {
                    let appkey = '', service_name = '';
                    try {
                        const d = JSON.parse(r.extra_data || '{}');
                        appkey = d.appkey || '';
                        service_name = d.service_name || '';
                    } catch (_) { }
                    return { appkey, service_name, error_type: r.error_type, cnt: r.cnt };
                });
            }

            // 聚合成 Map<appkey, { appkey, service_name, total, byType }>
            const map = new Map();
            for (const row of rows) {
                const key = row.appkey || '(unknown)';
                if (!map.has(key)) {
                    map.set(key, {
                        appkey: key,
                        service_name: row.service_name || '',
                        total: 0,
                        byType: {}
                    });
                }
                const entry = map.get(key);
                const cnt = Number(row.cnt) || 0;
                entry.total += cnt;
                entry.byType[row.error_type] = (entry.byType[row.error_type] || 0) + cnt;
            }

            return Array.from(map.values()).sort((a, b) => b.total - a.total);
        } catch (error) {
            console.error('按 AppKey 统计错误失败:', error);
            throw error;
        }
    }

    /**
     * 删除错误记录
     */
    async delete(id) {
        try {
            const result = await this.db.runAsync('DELETE FROM error_logs WHERE id = ?', [id]);
            return result.changes > 0;
        } catch (error) {
            console.error('删除错误记录失败:', error);
            throw error;
        }
    }
}

module.exports = ErrorModel;
