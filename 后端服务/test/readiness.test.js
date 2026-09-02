const test = require('node:test');
const assert = require('node:assert/strict');

const { readinessHandler } = require('../src/services/readiness');

test('readiness 探针不依赖鉴权或外部服务并返回 200', () => {
    const response = {
        statusCode: null,
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

    const result = readinessHandler({}, response);

    assert.equal(result, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, { status: 'ready' });
});
