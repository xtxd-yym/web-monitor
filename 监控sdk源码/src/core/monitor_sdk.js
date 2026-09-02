/**
 * WebMonitor SDK 入口文件
 * 整合所有模块并提供统一的导出接口，支持动态配置
 */

// 导入核心模块
import WebMonitor from './modules/core.js';

// 导入各功能模块
import { setupErrorCapture, captureError, reportErrors } from './modules/error-monitor.js';
import { setupPerformanceCapture, reportPerformanceData } from './modules/performance-monitor.js';
import { setupNetworkMonitoring } from './modules/network-monitor.js';
import { setupUserTracking } from './modules/user-tracking.js';
import { setupWhiteScreenDetection, reportWhiteScreenError } from './modules/white-screen-monitor.js';
import { createConfigCacheKey } from './config-utils.js';

const SDK_VERSION = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : 'development';

// 动态配置类
class DynamicWebMonitor {
  constructor(options = {}) {
    // 确保apiParams存在
    if (!options.apiParams) {
      options.apiParams = {};
    }

    this.options = options;
    this.monitor = null;
    this.configCache = null;
    this.cacheKey = createConfigCacheKey(options);
    this.isClosed = false;
    this.isDisposed = false;
    this.refreshTimer = null;
    this.activeConfigSignature = '';
    this.activeConfig = null;
    this.delegate = null;
    this.runtimeId = `wm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.fetchImpl = options.fetchImpl || (
      typeof window !== 'undefined' && typeof window.fetch === 'function'
        ? window.fetch.bind(window)
        : (typeof fetch === 'function' ? fetch : null)
    );
  }

  // 静态变量：全局请求去重
  static pendingConfigRequests = new Map();

  getRuntimeRegistry() {
    if (typeof window === 'undefined') return null;
    const registryKey = Symbol.for('web-monitor.runtime-registry');
    if (!window[registryKey]) {
      window[registryKey] = new Map();
    }
    return window[registryKey];
  }

  claimRuntime() {
    const registry = this.getRuntimeRegistry();
    if (!registry) return null;

    const existing = registry.get(this.cacheKey);
    if (existing && existing !== this && !existing.isDisposed) {
      this.delegate = existing;
      console.warn(
        `[Monitor] Duplicate runtime ignored for ${this.cacheKey}; using ${existing.runtimeId}`
      );
      return existing;
    }

    registry.set(this.cacheKey, this);
    return null;
  }

  // 配置校验
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      console.warn('[Config] Invalid config: not an object');
      return false;
    }

    if (typeof config.enabled !== 'boolean') {
      console.warn('[Config] Invalid config: missing enabled field');
      return false;
    }

    // enabled=false / emergency.closeMonitor 是完整的关闭指令，不要求携带 config。
    if (config.enabled === false || config.emergency?.closeMonitor) {
      return true;
    }

    if (!config.config || typeof config.config !== 'object') {
      console.warn('[Config] Invalid config: missing config object');
      return false;
    }

    return true;
  }

  // 灰度判断
  shouldEnableMonitoring(config) {
    // 1. 总开关检查
    if (!config.enabled) {
      console.log('[Config] Monitoring disabled by config.enabled');
      return false;
    }

    // 2. 紧急关闭检查
    if (config.emergency?.closeMonitor) {
      console.warn('[Config] Monitor emergency closed:', config.emergency.reason || 'No reason provided');
      return false;
    }

    // 3. 灰度控制检查
    if (!config.grayControl || !config.grayControl.enabled) {
      return true; // 灰度未启用，全量开启
    }

    const { strategy, percentage, userIdList, customerList } = config.grayControl;
    const context = {
      userId: this.options.userId,
      customer_name: this.options.apiParams?.customer_name
    };

    console.log('[Config] Gray control enabled, strategy:', strategy);

    switch (strategy) {
      case 'percentage':
        // 百分比灰度
        const hash = this.simpleHash(context.userId || Date.now().toString());
        const isHit = (hash % 100) < (percentage || 0);
        console.log(`[Config] Percentage gray (${percentage}%): ${isHit ? 'HIT' : 'MISS'}`);
        return isHit;

      case 'userId':
        // 用户ID白名单
        const userHit = userIdList?.includes(context.userId);
        console.log(`[Config] UserId gray: ${userHit ? 'HIT' : 'MISS'}`);
        return userHit || false;

      case 'customer':
        // 客户白名单
        const customerHit = customerList?.includes(context.customer_name);
        console.log(`[Config] Customer gray: ${customerHit ? 'HIT' : 'MISS'}`);
        return customerHit || false;

      default:
        console.warn('[Config] Unknown gray strategy:', strategy);
        return true;
    }
  }

  // 简单hash函数（用于灰度）
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // 带超时和重试的请求
  async fetchConfigWithRetry(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

        if (!this.fetchImpl) {
          throw new Error('Fetch API is not available');
        }

        const response = await this.fetchImpl(url, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.warn(`[Config] Fetch attempt ${i + 1}/${retries + 1} failed:`, error.message);

        if (i === retries) {
          throw error; // 最后一次重试失败
        }

        // 指数退避：1秒、2秒
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  // 获取降级配置
  getFallbackConfig() {
    console.log('[Config] Using fallback config');
    return {
      enabled: true,
      config: {
        enablePerformanceMonitoring: false,
        enableWhiteScreenDetection: true,
        whiteScreenConfirmations: 2,
        whiteScreenConfirmationDelay: 1000,
        whiteScreenRecoveryInterval: 2000,
        whiteScreenRelatedErrorWindow: 30000,
        whiteScreenRootSelectors: ['#app', '#root', '[id^="app"]', '.app', '.container', 'main'],
        enableErrorMonitoring: true,
        enableNetworkMonitoring: true,
        enableResourceErrors: false,
        reportResourceErrors: false,
        enableXHRMonitoring: false,
        enableFetchMonitoring: false,
        enablePromiseRejection: true,
        enableUserTracking: false,
        samplingRates: {
          javascript: 1.0,
          promise: 1.0,
          resource: 0,
          network: 0
        },
        ignoreResourceUrls: [],
        ignoreNetworkUrls: [],
        maxErrorsPerMinute: 100,
        dedupeWindow: 300,
        logLevel: 'warn'
      },
      emergency: {
        closeMonitor: false
      },
      meta: {
        version: 'fallback',
        configVersion: 'fallback',
        configMatched: false,
        updatedAt: Date.now(),
        ttl: 300
      }
    };
  }

  // 获取配置（优化版）
  async getConfig(forceRefresh = false) {
    const { configUrl, project, env, cache = true } = this.options;

    if (!configUrl) {
      console.warn('[Config] configUrl not provided, using fallback');
      return this.getFallbackConfig();
    }

    let cachedEntry = null;
    if (cache) {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          cachedEntry = parsed;
          const ttl = (parsed.data.meta?.ttl || 300) * 1000; // 动态TTL

          if (!forceRefresh && Date.now() - parsed.timestamp < ttl) {
            console.log(`[Config] Using cached config (TTL: ${ttl / 1000}s)`);
            this.configCache = parsed.data;
            return this.configCache;
          } else {
            console.log('[Config] Cache expired');
          }
        } catch (e) {
          console.warn('[Config] Cache parse failed:', e);
        }
      }
    }

    // ===== 优化2: 请求去重 =====
    const pendingRequest = DynamicWebMonitor.pendingConfigRequests.get(this.cacheKey);
    if (pendingRequest) {
      console.log('[Config] Reusing pending request');
      return await pendingRequest;
    }

    // 发起新请求
    console.log('[Config] Fetching from server...');
    const configRequest = Promise.resolve().then(async () => {
      try {
        const params = new URLSearchParams({
          project: project || 'default',
          env: env || 'production',
          customer_name: this.options.apiParams?.customer_name || '',
          appkey: this.options.apiParams?.appKey || this.options.apiParams?.appkey || '',
          version: SDK_VERSION,
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
        });

        // ===== 优化7: 超时和重试 =====
        const config = await this.fetchConfigWithRetry(`${configUrl}?${params}`);

        // ===== 优化3: 配置校验 =====
        if (!this.validateConfig(config)) {
          console.warn('[Config] Validation failed, using fallback');
          return this.getFallbackConfig();
        }

        // 存入缓存
        if (cache) {
          localStorage.setItem(this.cacheKey, JSON.stringify({
            data: config,
            timestamp: Date.now()
          }));
          this.configCache = config;
        }

        console.log('[Config] Config loaded successfully');
        return config;
      } catch (error) {
        console.error('[Config] Failed to fetch config:', error);
        if (cachedEntry?.data && this.validateConfig(cachedEntry.data)) {
          console.warn('[Config] Using stale last-known-good config');
          this.configCache = cachedEntry.data;
          return cachedEntry.data;
        }
        if (this.configCache && this.validateConfig(this.configCache)) {
          console.warn('[Config] Using in-memory last-known-good config');
          return this.configCache;
        }
        return this.getFallbackConfig();
      } finally {
        if (DynamicWebMonitor.pendingConfigRequests.get(this.cacheKey) === configRequest) {
          DynamicWebMonitor.pendingConfigRequests.delete(this.cacheKey);
        }
      }
    });

    DynamicWebMonitor.pendingConfigRequests.set(this.cacheKey, configRequest);
    return await configRequest;
  }

  // 初始化监控
  async init() {
    const existing = this.claimRuntime();
    if (existing) {
      return existing.initPromise || true;
    }

    this.initPromise = this.initializeRuntime();
    return await this.initPromise;
  }

  async initializeRuntime() {
    try {
      let dynamicConfig = await this.getConfig();

      if (!this.validateConfig(dynamicConfig)) {
        console.warn('Invalid config format, using conservative fallback defaults');
        dynamicConfig = this.getFallbackConfig();
      }

      await this.applyDynamicConfig(dynamicConfig);
      this.scheduleConfigRefresh(dynamicConfig);
      return true;
    } catch (error) {
      console.error('Failed to initialize dynamic monitor, using conservative fallback defaults:', error);
      try {
        const fallback = this.getFallbackConfig();
        await this.applyDynamicConfig(fallback);
        this.scheduleConfigRefresh(fallback);
        return true;
      } catch (fallbackError) {
        console.error('Failed to initialize with fallback config:', fallbackError);
        return false;
      }
    }
  }

  buildConfigSignature(config) {
    return JSON.stringify({
      enabled: config.enabled,
      config: config.config,
      grayControl: config.grayControl,
      emergency: config.emergency,
      configVersion: config.meta?.configVersion || config.meta?.version || ''
    });
  }

  async applyDynamicConfig(dynamicConfig) {
    const signature = this.buildConfigSignature(dynamicConfig);
    if (signature === this.activeConfigSignature) return false;

    if (this.monitor?.cleanup) {
      this.monitor.cleanup();
    }
    this.monitor = null;
    this.activeConfig = dynamicConfig;
    this.activeConfigSignature = signature;

    if (!dynamicConfig.enabled || dynamicConfig.emergency?.closeMonitor || !this.shouldEnableMonitoring(dynamicConfig)) {
      console.log('Monitoring disabled by dynamic configuration');
      this.isClosed = true;
      return true;
    }

    const finalConfig = {
      ...this.options,
      ...dynamicConfig.config,
      runtimeId: this.runtimeId,
      configVersion: dynamicConfig.meta?.configVersion || dynamicConfig.meta?.version || '',
      configMatched: dynamicConfig.meta?.configMatched === true,
      refreshConfig: () => this.refreshConfig()
    };

    this.monitor = new WebMonitor(finalConfig);
    await this.monitor.init();
    this.isClosed = false;
    return true;
  }

  scheduleConfigRefresh(config = this.activeConfig) {
    if (!this.options.configUrl || this.isDisposed) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);

    const configuredInterval = Number(this.options.configRefreshIntervalMs);
    const ttlMs = Number(config?.meta?.ttl || 300) * 1000;
    const baseInterval = Number.isFinite(configuredInterval) && configuredInterval > 0
      ? configuredInterval
      : Math.max(30000, ttlMs);
    const jitter = Math.floor(baseInterval * Math.random() * 0.1);

    this.refreshTimer = setTimeout(() => {
      this.refreshConfig().catch(error => {
        console.error('[Config] Scheduled refresh failed:', error);
      });
    }, baseInterval + jitter);
    if (typeof this.refreshTimer.unref === 'function') this.refreshTimer.unref();
  }

  async refreshConfig() {
    if (this.delegate) return this.delegate.refreshConfig();
    if (this.isDisposed) return false;

    const dynamicConfig = await this.getConfig(true);
    if (!this.validateConfig(dynamicConfig)) return false;
    const changed = await this.applyDynamicConfig(dynamicConfig);
    this.scheduleConfigRefresh(dynamicConfig);
    return changed;
  }

  // 代理方法到实际的monitor实例
  getUserId() {
    if (this.delegate) return this.delegate.getUserId();
    return this.monitor ? this.monitor.getUserId() : null;
  }

  captureError(error) {
    if (this.delegate) return this.delegate.captureError(error);
    return this.monitor ? this.monitor.captureError(error) : null;
  }

  reportErrors(errorType) {
    if (this.delegate) return this.delegate.reportErrors(errorType);
    if (this.isClosed) return null;
    if (!this.monitor) return null;

    // 检查服务端返回的closeMonitor标志
    const result = this.monitor.reportErrors(errorType);
    if (result && result.closeMonitor) {
      this.closeMonitor();
    }
    return result;
  }

  reportPerformanceData() {
    if (this.delegate) return this.delegate.reportPerformanceData();
    if (this.isClosed) return null;
    return this.monitor ? this.monitor.reportPerformanceData() : null;
  }

  reportWhiteScreenError(error) {
    if (this.delegate) return this.delegate.reportWhiteScreenError(error);
    if (this.isClosed) return null;
    return this.monitor ? this.monitor.reportWhiteScreenError(error) : null;
  }

  // 立即关闭监控
  closeMonitor() {
    if (this.delegate) return;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.monitor) {
      // 清理所有事件监听器和监控资源
      if (this.monitor.cleanup) {
        this.monitor.cleanup();
      }
      this.monitor = null;
      this.isClosed = true;
      console.log('监控体系已根据服务端指令关闭');
    }
    this.isDisposed = true;
    const registry = this.getRuntimeRegistry();
    if (registry?.get(this.cacheKey) === this) registry.delete(this.cacheKey);
  }

  // 清理缓存
  clearCache() {
    localStorage.removeItem(this.cacheKey);
    this.configCache = null;
    DynamicWebMonitor.pendingConfigRequests.delete(this.cacheKey);
  }

  // 🆕 清除配置缓存（用于紧急配置刷新）
  clearConfigCache() {
    console.log('[Config] Clearing config cache');
    this.configCache = null;
    localStorage.removeItem(this.cacheKey);
    DynamicWebMonitor.pendingConfigRequests.delete(this.cacheKey);
  }
}

// 扩展WebMonitor类，将各功能模块的方法绑定到原型上
// 错误监控相关方法
WebMonitor.prototype.setupErrorCapture = function () {
  setupErrorCapture(this);
};

WebMonitor.prototype.captureError = function (error) {
  captureError(this, error);
};

WebMonitor.prototype.reportErrors = function (errorType) {
  reportErrors(this, errorType);
};

// 性能监控相关方法
WebMonitor.prototype.setupPerformanceCapture = function () {
  setupPerformanceCapture(this);
};

WebMonitor.prototype.reportPerformanceData = function () {
  reportPerformanceData(this);
};

// 网络监控相关方法
WebMonitor.prototype.setupNetworkMonitoring = function () {
  setupNetworkMonitoring(this);
};

// 用户行为追踪相关方法
WebMonitor.prototype.setupUserTracking = function () {
  setupUserTracking(this);
};

// 白屏检测相关方法
WebMonitor.prototype.setupWhiteScreenDetection = function () {
  setupWhiteScreenDetection(this);
};

WebMonitor.prototype.reportWhiteScreenError = function (error) {
  reportWhiteScreenError(this, error);
};

// 构建时由 webpack 注入，便于业务页面确认实际加载的 SDK 版本。
WebMonitor.version = SDK_VERSION;
DynamicWebMonitor.version = SDK_VERSION;

// 导出WebMonitor类和DynamicWebMonitor类
export { DynamicWebMonitor };
export default WebMonitor;

// 兼容UMD导出
if (typeof window !== 'undefined') {
  window.WebMonitor = WebMonitor;
  window.DynamicWebMonitor = DynamicWebMonitor;
}
