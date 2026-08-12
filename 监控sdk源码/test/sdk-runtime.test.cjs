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

test('WebMonitor 将管理端去重秒数转换为毫秒', async () => {
  const coreModule = await loadModule(path.join(__dirname, '..', 'src/core/modules/core.js'));
  const WebMonitor = coreModule.namespace.default;

  assert.equal(new WebMonitor({ dedupeWindow: 300 }).options.deduplicationWindow, 300000);
  assert.equal(new WebMonitor({ dedupeWindow: 0 }).options.deduplicationWindow, 0);
  assert.equal(
    new WebMonitor({ dedupeWindow: 300, deduplicationWindow: 1500 }).options.deduplicationWindow,
    1500
  );
});

test('enabled=false 是成功关闭指令，不再回退为开启配置', async () => {
  const sdkModule = await loadModule(path.join(__dirname, '..', 'src/core/monitor_sdk.js'));
  const DynamicWebMonitor = sdkModule.namespace.DynamicWebMonitor;
  const monitor = new DynamicWebMonitor({ apiParams: { appKey: 'disabled-app' } });
  monitor.getConfig = async () => ({ enabled: false });

  assert.equal(monitor.validateConfig({ enabled: false }), true);
  assert.equal(await monitor.init(), true);
  assert.equal(monitor.isClosed, true);
  assert.equal(monitor.monitor, null);
  assert.equal(DynamicWebMonitor.version, 'development');
});

test('实际捕获链路遵守零采样率和类型开关', async t => {
  const sdkModule = await loadModule(path.join(__dirname, '..', 'src/core/monitor_sdk.js'));
  const WebMonitor = sdkModule.namespace.default;
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  t.after(() => {
    Math.random = originalRandom;
  });

  const createMonitor = options => {
    const monitor = new WebMonitor({
      enableSanitization: false,
      autoReportThreshold: 100,
      getUserIdFunction: () => 'mock-user',
      ...options
    });
    monitor.rateLimiter = { tryAcquire: () => true };
    monitor.errorDeduplication = {};
    return monitor;
  };

  const zeroSampleMonitor = createMonitor({
    samplingRates: { resource: 0, network: 0 }
  });
  zeroSampleMonitor.captureError({ type: 'resource', message: 'missing image' });
  zeroSampleMonitor.captureError({ type: 'network-xhr-timeout', message: 'timeout' });
  assert.equal(zeroSampleMonitor.errorQueue.length, 0);

  let limiterCalls = 0;
  const disabledMonitor = createMonitor({ enableResourceErrors: false });
  disabledMonitor.rateLimiter = { tryAcquire: () => {
    limiterCalls += 1;
    return true;
  } };
  disabledMonitor.captureError({ type: 'resource', message: 'missing image' });
  assert.equal(disabledMonitor.errorQueue.length, 0);
  assert.equal(limiterCalls, 0);
});
