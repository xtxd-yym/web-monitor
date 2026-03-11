/**
 * WebMonitor 错误监控模块
 * 包含错误捕获和上报的相关功能
 */

import { sanitizeError } from '../../utils/sanitizer.js';

/**
 * 生成错误指纹
 * 用于错误去重识别
 * @param {Object} error - 错误对象
 * @returns {string} 错误指纹
 */
function generateErrorFingerprint(error) {
  // 对 message 进行标准化处理，移除动态内容
  // 比如: "timeout after 500ms" 中的数字会导致每次指纹不同
  let normalizedMessage = error.message || '';

  // 移除动态时间值 (如 "after 500ms", "耗时: 123ms" 等)
  normalizedMessage = normalizedMessage
    .replace(/after \d+ms/g, 'after Xms')           // timeout after 500ms
    .replace(/\(actual: \d+ms\)/g, '(actual: Xms)') // (actual: 300ms)
    .replace(/耗时: \d+ms/g, '耗时: Xms')           // 请求耗时: 123ms
    .replace(/请求耗时: \d+ms/g, '请求耗时: Xms')
    .replace(/\d+ms内/g, 'Xms内');                   // 500ms内

  const key = [
    error.type || 'unknown',
    normalizedMessage,
    error.filename || '',
    error.lineno || 0,
    getStackSignature(error.stack)
  ].filter(Boolean).join('|');

  return simpleHash(key);
}

/**
 * 提取堆栈特征
 * 移除动态变化的行号列号，保留核心调用链
 * @param {string} stack - 错误堆栈
 * @returns {string} 堆栈特征签名
 */
function getStackSignature(stack) {
  if (!stack) return '';
  const lines = stack.split('\n').slice(0, 3); // 只取前3行
  return lines.map(line =>
    line.replace(/:\d+:\d+/g, '').trim() // 移除 :行号:列号
  ).join('|');
}

/**
 * 简单hash算法
 * 避免引入crypto库，保持SDK体积小
 * @param {string} str - 待hash字符串
 * @returns {string} hash值（36进制）
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(36);
}

/**
 * 处理配置刷新（紧急关闭等场景）
 * @param {Object} monitor - WebMonitor实例
 * @param {Object} response - 上报响应
 */
async function handleConfigRefresh(monitor, response) {
  console.warn('[Monitor] Config refresh requested:', response.reason || 'Config changed');

  try {
    // 清除配置缓存
    if (monitor.clearConfigCache) {
      monitor.clearConfigCache();
    }

    // 重新获取配置
    const newConfig = await monitor.getConfig();

    // 检查是否需要关闭监控
    if (!newConfig.enabled || newConfig.emergency?.closeMonitor) {
      console.error('[Monitor] Emergency shutdown triggered by new config');
      if (monitor.closeMonitor) {
        monitor.closeMonitor();
      }
    } else {
      console.log('[Monitor] Config refreshed successfully');
    }
  } catch (error) {
    console.error('[Monitor] Failed to refresh config:', error);
  }
}

/**
 * 限流器类
 * 使用令牌桶算法实现客户端限流
 */
class RateLimiter {
  constructor(maxPerMinute = 100) {
    this.maxPerMinute = maxPerMinute;
    this.tokens = maxPerMinute;
    this.lastRefill = Date.now();
  }

  /**
   * 尝试获取令牌
   * @returns {boolean} 是否成功获取
   */
  tryAcquire() {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }

    return false;
  }

  /**
   * 补充令牌
   * 每分钟补充一次
   */
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    // 每分钟重置tokens
    if (elapsed > 60000) {
      this.tokens = this.maxPerMinute;
      this.lastRefill = now;
    }
  }
}

/**
 * 设置错误捕获
 * @param {Object} monitor - WebMonitor实例
 */
export function setupErrorCapture(monitor) {
  // 初始化错误去重缓存
  monitor.errorDeduplication = {};

  // 初始化限流器
  monitor.rateLimiter = new RateLimiter(
    monitor.options.maxErrorsPerMinute || 100
  );

  // 定期清理过期的去重记录（每10分钟）
  monitor.deduplicationCleanupTimer = setInterval(() => {
    const now = Date.now();
    const expireTime = 10 * 60 * 1000; // 10分钟过期

    Object.keys(monitor.errorDeduplication).forEach(fingerprint => {
      const record = monitor.errorDeduplication[fingerprint];
      if (now - record.lastTime > expireTime) {
        delete monitor.errorDeduplication[fingerprint];
      }
    });

    // 可选：输出清理日志（调试用）
    // console.log('[Monitor] Cleaned up deduplication cache');
  }, 10 * 60 * 1000);

  monitor.errorHandlers = [];

  const errorHandler = (event) => {
    // 检查是否是资源加载错误，如果是则不处理
    // 资源错误 capture=true 时 target 是 DOM 元素
    if (event.target && (event.target instanceof HTMLElement)) {
      // 这里的逻辑是：如果是 HTMLElement (img, script, link等) 触发的 error，归类为资源错误
      // 应该由 resourceErrorHandler 处理，errorHandler 必须忽略
      return;
    }

    // 检测是否是网络错误
    let errorType = 'javascript';
    const errorMessage = event.message || '';

    // 通过错误消息特征识别网络错误
    if (
      errorMessage.includes('NetworkError') ||
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('XMLHttpRequest') ||
      errorMessage.includes('CORS') ||
      errorMessage.includes('Network request failed') ||
      errorMessage.includes('Failed to load')
    ) {
      errorType = 'network-error';
    }

    // 尝试从错误消息中提取URL
    const urlMatch = errorMessage.match(/'(https?:\/\/[^']+)'/);
    const extractedUrl = urlMatch ? urlMatch[1] : '';

    // 增强网络错误的消息内容
    let enhancedMessage = errorMessage;
    if (errorType === 'network-error' && extractedUrl) {
      const origin = window.location.origin;
      const isCrossOrigin = extractedUrl.indexOf(origin) !== 0;

      if (isCrossOrigin) {
        // 明确是跨域请求
        enhancedMessage = `${errorMessage} | ` +
          `跨域请求详情: 从 '${origin}' 访问 '${extractedUrl}' 被阻止 | ` +
          `CORS错误原因: 目标服务器响应中缺少 'Access-Control-Allow-Origin' 响应头，或该头的值不匹配当前源 | ` +
          `可能的解决方案: ①服务器端配置CORS策略允许 ${origin}; ②使用服务器端代理; ③检查目标URL是否正确`;
      } else {
        // 同源请求失败，可能是网络问题
        enhancedMessage = `${errorMessage} | 请求URL: ${extractedUrl} | 可能原因: 网络连接中断、DNS解析失败或服务器不可达`;
      }
    }

    monitor.captureError({
      type: errorType,
      message: enhancedMessage,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      // 如果是网络错误，添加额外的网络信息
      ...(errorType === 'network-error' && extractedUrl ? {
        data: {
          requestUrl: extractedUrl,
          errorType: 'cors_or_network'
        }
      } : {})
    });
  };

  const unhandledRejectionHandler = (event) => {
    monitor.captureError({
      type: 'promise',
      message: event.reason?.message || event.reason,
      stack: event.reason?.stack,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    });
  };

  const resourceErrorHandler = (event) => {
    if (event.target && (event.target.src || event.target.href)) {
      // 检查是否在忽略列表中
      const resourceUrl = event.target.src || event.target.href;

      if (monitor.options.ignoreResources.some(ignore =>
        typeof ignore === 'string' ? resourceUrl.includes(ignore) : ignore.test(resourceUrl)
      )) {
        return;
      }

      monitor.captureError({
        type: 'resource',
        message: `Resource load failed: ${resourceUrl}`,
        resource: resourceUrl,
        tagName: event.target.tagName,
        timestamp: Date.now(),
        url: window.location.href
      });
    }
  };

  window.addEventListener('error', errorHandler, true);
  window.addEventListener('unhandledrejection', unhandledRejectionHandler);
  window.addEventListener('error', resourceErrorHandler, true);

  // 保存事件处理函数引用用于清理
  monitor.errorHandlers = [errorHandler, unhandledRejectionHandler, resourceErrorHandler];
}

/**
 * 捕获错误
 * @param {Object} monitor - WebMonitor实例
 * @param {Object} error - 错误对象
 */
export function captureError(monitor, error) {
  // === Step 0: 限流检查 ===
  if (!monitor.rateLimiter.tryAcquire()) {
    console.warn('[Monitor] Rate limit exceeded, error dropped:', error.type, error.message);
    return;
  }

  // === Step 1: 忽略列表检查（原有逻辑） ===
  if (monitor.options.ignoreErrors.some(ignore =>
    typeof ignore === 'string' ? error.message.includes(ignore) : ignore.test(error.message)
  )) {
    return;
  }

  // === Step 2: 错误去重检查 ===
  const fingerprint = generateErrorFingerprint(error);
  const now = Date.now();
  const windowTime = monitor.options.deduplicationWindow || 5 * 60 * 1000; // 默认5分钟

  if (!monitor.errorDeduplication[fingerprint]) {
    // 首次出现该错误
    monitor.errorDeduplication[fingerprint] = {
      firstTime: now,
      lastTime: now,
      count: 1,
      reported: true,
      error: error
    };
  } else {
    // 该错误之前出现过
    const record = monitor.errorDeduplication[fingerprint];
    record.count++;
    record.lastTime = now;

    // 检查是否在时间窗口内
    if (now - record.firstTime <= windowTime) {
      // 窗口内，丢弃重复错误
      console.log('[Monitor] Duplicate error filtered (count: ' + record.count + '):', error.type, error.message);
      return;
    }

    // 超过时间窗口，重置记录
    console.log('[Monitor] Time window expired, reporting again (previous count: ' + record.count + '):', error.type);
    record.firstTime = now;
    record.count = 1;
    record.reported = true;
    record.error = error;
  }

  // === Step 3: 采样检查 ===
  const samplingRate = monitor.options.samplingRates?.[error.type] ||
    monitor.options.defaultSamplingRate ||
    1.0; // 默认100%采样

  if (Math.random() > samplingRate) {
    console.log('[Monitor] Error not sampled (rate: ' + (samplingRate * 100) + '%):', error.type, error.message);
    return;
  }

  // === Step 4: 隐私数据脱敏 ===
  let processedError = error;
  if (monitor.options.enableSanitization) {
    processedError = sanitizeError(error);
  }

  // === Step 5: 添加去重信息到错误对象 ===
  processedError.fingerprint = fingerprint;
  processedError.deduplicationCount = monitor.errorDeduplication[fingerprint].count;

  // === Step 6: 执行原有回调 ===
  if (monitor.options.onCaptureError) {
    monitor.options.onCaptureError(processedError);
  }

  // === Step 7: 加入错误队列（原有逻辑） ===
  const errorTypes = ['javascript', 'promise', 'resource', 'network-xhr', 'network-fetch', 'network-error', 'network-xhr-error', 'network-xhr-timeout', 'network-xhr-abort', 'white-screen', 'custom']; // 🆕 添加 custom
  if (errorTypes.includes(processedError.type) && monitor.errorQueue.length < monitor.options.maxErrors) {
    monitor.errorQueue.push({
      ...processedError,
      project: monitor.options.project,
      env: monitor.options.env,
      userId: monitor.getUserId()
    });

    // 更新该错误类型的计数器
    if (!monitor.errorCounters[processedError.type]) {
      monitor.errorCounters[processedError.type] = 0;
    }
    monitor.errorCounters[processedError.type]++;

    // 检查该错误类型是否达到自动上报阈值
    const threshold = monitor.options.autoReportThresholds[processedError.type] || monitor.options.autoReportThreshold;
    if (monitor.errorCounters[processedError.type] >= threshold) {
      // 只上报当前错误类型的错误
      monitor.reportErrors(processedError.type);
      // 重置该错误类型的计数器
      monitor.errorCounters[processedError.type] = 0;
    }
  }
}

/**
 * 根据错误类型获取告警详情
 * @param {string} errorType - 错误类型
 * @returns {string} 告警详情
 */
function getAlarmDetailByErrorType(errorType) {
  const errorTypeMap = {
    'javascript': 'JavaScript错误',
    'js': 'JavaScript错误',
    'promise': 'Promise未处理的拒绝',
    'resource': '资源加载失败',
    'ajax': '接口请求错误',
    'fetch': '接口请求错误',
    'white-screen': '页面白屏',
    'performance': '性能异常',
    'network': '网络请求异常',
    'network-error': '网络请求异常',
    'network-xhr': '接口请求错误',
    'network-xhr-error': '网络请求异常',
    'network-xhr-timeout': '请求超时',
    'network-xhr-abort': '请求被中止',
    'network-fetch': '接口请求错误',
    'custom': '自定义错误'
  };

  return errorTypeMap[errorType] || '未知错误';
}

/**
 * 上报错误
 * @param {Object} monitor - WebMonitor实例
 * @param {string} errorType - 错误类型
 */

/**
 * 将 SDK 内部的 userActions 转换为后端 insertBatch 期望的面包屑格式
 * SDK 格式: { type, element, x, y, timestamp, url, ... }
 * 后端期望: { type, category, message, data, timestamp }
 * @param {Array} userActions - monitor.userActions 数组
 * @param {number} limit - 最多取多少条（默认 30）
 * @returns {Array}
 */
function buildBreadcrumbs(userActions, limit = 30) {
  if (!userActions || userActions.length === 0) return [];

  // 只取最近30条，避免 payload 过大
  const recent = userActions.slice(-limit);

  return recent.map(action => {
    let message = '';
    switch (action.type) {
      case 'click':
        message = `点击 ${action.element || 'unknown'}${
          action.id ? '#' + action.id : ''
        }${
          action.className ? '.' + String(action.className).split(' ')[0] : ''
        }`;
        break;
      case 'scroll':
        message = `页面滚动至 (${action.scrollX || 0}, ${action.scrollY || 0})`;
        break;
      case 'resize':
        message = `窗口大小变化: ${action.width || 0}x${action.height || 0}`;
        break;
      case 'visibility-change':
        message = `页面${action.state === 'visible' ? '变为可见' : '进入后台'}`;
        break;
      default:
        message = action.type || 'unknown';
    }

    return {
      type: action.type || '',
      category: action.type || '',    // 后端 insertBatch 解构的 category
      message,                         // 后端 insertBatch 解构的 message
      data: {                          // 其余字段存入 data，将来可展示
        element:   action.element,
        className: action.className,
        id:        action.id,
        x:         action.x,
        y:         action.y,
        scrollX:   action.scrollX,
        scrollY:   action.scrollY,
        width:     action.width,
        height:    action.height,
        state:     action.state,
        url:       action.url
      },
      timestamp: action.timestamp || 0
    };
  });
}
export async function reportErrors(monitor, errorType) {
  if (monitor.errorQueue.length === 0 || monitor.isReporting) return;

  monitor.isReporting = true;

  // 如果传入了errorType参数，则只上报该类型的错误
  let errorsToReport = [];
  let remainingErrors = [];

  if (errorType) {
    // 分离指定类型的错误和其它类型的错误
    monitor.errorQueue.forEach(error => {
      if (error.type === errorType) {
        errorsToReport.push(error);
      } else {
        remainingErrors.push(error);
      }
    });
  } else {
    // 如果没有指定类型，则上报所有错误（保持向后兼容）
    errorsToReport = [...monitor.errorQueue];
    monitor.errorQueue = [];
  }

  // 如果没有需要上报的错误，则直接返回
  if (errorsToReport.length === 0) {
    monitor.isReporting = false;
    return;
  }

  try {
    // 构建新的上报数据格式
    const reportData = {
      appkey: monitor.options.apiParams.appKey || '',
      list: errorsToReport.map(error => ({
        customer_name: monitor.options.apiParams.customer_name || '',
        service_name: monitor.options.apiParams.service_name || '',

        // --- 核心标准字段 (Unified) ---
        type: error.type || 'unknown',           // 原 index_id
        message: error.message || JSON.stringify(error.data || {}), // 原 output
        timestamp: error.timestamp,              // 原 alarm_time
        stack: error.stack || '',                // 堆栈信息

        // --- SourceMap 相关字段 ---
        filename: error.filename || '',          // 文件名 (用于 SourceMap 解析)
        lineno: error.lineno || 0,               // 行号
        colno: error.colno || 0,                 // 列号

        // --- 辅助/保留字段 ---
        alarm_detail: getAlarmDetailByErrorType(error.type),
        expand: error.type === 'performance' ? error.data || {} : {},
        url: error.url || window.location.href,
        userAgent: error.userAgent || navigator.userAgent,

        // 网络错误特有标记
        mark: error.type === 'network' ? (error.data?.url || '') : '',

        // --- 用户行为面包屑（错误发生前的操作轨迹）---
        // buildBreadcrumbs 将 SDK 内部 userActions 转换为后端 insertBatch 期望的格式
        breadcrumbs: buildBreadcrumbs(monitor.userActions)
      }))
    };

    // 使用外部传入的monitorReport函数进行上报
    let response;
    if (typeof monitor.options.monitorReport === 'function') {
      response = await monitor.options.monitorReport(reportData);
    } else {
      console.warn('monitorReport function is not provided, skipping report');
      response = { ok: false };
    }

    if (monitor.options.onReport) {
      monitor.options.onReport(errorsToReport, response);
    }

    // 🆕 检查是否需要刷新配置（紧急关闭等场景）
    if (response && response.needRefreshConfig) {
      await handleConfigRefresh(monitor, response);
    }

    // 如果是按类型上报，则只移除已上报的错误
    if (errorType) {
      monitor.errorQueue = remainingErrors;
    } else {
      monitor.errorQueue = [];
    }
  } catch (error) {
    // 上报失败，如果是按类型上报，则将失败的错误重新放回队列
    if (errorType) {
      monitor.errorQueue = [...remainingErrors, ...errorsToReport];
    } else {
      // 全部上报失败，重新加入队列
      monitor.errorQueue.unshift(...errorsToReport);
    }
  } finally {
    monitor.isReporting = false;
  }
}