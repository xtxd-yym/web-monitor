const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const {
    generateFingerprint,
    resolveServerDropReason
} = require('../src/services/reportPolicy');

const originalModuleLoad = Module._load;
Module._load = function mockMissingExpress(request, parent, isMain) {
    if (request === 'express') {
        return {
            Router() {
                return {
                    get() {},
                    post() {},
                    delete() {}
                };
            }
        };
    }
    return originalModuleLoad.call(this, request, parent, isMain);
};
const createErrorRoutes = require('../src/routes/errors');
Module._load = originalModuleLoad;

function createResponse() {
    return {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
}

test('服务端只强制执行关闭开关和零采样率，不对非零比例二次采样', () => {
    const config = {
        enabled: true,
        config: {
            samplingRates: { javascript: 0.1, resource: 0, network: 0 }
        }
    };

    assert.equal(resolveServerDropReason(config, 'resource'), 'sampling_rate_zero');
    assert.equal(resolveServerDropReason(config, 'network-xhr-timeout'), 'sampling_rate_zero');
    assert.equal(resolveServerDropReason(config, 'javascript'), null);
    assert.equal(resolveServerDropReason({ enabled: false }, 'javascript'), 'monitor_disabled');
});

test('资源指纹忽略查询参数，网络指纹仅忽略缓存参数', () => {
    const resourceA = generateFingerprint({
        type: 'resource',
        context: { targetUrl: 'https://s.thsi.cn/js/chameleon/time.1.js?_abfpc=1' }
    });
    const resourceB = generateFingerprint({
        type: 'resource',
        context: { targetUrl: 'https://s.thsi.cn/js/chameleon/time.1.js?_abfpc=2' }
    });
    assert.equal(resourceA, resourceB);

    const networkA = generateFingerprint({
        type: 'network-xhr-error',
        context: { targetUrl: 'https://api.example.com/orders?id=1&_abfpc=a', method: 'GET' }
    });
    const networkB = generateFingerprint({
        type: 'network-xhr-error',
        context: { targetUrl: 'https://api.example.com/orders?id=1&_abfpc=b', method: 'GET' }
    });
    const networkOtherOrder = generateFingerprint({
        type: 'network-xhr-error',
        context: { targetUrl: 'https://api.example.com/orders?id=2&_abfpc=b', method: 'GET' }
    });
    assert.equal(networkA, networkB);
    assert.notEqual(networkA, networkOtherOrder);
});

test('禁用 AppKey 时新旧格式上报都在统一处理器中拒绝', async () => {
    let inserted = false;
    const routes = createErrorRoutes(
        { async insert() { inserted = true; } },
        null,
        { async matchRules() { return []; } },
        null,
        null,
        { async findByAppkey() { return { status: 0 }; } },
        null
    );

    for (const body of [
        { appkey: 'disabled-app', type: 'resource', message: 'legacy' },
        { appkey: 'disabled-app', list: [{ type: 'resource', message: 'current' }] }
    ]) {
        const res = createResponse();
        await routes.reportHandler({ body }, res);
        assert.equal(res.statusCode, 403);
    }
    assert.equal(inserted, false);
});

test('旧 SDK 的 resource/network 零采样在落库和告警前由服务端丢弃', async () => {
    let inserted = false;
    let matchedRules = false;
    let configScope;
    const routes = createErrorRoutes(
        { async insert() { inserted = true; } },
        null,
        { async matchRules() { matchedRules = true; return []; } },
        null,
        null,
        {
            async findByAppkey() {
                return { status: 1, customer_name: '兴业证券', service_name: '涨停聚焦2.0' };
            }
        },
        {
            async findOne(appkey, customerName) {
                configScope = { appkey, customerName };
                return {
                    updated_at: 123,
                    config: {
                        enabled: true,
                        config: { samplingRates: { resource: 0, network: 0 } }
                    }
                };
            }
        }
    );

    const res = createResponse();
    await routes.reportHandler({
        body: {
            appkey: 'legacy-app',
            type: 'resource',
            message: 'Resource load failed: https://example.com/a.js?t=1'
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data, [{
        status: 'dropped',
        reason: 'sampling_rate_zero',
        type: 'resource'
    }]);
    assert.equal(inserted, false);
    assert.equal(matchedRules, false);
    assert.deepEqual(configScope, { appkey: 'legacy-app', customerName: '兴业证券' });
});

test('上报落库保存 SDK、配置和运行实例信息', async () => {
    let insertedData;
    const routes = createErrorRoutes(
        {
            async insert(data) {
                insertedData = data;
                return { id: 9, updated: false, occurrence_count: 1 };
            }
        },
        null,
        { async matchRules() { return []; } },
        null,
        null,
        {
            async findByAppkey() {
                return { status: 1, customer_name: '客户A', service_name: '服务A' };
            }
        },
        {
            async findOne() {
                return { updated_at: 456, config: { enabled: true, config: {} } };
            }
        }
    );

    const res = createResponse();
    await routes.reportHandler({
        body: {
            appkey: 'app-a',
            sdkVersion: '1.2.0',
            runtimeId: 'runtime-a',
            configVersion: '456',
            list: [{ type: 'javascript', message: 'boom', timestamp: 1 }]
        }
    }, res);

    const extraData = JSON.parse(insertedData.extra_data);
    assert.equal(extraData.sdkVersion, '1.2.0');
    assert.equal(extraData.runtimeId, 'runtime-a');
    assert.equal(extraData.configVersion, '456');
    assert.equal(extraData.configMatched, true);
    assert.equal(insertedData.customer_name, '客户A');
    assert.equal(insertedData.service_name, '服务A');
});
