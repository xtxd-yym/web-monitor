/**
 * WebMonitor 核心模块
 * 包含WebMonitor类的基本结构和通用方法
 */

class WebMonitor {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    // 默认配置
    this.options = {
      // 项目标识
      project: '',
      // 环境标识
      env: 'production',
      // 上报函数，由外部传入
      monitorReport: null,
      // API参数，用于上报时传递给服务端
      apiParams: {},

      // === 错误去重和采样配置 ===
      // 去重时间窗口（毫秒），默认5分钟
      deduplicationWindow: 5 * 60 * 1000,
      // 每分钟最大错误数（限流）
      maxErrorsPerMinute: 100,
      // 默认采样率（0-1），默认100%
      defaultSamplingRate: 1.0,
      // 各类型错误采样率
      samplingRates: {
        'javascript': 1.0,   // JS错误100%
        'promise': 1.0,      // Promise错误100%
        'resource': 0.5,     // 资源错误50%
        'network': 0.3,      // 网络错误30%
        'network-error': 0.3,       // 网络错误(通用)30%
        'network-xhr': 0.3,         // XHR错误30%
        'network-xhr-error': 0.3,   // XHR网络错误30%
        'network-xhr-timeout': 0.3, // XHR超时30%
        'network-xhr-abort': 0.3,   // XHR中止30%
        'network-fetch': 0.3,       // Fetch错误30%
        'cors': 0.3,                // CORS错误30%
        'performance': 0.1,  // 性能数据10%
      },

      // === 隐私数据脱敏配置 ===
      // 是否启用数据脱敏（默认开启，生产环境必须开启）
      enableSanitization: true,
      // 自定义敏感URL参数（追加到默认列表）
      customSensitiveParams: [],
      // 自定义敏感JSON字段（追加到默认列表）
      customSensitiveFields: [],
      // 是否脱敏堆栈中的文件路径
      sanitizeStackPaths: true,

      // === 原有配置 ===
      // 是否启用错误监控
      enableErrorMonitoring: true,
      // 是否启用性能监控
      enablePerformanceMonitoring: true,
      // 是否启用网络监控
      enableNetworkMonitoring: true,
      // 是否启用用户行为追踪
      enableUserTracking: true,
      // 是否启用白屏检测
      enableWhiteScreenDetection: true,
      // 自动上报阈值
      autoReportThreshold: 1,
      // 各类型错误的自动上报阈值
      autoReportThresholds: {},
      // 最大错误数
      maxErrors: 100,
      // 错误回调
      onCaptureError: null,
      // 上报回调
      onReport: null,
      // 性能数据回调
      onPerformanceData: null,
      // 用户行为回调
      onUserAction: null,
      // 白屏检测回调
      onWhiteScreen: null,
      // 用户ID获取函数
      getUserIdFunction: null,
      // 忽略的错误
      ignoreErrors: [],
      // 忽略的资源
      ignoreResources: []
    };

    // 合并用户配置
    Object.assign(this.options, options);

    // 错误队列
    this.errorQueue = [];
    // 错误计数器
    this.errorCounters = {};
    // 性能数据
    this.performanceData = null;
    // 是否正在上报
    this.isReporting = false;
    // 用户行为数据
    this.userActions = [];
    // 页面停留时间
    this.pageStayTime = 0;
    // 页面开始时间
    this.pageStartTime = Date.now();
  }

  /**
   * 初始化监控
   */
  init() {
    // 记录页面开始时间
    this.pageStartTime = Date.now();

    // 初始化各功能模块
    if (this.options.enableErrorMonitoring) {
      this.setupErrorCapture();
    }

    if (this.options.enablePerformanceMonitoring) {
      this.setupPerformanceCapture();
    }

    if (this.options.enableNetworkMonitoring) {
      this.setupNetworkMonitoring();
    }

    if (this.options.enableUserTracking) {
      this.setupUserTracking();
    }

    if (this.options.enableWhiteScreenDetection) {
      this.setupWhiteScreenDetection();
    }

    // 页面卸载时上报数据
    this.beforeUnloadHandler = () => {
      // 计算页面停留时间
      this.pageStayTime = Date.now() - this.pageStartTime;

      // 如果有用户行为数据回调，则通知
      if (this.options.onUserAction && this.userActions.length > 0) {
        this.options.onUserAction({
          type: 'page-stay',
          duration: this.pageStayTime,
          actions: this.userActions.length,
          timestamp: Date.now()
        });
      }

      // 上报未发送的错误
      if (this.errorQueue.length > 0) {
        this.reportErrors();
      }
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  /**
   * 获取用户ID
   * @returns {string} 用户ID
   */
  getUserId() {
    if (this.options.getUserIdFunction) {
      return this.options.getUserIdFunction();
    }

    let userId = localStorage.getItem('monitor-user-id');
    if (!userId) {
      userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('monitor-user-id', userId);
    }
    return userId;
  }

  /**
   * 设置错误捕获
   * 在error-monitor模块中实现
   */
  setupErrorCapture() { }

  /**
   * 设置性能监控
   * 在performance-monitor模块中实现
   */
  setupPerformanceCapture() { }

  /**
   * 设置网络监控
   * 在network-monitor模块中实现
   */
  setupNetworkMonitoring() { }

  /**
   * 设置用户行为追踪
   * 在user-tracking模块中实现
   */
  setupUserTracking() { }

  /**
   * 设置白屏检测
   * 在white-screen-monitor模块中实现
   */
  setupWhiteScreenDetection() { }

  /**
   * 捕获错误
   * 在error-monitor模块中实现
   */
  captureError(error) { }

  /**
   * 上报错误
   * 在error-monitor模块中实现
   */
  async reportErrors(errorType) { }

  /**
   * 获取性能数据
   * @returns {Object} 性能数据
   */
  getPerformanceData() {
    return this.performanceData;
  }

  /**
   * 清理监控资源
   */
  cleanup() {
    // 移除beforeunload事件监听器
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }

    // 清理去重定时器
    if (this.deduplicationCleanupTimer) {
      clearInterval(this.deduplicationCleanupTimer);
    }

    // 清理错误监控事件监听器
    if (this.errorHandlers) {
      this.errorHandlers.forEach(handler => {
        if (handler.length === 2) {
          // 性能监控事件
          window.removeEventListener(...handler);
        } else {
          // 错误监控事件
          window.removeEventListener(handler[0], handler[1], true);
        }
      });
    }

    // 清理性能监控事件监听器
    if (this.performanceHandlers) {
      this.performanceHandlers.forEach(handler => {
        window.removeEventListener(...handler);
      });
    }

    // 清理用户行为追踪事件监听器和定时器
    if (this.userTrackingHandlers) {
      this.userTrackingHandlers.forEach(handler => {
        window.removeEventListener(...handler);
      });
    }

    // 清理白屏检测事件监听器和定时器
    if (this.whiteScreenHandlers) {
      this.whiteScreenHandlers.forEach(handler => {
        window.removeEventListener(...handler);
      });
    }

    // 清理白屏检测的MutationObserver
    if (this.whiteScreenObserver) {
      this.whiteScreenObserver.disconnect();
    }

    // 清理定时器
    if (this.timers) {
      this.timers.forEach(timer => clearTimeout(timer));
    }

    // 清理网络监控的拦截
    if (this.originalXhrOpen && this.originalXhrSend) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
      XMLHttpRequest.prototype.send = this.originalXhrSend;
    }

    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }

    // 清理去重缓存
    this.errorDeduplication = {};

    // 重置限流器
    if (this.rateLimiter) {
      this.rateLimiter.tokens = this.rateLimiter.maxPerMinute;
      this.rateLimiter.lastRefill = Date.now();
    }

    // 清理错误队列
    this.errorQueue = [];
    this.errorCounters = {};

    // 清理用户行为数据
    this.userActions = [];

    // 清理性能数据
    this.performanceData = null;

    // 清理事件处理函数引用
    this.errorHandlers = [];
    this.performanceHandlers = [];
    this.userTrackingHandlers = [];
    this.whiteScreenHandlers = [];
    this.timers = [];

    console.log('监控资源已彻底清理');
  }
}

// 导出WebMonitor类
export default WebMonitor;