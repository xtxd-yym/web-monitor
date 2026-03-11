
const express = require('express');

module.exports = (indexModel) => {
    const router = express.Router();

    // 统一响应格式
    const success = (data) => ({ code: 1, msg: 'success', result: data });
    const error = (msg) => ({ code: 0, msg: msg || 'error', result: null });

    // 添加指标
    router.post('/add', async (req, res) => {
        try {
            await indexModel.add(req.body);
            res.json(success(null));
        } catch (e) {
            res.json(error(e.message));
        }
    });

    // 更新指标
    router.post('/update', async (req, res) => {
        try {
            const updated = await indexModel.update(req.body);
            if (updated) {
                res.json(success(null));
            } else {
                res.json(error('指标不存在'));
            }
        } catch (e) {
            res.json(error(e.message));
        }
    });

    // 删除指标
    // 兼容 legacy: POST /delete?index_id=xxx sent as query or body
    router.post('/delete', async (req, res) => {
        try {
            // 兼容前端发送的 index_code 和 legacy 的 index_id
            const index_code = req.body.index_code || req.body.index_id || req.query.index_id || req.query.index_code;
            if (!index_code) throw new Error('Missing index_code');

            const deleted = await indexModel.delete(index_code);
            if (deleted) {
                res.json(success(null));
            } else {
                res.json(error('指标不存在'));
            }
        } catch (e) {
            res.json(error(e.message));
        }
    });

    // 分页查询
    // Legacy path: /query/page
    router.post('/query/page', async (req, res) => {
        try {
            const params = {
                page: parseInt(req.body.page) || 1,
                per: parseInt(req.body.per) || 20,
                index_name: req.body.index_name,
                index_code: req.body.index_code,
                index_id: req.body.index_id
            };

            const result = await indexModel.findList(params);
            res.json(success(result));
        } catch (e) {
            res.json(error(e.message));
        }
    });

    return router;
};
