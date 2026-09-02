const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

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
const createConfigRoutes = require('../src/routes/config');
Module._load = originalModuleLoad;

function createResponse() {
    return {
        statusCode: 200,
        payload: null,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
        },
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

test('配置响应区分 SDK 请求版本和实际配置版本', async () => {
    const configModel = {
        async findOne() {
            return {
                updated_at: 1788339000000,
                config: { config: { samplingRates: { resource: 0, network: 0 } } }
            };
        }
    };
    const appkeyModel = {
        async findByAppkey() {
            return { status: 1 };
        }
    };
    const routes = createConfigRoutes(configModel, appkeyModel);
    const response = createResponse();

    await routes.configHandler({
        query: { appkey: 'enabled-key', customer_name: '客户A', version: '1.2.0' }
    }, response);

    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.payload.meta.requestedSdkVersion, '1.2.0');
    assert.equal(response.payload.meta.configVersion, '1788339000000');
    assert.equal(response.payload.meta.version, '1788339000000');
    assert.equal(response.payload.meta.configMatched, true);
    assert.equal(response.payload.config.samplingRates.resource, 0);
    assert.equal(response.payload.config.samplingRates.network, 0);
});

test('禁用 AppKey 的兼容配置入口返回关闭指令', async () => {
    const routes = createConfigRoutes({
        async findOne() {
            throw new Error('禁用 AppKey 不应查询配置');
        }
    }, {
        async findByAppkey() {
            return { status: 0 };
        }
    });
    const response = createResponse();

    await routes.configHandler({ query: { appkey: 'disabled-key', version: '1.0.0' } }, response);

    assert.equal(response.payload.enabled, false);
    assert.equal(response.payload.appkeyInvalid, true);
    assert.equal(response.payload.emergency.closeMonitor, true);
});
