const express = require('express');

module.exports = (appkeyModel) => {
    const router = express.Router();

    /**
     * POST /api/appkey/create
     * 申请新的 AppKey
     */
    router.post('/create', async (req, res) => {
        try {
            const { appkey, customer_name, service_name, owner } = req.body;
            
            if (!appkey || !customer_name || !service_name) {
                return res.status(400).json({
                    success: false,
                    msg: '缺少必填字段: appkey, customer_name, service_name'
                });
            }

            const data = { appkey, customer_name, service_name, owner };
            const result = await appkeyModel.create(data);

            res.json({
                success: true,
                msg: 'AppKey 申请成功',
                data: result
            });
        } catch (error) {
            console.error('申请 AppKey 失败:', error);
            // 处理唯一索引冲突
            if (error.message.includes('已被注册') || error.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({
                    success: false,
                    msg: `AppKey [${req.body.appkey}] 已存在`,
                    error: error.message
                });
            }
            res.status(500).json({
                success: false,
                msg: '申请 AppKey 失败',
                error: error.message
            });
        }
    });

    /**
     * GET /api/appkey/list
     * 获取 AppKey 列表
     */
    router.get('/list', async (req, res) => {
        try {
            const { page = 1, pageSize = 20, appkey, customer_name, service_name, status } = req.query;

            const result = await appkeyModel.list({
                page: parseInt(page),
                pageSize: parseInt(pageSize),
                appkey,
                customer_name,
                service_name,
                status
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('获取 AppKey 列表失败:', error);
            res.status(500).json({
                success: false,
                msg: '获取 AppKey 列表失败',
                error: error.message
            });
        }
    });

    /**
     * POST /api/appkey/updateStatus
     * 更新 AppKey 状态 (启用/禁用)
     */
    router.post('/updateStatus', async (req, res) => {
        try {
            const { id, status } = req.body;
            
            if (!id || typeof status === 'undefined') {
                return res.status(400).json({
                    success: false,
                    msg: '缺少参数 id 或 status'
                });
            }

            const parsedStatus = parseInt(status) === 1 ? 1 : 0;
            const updated = await appkeyModel.updateStatus(id, parsedStatus);

            if (updated) {
                res.json({
                    success: true,
                    msg: parsedStatus === 1 ? '已启用 AppKey' : '已禁用 AppKey'
                });
            } else {
                res.status(404).json({
                    success: false,
                    msg: 'AppKey 不存在或未发生修改'
                });
            }
        } catch (error) {
            console.error('更新 AppKey 状态失败:', error);
            res.status(500).json({
                success: false,
                msg: '更新 AppKey 状态失败',
                error: error.message
            });
        }
    });

    return router;
};
