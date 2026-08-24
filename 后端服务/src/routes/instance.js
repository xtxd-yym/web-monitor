
const express = require('express');
const vanishService = require('../services/vanish');
const { validateAlarmRule } = require('../services/alarmPolicy');

function validateRules({ threshold, rules, defaultLevel, requireThreshold = false }) {
    if (requireThreshold || threshold !== undefined) {
        validateAlarmRule({ threshold, level: rules.level || defaultLevel });
    }

    if (rules.vanish_enabled !== undefined && typeof rules.vanish_enabled !== 'boolean') {
        throw new Error('vanish_enabled 必须为布尔值');
    }
    if (rules.vanish_enabled === true) {
        vanishService.validateRecipients(rules.vanish_notice_person);
    }
}

module.exports = (instanceModel) => {
    const router = express.Router();

    const success = (data) => ({ code: 1, msg: 'success', result: data });
    const error = (msg) => ({ code: 0, msg: msg || 'error', result: null });

    router.post('/add', async (req, res) => {
        try {
            const {
                instance_id, instance_name, project, project_name, index_code, index_id,
                threshold, time_frame, enabled, instance_status,
                ...rules
            } = req.body;

            const data = {
                instance_id, instance_name,
                project: project || project_name,
                index_code: index_code || index_id,
                threshold, time_frame,
                enabled: enabled !== undefined ? enabled : (instance_status !== undefined ? (instance_status === 1) : true),
                rules
            };

            validateRules({ threshold, rules, defaultLevel: 'L1', requireThreshold: true });
            await instanceModel.add(data);
            res.json(success(null));
        } catch (e) {
            res.json(error(e.message));
        }
    });

    router.post('/update', async (req, res) => {
        try {
            const {
                id, instance_id, instance_name, project, project_name, index_code, index_id,
                threshold, time_frame, enabled, instance_status,
                ...rules
            } = req.body;

            const data = {
                id, instance_id, instance_name,
                project: project || project_name,
                index_code: index_code || index_id,
                threshold, time_frame,
                enabled: enabled !== undefined ? enabled : (instance_status !== undefined ? (instance_status === 1) : true),
                rules
            };

            // 兼容只更新部分字段的旧调用方；运行时仍会为已有 L1 规则执行最低阈值保护。
            validateRules({ threshold, rules, defaultLevel: 'L2' });
            await instanceModel.update(data);
            res.json(success(null));
        } catch (e) {
            res.json(error(e.message));
        }
    });

    router.post('/delete', async (req, res) => {
        try {
            const instance_id = req.body.instance_id || req.query.instance_id || req.body.id || req.query.id;
            if (!instance_id) throw new Error('Missing instance_id');

            const deleted = await instanceModel.delete(instance_id);
            if (!deleted) {
                return res.json(error('删除失败：实例不存在或已被删除'));
            }
            res.json(success(null));
        } catch (e) {
            res.json(error(e.message));
        }
    });

    router.post('/query/page', async (req, res) => {
        try {
            const params = {
                page: parseInt(req.body.page) || 1,
                per: parseInt(req.body.per) || 20,
                instance_name: req.body.instance_name,
                instance_id: req.body.instance_id,
                project: req.body.project,
                appkey: req.body.appkey,
                customer_name: req.body.customer_name
            };

            const result = await instanceModel.findList(params);
            res.json(success(result));
        } catch (e) {
            res.json(error(e.message));
        }
    });

    return router;
};
