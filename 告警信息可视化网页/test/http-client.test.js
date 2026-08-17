import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpClient } from '../src/api/http-client.js';

test('GET serializes query parameters and includes credentials', async () => {
    let captured;
    const client = createHttpClient({
        baseURL: '/api',
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return new Response(JSON.stringify({ success: true, data: [] }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    });

    const result = await client.get('/errors/list', {
        params: { page: 2, env: 'prod', ignored: undefined }
    });

    assert.deepEqual(result, { success: true, data: [] });
    assert.equal(captured.url, '/api/errors/list?page=2&env=prod');
    assert.equal(captured.options.method, 'GET');
    assert.equal(captured.options.credentials, 'include');
    assert.equal(captured.options.body, undefined);
});

test('POST serializes plain objects as JSON', async () => {
    let captured;
    const client = createHttpClient({
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return new Response(JSON.stringify({ code: 1 }));
        }
    });

    await client.post('/api/index/query/page', { page: 1 });

    assert.equal(captured.options.headers.get('Content-Type'), 'application/json');
    assert.equal(captured.options.body, JSON.stringify({ page: 1 }));
});

test('FormData lets the browser provide the multipart boundary', async () => {
    let capturedHeaders;
    const client = createHttpClient({
        fetchImpl: async (url, options) => {
            capturedHeaders = options.headers;
            return new Response(JSON.stringify({ success: true }));
        }
    });
    const formData = new FormData();
    formData.append('appkey', 'demo');

    await client.post('/api/sourcemap/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

    assert.equal(capturedHeaders.has('Content-Type'), false);
});

test('HTTP errors preserve Axios-compatible status and request URL fields', async () => {
    const handledErrors = [];
    const client = createHttpClient({
        baseURL: '/api',
        fetchImpl: async () => new Response(JSON.stringify({ msg: 'unauthorized' }), { status: 401 }),
        onError: error => handledErrors.push(error)
    });

    await assert.rejects(
        client.post('/auth/login', { username: 'demo' }),
        error => {
            assert.equal(error.message, 'Request failed with status code 401');
            assert.equal(error.response.status, 401);
            assert.deepEqual(error.response.data, { msg: 'unauthorized' });
            assert.equal(error.config.url, '/auth/login');
            return true;
        }
    );
    assert.equal(handledErrors.length, 1);
});

test('timeout aborts the request with an Axios-compatible error code', async () => {
    const client = createHttpClient({
        timeout: 5,
        fetchImpl: (url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'));
            });
        })
    });

    await assert.rejects(
        client.get('/slow'),
        error => {
            assert.equal(error.code, 'ECONNABORTED');
            assert.equal(error.message, 'timeout of 5ms exceeded');
            return true;
        }
    );
});
