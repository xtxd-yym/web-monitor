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
  }

  // 静态变量：全局请求去重
  static pendingConfigRequests = new Map();

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

        const response = await fetch(url, {
          method: 'GET',
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
        reportResourceErrors: true,
        enableXHRMonitoring: true,
        enableFetchMonitoring: true,
        enablePromiseRejection: true,
        enableUserTracking: true,
        enableUserTracking: true,
        samplingRates: {
          javascript: 1.0,
          promise: 1.0,
          resource: 0.5,
          network: 0.3
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
        updatedAt: Date.now(),
        ttl: 300
      }
    };
  }

  // 获取配置（优化版）
  async getConfig() {
    const { configUrl, project, env, cache = true } = this.options;

    if (!configUrl) {
      console.warn('[Config] configUrl not provided, using fallback');
      return this.getFallbackConfig();
    }

    // ===== 优化1: 动态TTL检查缓存 =====
    if (cache && this.configCache) {
      return this.configCache;
    }

    if (cache) {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const ttl = (parsed.data.meta?.ttl || 300) * 1000; // 动态TTL

          if (Date.now() - parsed.timestamp < ttl) {
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
    const configRequest = (async () => {
      try {
        const params = new URLSearchParams({
          project: project || 'default',
          env: env || 'production',
          customer_name: this.options.apiParams?.customer_name || '',
          appkey: this.options.apiParams?.appKey || this.options.apiParams?.appkey || '',
          version: SDK_VERSION,
          url: window.location.href,
          userAgent: navigator.userAgent
        });

        // ===== 优化7: 超时和重试 =====
        const config = await this.fetchConfigWithRetry(`${configUrl}?${params}`);

        // ===== 优化3: 配置校验 =====
        if (!this.validateConfig(config)) {
          console.warn('[Config] Validation failed, using fallback');
          return this.getFallbackConfig();
        }

        // ===== 优化4: 灰度判断 =====
        if (!this.shouldEnableMonitoring(config)) {
          console.log('[Config] Monitoring disabled by gray control');
          // 返回一个disabled的配置
          return {
            ...config,
            enabled: false
          };
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
        return this.getFallbackConfig();
      } finally {
        if (DynamicWebMonitor.pendingConfigRequests.get(this.cacheKey) === configRequest) {
          DynamicWebMonitor.pendingConfigRequests.delete(this.cacheKey);
        }
      }
    })();

    DynamicWebMonitor.pendingConfigRequests.set(this.cacheKey, configRequest);
    return await configRequest;
  }

  // 初始化监控
  async init() {
    try {
      let dynamicConfig = await this.getConfig();

      // 检查配置是否有效，无效时使用降级配置
      if (!dynamicConfig || typeof dynamicConfig !== 'object') {
        console.warn('Invalid config format, using fallback defaults');
        dynamicConfig = {
          enabled: true,
          config: {
            // 性能上报：关
            enablePerformanceMonitoring: false,
            // 白屏检测：开
            enableWhiteScreenDetection: true,
            whiteScreenConfirmations: 2,
            whiteScreenConfirmationDelay: 1000,
            whiteScreenRecoveryInterval: 2000,
            whiteScreenRelatedErrorWindow: 30000,
            whiteScreenRootSelectors: ['#app', '#root', '[id^="app"]', '.app', '.container', 'main'],
            // JS报错检测：开
            enableErrorMonitoring: true,
            // 接口获取失败（404等）：开
            enableNetworkMonitoring: true,
            // 资源请求失败：开
            reportResourceErrors: true,
            // 其余xhr fetch等其他检测：关
            enableXHRMonitoring: false,
            enableFetchMonitoring: false
          }
        };
      }

      if (!dynamicConfig.enabled || dynamicConfig.emergency?.closeMonitor) {
        console.log('Monitoring disabled by dynamic configuration');
        this.monitor = null;
        this.isClosed = true;
        return true;
      }

      // 合并动态配置和用户配置
      const finalConfig = {
        ...this.options,
        ...dynamicConfig.config
      };

      this.monitor = new WebMonitor(finalConfig);
      await this.monitor.init();

      return true;
    } catch (error) {
      console.error('Failed to initialize dynamic monitor, using fallback defaults:', error);
      // 发生异常时也使用降级配置
      const fallbackConfig = {
        ...this.options,
        // 性能上报：关
        enablePerformanceMonitoring: false,
        // 白屏检测：开
        enableWhiteScreenDetection: true,
        whiteScreenConfirmations: 2,
        whiteScreenConfirmationDelay: 1000,
        whiteScreenRecoveryInterval: 2000,
        whiteScreenRelatedErrorWindow: 30000,
        whiteScreenRootSelectors: ['#app', '#root', '[id^="app"]', '.app', '.container', 'main'],
        // JS报错检测：开
        enableErrorMonitoring: true,
        // 接口获取失败（404等）：开
        enableNetworkMonitoring: true,
        // 资源请求失败：开
        reportResourceErrors: true,
        // 其余xhr fetch等其他检测：关
        enableXHRMonitoring: false,
        enableFetchMonitoring: false
      };

      try {
        this.monitor = new WebMonitor(fallbackConfig);
        await this.monitor.init();
        return true;
      } catch (fallbackError) {
        console.error('Failed to initialize with fallback config:', fallbackError);
        return false;
      }
    }
  }

  // 代理方法到实际的monitor实例
  getUserId() {
    return this.monitor ? this.monitor.getUserId() : null;
  }

  captureError(error) {
    return this.monitor ? this.monitor.captureError(error) : null;
  }

  reportErrors(errorType) {
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
    if (this.isClosed) return null;
    return this.monitor ? this.monitor.reportPerformanceData() : null;
  }

  reportWhiteScreenError(error) {
    if (this.isClosed) return null;
    return this.monitor ? this.monitor.reportWhiteScreenError(error) : null;
  }

  // 立即关闭监控
  closeMonitor() {
    if (this.monitor) {
      // 清理所有事件监听器和监控资源
      if (this.monitor.cleanup) {
        this.monitor.cleanup();
      }
      this.monitor = null;
      this.isClosed = true;
      console.log('监控体系已根据服务端指令关闭');
    }
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
