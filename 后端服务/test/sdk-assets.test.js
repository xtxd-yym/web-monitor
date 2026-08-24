const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SDK_PUBLIC_PATHS,
    setSdkAssetHeaders
} = require('../src/services/sdkAssets');

function createResponseHeaders() {
    const headers = {};
    return {
        headers,
        response: {
            setHeader(name, value) {
                headers[name] = value;
            }
        }
    };
}

test('共享 SDK 同时暴露后端直连和现有 API 网关路径', () => {
    assert.deepEqual(SDK_PUBLIC_PATHS, [
        '/monitor-sdk',
        '/api/monitor-sdk'
    ]);
});

test('Loader 和 Manifest 不使用长期缓存', () => {
    for (const filePath of ['monitor-loader.js', 'sdk-manifest.json']) {
        const { headers, response } = createResponseHeaders();
        setSdkAssetHeaders(response, filePath);

        assert.equal(headers['X-Content-Type-Options'], 'nosniff');
        assert.equal(headers['Cache-Control'], 'no-cache');
    }
});

test('版本化 SDK 使用不可变长期缓存', () => {
    const { headers, response } = createResponseHeaders();
    setSdkAssetHeaders(response, '1.1.0/monitor.min.js');

    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Cache-Control'], 'public, max-age=31536000, immutable');
});
