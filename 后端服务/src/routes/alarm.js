
const express = require('express');

module.exports = (alarmModel) => {
    const router = express.Router();

    const success = (data) => ({ code: 1, msg: 'success', result: data });
    const error = (msg) => ({ code: 0, msg: msg || 'error', result: null });

    router.post('/query/page', async (req, res) => {
        try {
            const params = {
                page: parseInt(req.body.page) || 1,
                per: parseInt(req.body.per) || 20,
                project: req.body.project,
                status: req.body.status,
                level: req.body.level,
                instance_id: req.body.instance_id,
                startTime: req.body.startTime,
                endTime: req.body.endTime
            };

            const result = await alarmModel.findList(params);
            res.json(success(result));
        } catch (e) {
            res.json(error(e.message));
        }
    });

    // Delete alarm record
    router.post('/delete', async (req, res) => {
        try {
            const { id } = req.body;
            if (!id) {
                return res.json(error('缺少告警记录ID'));
            }
            const deleted = await alarmModel.delete(id);
            if (deleted) {
                res.json(success({ deleted: true }));
            } else {
                res.json(error('未找到该告警记录'));
            }
        } catch (e) {
            res.json(error(e.message));
        }
    });

    return router;
};
