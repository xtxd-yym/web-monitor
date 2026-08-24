const test = require('node:test');
const assert = require('node:assert/strict');

const ErrorModel = require('../src/db/models/error');
const {
    buildAlarmAggregationScope,
    resolveEffectiveThreshold,
    validateAlarmRule
} = require('../src/services/alarmPolicy');

test('L1 有效阈值至少为 2，其他等级保留配置阈值', () => {
    assert.equal(resolveEffectiveThreshold(1, 'L1'), 2);
    assert.equal(resolveEffectiveThreshold(5, 'L1'), 5);
    assert.equal(resolveEffectiveThreshold(1, 'L2'), 1);
    assert.throws(
        () => validateAlarmRule({ threshold: 1, level: 'L1' }),
        /L1 告警阈值不得小于 2/
    );
    assert.doesNotThrow(() => validateAlarmRule({ threshold: 2, level: 'L1' }));
});

test('告警聚合范围包含业务维度和错误指纹', () => {
    assert.deepEqual(buildAlarmAggregationScope({
        project: 'monitor', env: 'production', type: 'javascript', fingerprint: 'fp-1',
        appkey: 'app-a', customer_name: '客户A', service_name: '服务A'
    }), {
        project: 'monitor', env: 'production', type: 'javascript', fingerprint: 'fp-1',
        appkey: 'app-a', customer_name: '客户A', service_name: '服务A'
    });
});

test('MySQL 告警计数使用 JSON 业务维度精确过滤', async () => {
    let captured;
    const model = new ErrorModel({
        type: 'mysql',
        async getAsync(sql, args) {
            captured = { sql, args };
            return { total: 3 };
        }
    });

    const total = await model.count({
        project: 'monitor', env: 'production', type: 'javascript', fingerprint: 'fp-1',
        appkey: 'app-a', customer_name: '客户A', service_name: '服务A',
        startTime: 1000, endTime: 2000
    });

    assert.equal(total, 3);
    assert.match(captured.sql, /JSON_EXTRACT\(extra_data, '\$\.appkey'\)/);
    assert.deepEqual(captured.args.slice(-3), ['app-a', '客户A', '服务A']);
});

test('SQLite 告警计数只累计完全匹配的业务维度', async () => {
    const model = new ErrorModel({
        type: 'sqlite',
        async allAsync() {
            return [
                { occurrence_count: 2, extra_data: JSON.stringify({ appkey: 'app-a', customer_name: '客户A', service_name: '服务A', aggregation_version: 2 }) },
                { occurrence_count: 9, extra_data: JSON.stringify({ appkey: 'app-b', customer_name: '客户A', service_name: '服务A', aggregation_version: 2 }) },
                { occurrence_count: 20, extra_data: JSON.stringify({ appkey: 'app-a', customer_name: '客户A', service_name: '服务A' }) }
            ];
        }
    });

    const total = await model.count({
        project: 'monitor', env: 'production', type: 'javascript', fingerprint: 'fp-1',
        appkey: 'app-a', customer_name: '客户A', service_name: '服务A'
    });
    assert.equal(total, 2);
});
