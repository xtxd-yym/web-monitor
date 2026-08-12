const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fileURLToPath, pathToFileURL } = require('node:url');

const moduleCache = new Map();

async function loadModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath);
  }

  const module = new vm.SourceTextModule(fs.readFileSync(absolutePath, 'utf8'), {
    identifier: pathToFileURL(absolutePath).href
  });
  moduleCache.set(absolutePath, module);

  await module.link((specifier, referencingModule) => {
    const referencingPath = fileURLToPath(referencingModule.identifier);
    return loadModule(path.resolve(path.dirname(referencingPath), specifier));
  });
  await module.evaluate();
  return module;
}

async function importSource(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(dataUrl);
}

test('0 采样率不会回退为 100%', async () => {
  const { resolveSamplingRate } = await importSource('src/core/config-utils.js');

  assert.equal(resolveSamplingRate({ resource: 0 }, 'resource', 1), 0);
  assert.equal(resolveSamplingRate({ javascript: 0 }, 'javascript', 1), 0);
});

test('network 通用采样率覆盖所有网络子类型，精确配置可单独覆盖', async () => {
  const { resolveSamplingRate } = await importSource('src/core/config-utils.js');
  const networkTypes = [
    'network-error',
    'network-xhr',
    'network-xhr-error',
    'network-xhr-timeout',
    'network-xhr-abort',
    'network-fetch'
  ];

  networkTypes.forEach(type => {
    assert.equal(resolveSamplingRate({ network: 0 }, type, 1), 0);
  });
  assert.equal(
    resolveSamplingRate({ network: 0, 'network-xhr-timeout': 0.5 }, 'network-xhr-timeout', 1),
    0.5
  );
});

test('资源、Promise、XHR、Fetch 独立开关生效', async () => {
  const { isErrorTypeEnabled } = await importSource('src/core/config-utils.js');

  assert.equal(isErrorTypeEnabled({ enableResourceErrors: false }, 'resource'), false);
  assert.equal(isErrorTypeEnabled({ enablePromiseRejection: false }, 'promise'), false);
  assert.equal(
    isErrorTypeEnabled({ enableNetworkMonitoring: true, enableXHRMonitoring: false }, 'network-xhr-error'),
    false
  );
  assert.equal(
    isErrorTypeEnabled({ enableNetworkMonitoring: true, enableFetchMonitoring: false }, 'network-fetch'),
    false
  );
  assert.equal(
    isErrorTypeEnabled({ enableNetworkMonitoring: false, enableXHRMonitoring: true }, 'network-xhr-timeout'),
    false
  );
});

test('dedupeWindow 按秒转换并保留显式零值', async () => {
  const { resolveDeduplicationWindow } = await importSource('src/core/config-utils.js');

  assert.equal(resolveDeduplicationWindow({ dedupeWindow: 300 }), 300000);
  assert.equal(resolveDeduplicationWindow({ dedupeWindow: 0 }), 0);
  assert.equal(resolveDeduplicationWindow({ deduplicationWindow: 1500, dedupeWindow: 300 }), 1500);
});

test('配置缓存按 AppKey、客户、项目和环境隔离', async () => {
  const { createConfigCacheKey } = await importSource('src/core/config-utils.js');
  const base = {
    project: 'monitor',
    env: 'production',
    apiParams: { appKey: 'app-a', customer_name: '兴业证券' }
  };

  assert.notEqual(
    createConfigCacheKey(base),
    createConfigCacheKey({ ...base, apiParams: { ...base.apiParams, appKey: 'app-b' } })
  );
  assert.notEqual(
    createConfigCacheKey(base),
    createConfigCacheKey({ ...base, apiParams: { ...base.apiParams, customer_name: '其他客户' } })
  );
});

test('资源和网络 URL 支持字符串及正则精准忽略', async () => {
  const { isUrlIgnored } = await importSource('src/core/config-utils.js');

  assert.equal(isUrlIgnored('https://example.com/static/noise.png', ['/static/noise.png']), true);
  assert.equal(isUrlIgnored('https://example.com/api/orders', ['/static/noise.png']), false);
  assert.equal(isUrlIgnored('https://example.com/api/health?id=1', [/\/api\/health(?:\?|$)/]), true);
  assert.equal(isUrlIgnored('https://example.com/api/orders', []), false);
});

test('网络拦截只安装已开启的 XHR 或 Fetch 部分', async t => {
  const networkModule = await loadModule(
    path.join(__dirname, '..', 'src/core/modules/network-monitor.js')
  );
  const { setupNetworkMonitoring } = networkModule.namespace;
  const originalWindow = global.window;
  const originalXMLHttpRequest = global.XMLHttpRequest;

  class MockXMLHttpRequest {
    addEventListener() {}
  }
  const originalOpen = function () {};
  const originalSend = function () {};
  const originalFetch = async function () {
    return { ok: true, status: 200 };
  };
  MockXMLHttpRequest.prototype.open = originalOpen;
  MockXMLHttpRequest.prototype.send = originalSend;
  global.XMLHttpRequest = MockXMLHttpRequest;
  global.window = { fetch: originalFetch, location: { href: '', origin: '' } };

  t.after(() => {
    global.window = originalWindow;
    global.XMLHttpRequest = originalXMLHttpRequest;
  });

  setupNetworkMonitoring({
    options: { enableXHRMonitoring: false, enableFetchMonitoring: true },
    captureError() {}
  });
  assert.equal(MockXMLHttpRequest.prototype.open, originalOpen);
  assert.equal(MockXMLHttpRequest.prototype.send, originalSend);
  assert.notEqual(global.window.fetch, originalFetch);

  global.window.fetch = originalFetch;
  setupNetworkMonitoring({
    options: { enableXHRMonitoring: true, enableFetchMonitoring: false },
    captureError() {}
  });
  assert.notEqual(MockXMLHttpRequest.prototype.open, originalOpen);
  assert.notEqual(MockXMLHttpRequest.prototype.send, originalSend);
  assert.equal(global.window.fetch, originalFetch);
});
