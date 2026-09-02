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

test('动态配置变为关闭时清理运行中的监听实例', async () => {
  const sdkModule = await loadModule(path.join(__dirname, '..', 'src/core/monitor_sdk.js'));
  const DynamicWebMonitor = sdkModule.namespace.DynamicWebMonitor;
  const monitor = new DynamicWebMonitor({ apiParams: { appKey: 'app-refresh' } });
  let cleaned = false;
  monitor.monitor = {
    cleanup() {
      cleaned = true;
    }
  };

  const changed = await monitor.applyDynamicConfig({
    enabled: false,
    emergency: { closeMonitor: true },
    meta: { configVersion: '2' }
  });

  assert.equal(changed, true);
  assert.equal(cleaned, true);
  assert.equal(monitor.monitor, null);
  assert.equal(monitor.isClosed, true);
});

test('配置刷新失败时使用过期的最后成功配置而不是开启网络噪声默认值', async t => {
  const sdkModule = await loadModule(path.join(__dirname, '..', 'src/core/monitor_sdk.js'));
  const DynamicWebMonitor = sdkModule.namespace.DynamicWebMonitor;
  const originalLocalStorage = global.localStorage;
  const staleConfig = {
    enabled: true,
    config: { samplingRates: { resource: 0, network: 0 } },
    meta: { ttl: 1, configVersion: 'old' }
  };
  global.localStorage = {
    getItem: () => JSON.stringify({ data: staleConfig, timestamp: 0 }),
    setItem: () => {},
    removeItem: () => {}
  };
  t.after(() => {
    global.localStorage = originalLocalStorage;
  });

  const monitor = new DynamicWebMonitor({
    configUrl: 'https://monitor.example.com/api/config',
    apiParams: { appKey: 'app-stale' }
  });
  monitor.fetchConfigWithRetry = async () => {
    throw new Error('offline');
  };

  const config = await monitor.getConfig(true);
  assert.deepEqual(config, staleConfig);
});

test('同一配置范围的重复 SDK 初始化复用唯一运行实例', async t => {
  const sdkModule = await loadModule(path.join(__dirname, '..', 'src/core/monitor_sdk.js'));
  const DynamicWebMonitor = sdkModule.namespace.DynamicWebMonitor;
  const originalWindow = global.window;
  global.window = {};
  t.after(() => {
    global.window = originalWindow;
  });

  const options = {
    project: 'monitor',
    env: 'production',
    apiParams: { appKey: 'app-singleton', customer_name: '客户A' }
  };
  const first = new DynamicWebMonitor({ ...options, apiParams: { ...options.apiParams } });
  const second = new DynamicWebMonitor({ ...options, apiParams: { ...options.apiParams } });

  assert.equal(first.claimRuntime(), null);
  assert.equal(second.claimRuntime(), first);
  assert.equal(second.delegate, first);
  first.closeMonitor();
});

test('白屏必须连续确认两次，恢复后记录持续时间并允许新事件', async () => {
  const whiteScreenModule = await loadModule(
    path.join(__dirname, '..', 'src/core/modules/white-screen-monitor.js')
  );
  const { createWhiteScreenStateTracker } = whiteScreenModule.namespace;
  const tracker = createWhiteScreenStateTracker(2, 200);

  assert.equal(tracker.observe(true, 1000).status, 'suspected');
  assert.equal(tracker.observe(true, 1100).status, 'suspected');
  const confirmed = tracker.observe(true, 1300);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.shouldReport, true);

  assert.equal(tracker.observe(true, 2000).status, 'ongoing');
  const recovered = tracker.observe(false, 2500);
  assert.equal(recovered.status, 'recovered');
  assert.equal(recovered.duration, 1500);

  const nextIncident = tracker.observe(true, 3000);
  assert.equal(nextIncident.status, 'suspected');
  assert.notEqual(nextIncident.incidentId, confirmed.incidentId);
});

test('白屏关联错误保留已脱敏的近期 JS、资源和网络摘要', async () => {
  const errorModule = await loadModule(
    path.join(__dirname, '..', 'src/core/modules/error-monitor.js')
  );
  const { rememberRecentError } = errorModule.namespace;
  const diagnosticsModule = await loadModule(
    path.join(__dirname, '..', 'src/core/modules/diagnostics.js')
  );
  const { getRecentRelatedErrors } = diagnosticsModule.namespace;
  const monitor = {
    options: { enableSanitization: true, whiteScreenRelatedErrorWindow: 30000 },
    recentErrors: []
  };

  rememberRecentError(monitor, {
    type: 'javascript',
    message: 'boom',
    filename: 'https://example.com/app.js?token=secret',
    url: 'https://example.com/page?token=secret',
    timestamp: 1000
  }, 1000);
  rememberRecentError(monitor, { type: 'custom', message: 'ignore', timestamp: 1500 }, 1500);

  const related = getRecentRelatedErrors(monitor, 500, 2000);
  assert.equal(related.length, 1);
  assert.equal(related[0].type, 'javascript');
  assert.match(related[0].url, /token=\*\*\*/);
});

test('白屏上报携带诊断证据和最近面包屑，恢复事件记录持续时间', async t => {
  const whiteScreenModule = await loadModule(
    path.join(__dirname, '..', 'src/core/modules/white-screen-monitor.js')
  );
  const { reportWhiteScreenError, reportWhiteScreenRecovery } = whiteScreenModule.namespace;
  const originalWindow = global.window;
  global.window = {
    location: {
      href: 'https://example.com/dashboard',
      hostname: 'example.com',
      protocol: 'https:'
    }
  };
  t.after(() => {
    global.window = originalWindow;
  });

  const reports = [];
  const monitor = {
    options: {
      env: 'production',
      project: 'monitor',
      apiParams: { appKey: 'app-a', customer_name: '客户A', service_name: '服务A' },
      monitorReport: async report => {
        reports.push(report);
        return { ok: true };
      }
    },
    userActions: [{ type: 'click', element: 'BUTTON', timestamp: 900, url: 'https://example.com/dashboard' }],
    getUserId: () => 'user-a'
  };
  const evidence = {
    sampling: { emptyRatio: 1, points: [] },
    rootContainer: { hasMainContainer: false },
    relatedErrors: [{ type: 'javascript', message: 'boom', timestamp: 950 }]
  };

  await reportWhiteScreenError(monitor, {
    message: 'White screen detected after 2 confirmations',
    timestamp: 1000,
    evidence
  });
  await reportWhiteScreenRecovery(monitor, {
    incidentId: 'white-screen-500',
    suspectedAt: 500,
    recoveredAt: 2500,
    duration: 2000
  }, { isWhite: false });

  assert.equal(reports[0].list[0].type, 'white_screen');
  assert.deepEqual(reports[0].list[0].expand, evidence);
  assert.equal(reports[0].list[0].breadcrumbs.length, 1);
  assert.equal(reports[0].list[0].userId, 'user-a');
  assert.equal(reports[1].list[0].type, 'white_screen_recovery');
  assert.equal(reports[1].list[0].expand.duration, 2000);
});
