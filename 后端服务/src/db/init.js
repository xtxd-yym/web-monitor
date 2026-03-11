const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const serverConfig = require('../config/server');

class DatabaseInit {
    constructor(config) {
        this.config = config || serverConfig.database;
        this.type = this.config.type || 'sqlite';
        this.db = null; // SQLite DB instance or MySQL Pool
    }

    /**
     * 初始化数据库
     */
    async init() {
        try {
            if (this.type === 'mysql') {
                await this.initMySQL();
            } else {
                await this.initSQLite();
            }

            // 挂载通用方法
            this.db.type = this.type; // Expose type for models
            this.db.runAsync = this.runAsync.bind(this);
            this.db.getAsync = this.getAsync.bind(this);
            this.db.allAsync = this.allAsync.bind(this);

            return this.db;
        } catch (error) {
            console.error('❌ 数据库初始化失败:', error);
            throw error;
        }
    }

    async initMySQL() {
        console.log('🔌 Connecting to MySQL...');
        console.log(`   Host: ${this.config.host}:${this.config.port}`);
        console.log(`   User: ${this.config.user}`);
        console.log(`   DB:   ${this.config.database}`);

        // 创建连接池
        this.db = mysql.createPool({
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            timezone: this.config.timezone || '+08:00',
            // 兼容旧版鉴权插件 (如果遇到 Client does not support authentication protocol 错误)
            // authPlugins: { mysql_clear_password: () => () => Buffer.from(password + '\0') } 
        });

        // 测试连接
        try {
            const connection = await this.db.getConnection();
            console.log('✅ MySQL 连接成功');
            connection.release(); // 释放连接回池
        } catch (error) {
            console.error('❌ MySQL 连接失败:', error.message);
            throw error; // 抛出错误让上层处理 (决定是否软启动)
        }

        // 初始化表结构
        await this.createTablesMySQL();
    }

    async createTablesMySQL() {
        // 表已由 DBA 人工创建，跳过自动建表
        console.log('✅ MySQL 表结构已就绪 (由 schema_mysql.sql 人工创建)');
    }

    async initSQLite() {
        // 确保数据库目录存在
        const dbDir = path.dirname(this.config.path);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // 创建数据库连接
        this.db = await this.createConnectionSQLite();

        // 启用外键约束和性能优化
        await this.runAsync('PRAGMA foreign_keys = ON');
        await this.runAsync('PRAGMA journal_mode = WAL');
        await this.runAsync('PRAGMA synchronous = NORMAL');

        await this.createTablesSQLite();
        console.log('✅ SQLite 初始化成功:', this.config.path);
    }

    createConnectionSQLite() {
        return new Promise((resolve, reject) => {
            let sqlite3;
            try {
                // 延迟加载 sqlite3，防止在不想用 sqlite 的环境下（如构建失败）导致崩溃
                sqlite3 = require('sqlite3').verbose();
            } catch (e) {
                console.error('❌ 无法加载 sqlite3 模块。如果是生产环境，请确保使用 MySQL 配置。');
                return reject(new Error('Module sqlite3 not found. Please install it or use MySQL.'));
            }

            const db = new sqlite3.Database(this.config.path, (err) => {
                if (err) reject(err);
                else resolve(db);
            });
        });
    }
    async createTablesSQLite() {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        // ... original logic ...
        const statements = schema.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const s of statements) await this.runAsync(s);
        console.log('✅ SQLite 表结构创建完成');
    }

    async runAsync(sql, params = []) {
        if (this.type === 'mysql') {
            const [result] = await this.db.execute(sql, params);
            // Map MySQL result to SQLite format
            return {
                lastID: result.insertId,
                changes: result.affectedRows
            };
        } else {
            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function (err) {
                    if (err) reject(err);
                    else resolve(this); // 'this' contains lastID and changes
                });
            });
        }
    }

    async getAsync(sql, params = []) {
        if (this.type === 'mysql') {
            // 加 FORCE_MASTER 注释，强制 ProxySQL 将读请求路由到主库
            // 避免从库复制延迟导致读写不一致（删除数据后仍能从从库查到旧数据）
            const forcedSql = sql.trimStart().startsWith('/*') ? sql : `/* FORCE_MASTER */ ${sql}`;
            const [rows] = await this.db.execute(forcedSql, params);
            return rows[0];
        } else {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
    }

    async allAsync(sql, params = []) {
        if (this.type === 'mysql') {
            // 加 FORCE_MASTER 注释，强制 ProxySQL 将读请求路由到主库
            const forcedSql = sql.trimStart().startsWith('/*') ? sql : `/* FORCE_MASTER */ ${sql}`;
            const [rows] = await this.db.execute(forcedSql, params);
            return rows;
        } else {
            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    close() {
        if (this.db) {
            if (this.type === 'mysql') {
                this.db.end();
            } else {
                this.db.close();
            }
        }
    }
}

module.exports = DatabaseInit;
