const test = require('node:test');
const assert = require('node:assert/strict');

const { VanishService } = require('../src/services/vanish');

test('sendText 只在扶摇和下游业务状态都成功时返回 true', async () => {
    let capturedRequest;
    const service = new VanishService({
        enabled: true,
        url: 'https://example.test/fuyao/send_alert',
        ak: 'test-only-ak',
        timeoutMs: 1000,
        fetchImpl: async (url, options) => {
            capturedRequest = { url, options };
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    status_code: 0,
                    succeed: true,
                    data: { downstreamStatus: '0' }
                })
            };
        }
    });

    const sent = await service.sendText({
        recipients: 'Owner@myhexin.com, owner@myhexin.com',
        content: '测试消息',
        kind: 'test'
    });

    assert.equal(sent, true);
    assert.equal(capturedRequest.url, 'https://example.test/fuyao/send_alert');
    assert.equal(capturedRequest.options.headers['X-Vanish-AK'], 'test-only-ak');
    const body = JSON.parse(capturedRequest.options.body);
    assert.deepEqual(body.target, { type: 'email', emails: ['owner@myhexin.com'] });
    assert.match(body.requestId, /^cloud-monitor-test-/);
    assert.equal(body.message.content, '测试消息');
});

test('sendText 不把 HTTP 200 当作业务成功', async () => {
    const service = new VanishService({
        enabled: true,
        url: 'https://example.test/fuyao/send_alert',
        ak: 'test-only-ak',
        timeoutMs: 1000,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ status_code: -2, succeed: false, data: { downstreamStatus: '5101' } })
        })
    });

    const sent = await service.sendText({
        recipients: ['owner@myhexin.com'],
        content: '测试消息'
    });

    assert.equal(sent, false);
});

test('未配置 URL/AK 时跳过外部调用', async () => {
    let called = false;
    const service = new VanishService({
        enabled: true,
        url: '',
        ak: '',
        fetchImpl: async () => {
            called = true;
        }
    });

    const sent = await service.sendText({
        recipients: ['owner@myhexin.com'],
        content: '测试消息'
    });

    assert.equal(sent, false);
    assert.equal(called, false);
});

test('拒绝非 myhexin.com 的 Vanish 收件账号', () => {
    const service = new VanishService({ enabled: true, url: 'https://example.test', ak: 'test-only-ak' });
    assert.throws(
        () => service.validateRecipients('external@example.com'),
        /@myhexin\.com/
    );
});

test('告警消息包含排障摘要但不发送完整堆栈', async () => {
    let body;
    const service = new VanishService({
        enabled: true,
        url: 'https://example.test/fuyao/send_alert',
        ak: 'test-only-ak',
        timeoutMs: 1000,
        fetchImpl: async (_url, options) => {
            body = JSON.parse(options.body);
            return {
                ok: true,
                status: 200,
                json: async () => ({ status_code: 0, succeed: true, data: { downstreamStatus: 0 } })
            };
        }
    });

    const sent = await service.sendAlarm('owner@myhexin.com', {
        level: 'L1',
        instance_name: 'JS 错误突增',
        message: '60秒内发生 10 次',
        project: 'monitor-web',
        env: 'production',
        service_name: 'dashboard',
        customer_name: '内部测试',
        error_message: 'Cannot read properties of undefined',
        error_stack: 'SECRET_STACK_SHOULD_NOT_BE_SENT'
    });

    assert.equal(sent, true);
    assert.match(body.message.content, /JS 错误突增/);
    assert.match(body.message.content, /Cannot read properties/);
    assert.doesNotMatch(body.message.content, /SECRET_STACK_SHOULD_NOT_BE_SENT/);
});
