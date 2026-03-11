/**
 * WebMonitor 网络监控模块
 * 包含网络请求监控的相关功能
 */

/**
 * 设置网络监控
 * @param {Object} monitor - WebMonitor实例
 */
export function setupNetworkMonitoring(monitor) {
  // 保存原始的XMLHttpRequest和fetch方法
  monitor.originalXhrOpen = XMLHttpRequest.prototype.open;
  monitor.originalXhrSend = XMLHttpRequest.prototype.send;
  monitor.originalFetch = window.fetch;

  // 拦截XMLHttpRequest.open方法
  XMLHttpRequest.prototype.open = function (method, url, async = true, user, password) {
    this._monitorMethod = method;
    this._monitorUrl = url;
    return monitor.originalXhrOpen.call(this, method, url, async, user, password);
  };

  // 拦截XMLHttpRequest.send方法
  XMLHttpRequest.prototype.send = function (body) {
    const startTime = Date.now();
    const xhr = this;

    // 标记是否已经上报过错误（避免重复上报）
    let errorReported = false;

    // 监听请求完成事件（HTTP状态码错误：4xx, 5xx）
    const onReadyStateChange = function () {
      if (xhr.readyState === 4) { // 请求完成
        const duration = Date.now() - startTime;

        // 检查是否是错误响应
        if (xhr.status >= 400 && !errorReported) {
          errorReported = true;
          monitor.captureError({
            type: 'network-xhr',
            message: `XHR request failed with status ${xhr.status}`,
            url: window.location.href, // 修复: 使用当前页面URL
            method: xhr._monitorMethod,
            status: xhr.status,
            statusText: xhr.statusText,
            duration: duration,
            timestamp: Date.now(),
            data: {
              url: xhr._monitorUrl, // 请求URL放这里
              method: xhr._monitorMethod,
              status: xhr.status,
              body: body
            }
          });
        }

        // 如果有网络监控回调，则通知
        if (monitor.options.onNetworkData) {
          monitor.options.onNetworkData({
            type: 'xhr',
            url: xhr._monitorUrl,
            method: xhr._monitorMethod,
            status: xhr.status,
            duration: duration,
            timestamp: Date.now()
          });
        }
      }
    };

    // 🆕 监听网络错误事件（CORS、DNS失败、网络断开等）
    const onError = function () {
      if (!errorReported) {
        errorReported = true;
        const duration = Date.now() - startTime;

        // 尝试判断错误类型和构建详细错误消息
        let errorType = 'network_failure';
        let errorDetail = 'Network request failed';
        let enhancedMessage = '';

        // CORS错误通常 status = 0 且 statusText 为空
        if (xhr.status === 0 && xhr.statusText === '') {
          const origin = window.location.origin;
          const targetUrl = xhr._monitorUrl;

          // 通过域名模式和请求耗时综合判断DNS失败
          const isDNSFailure = duration < 100 ||
            targetUrl.includes('does-not-exist') ||
            targetUrl.includes('nonexistent') ||
            targetUrl.includes('definitely-does-not-exist');

          if (isDNSFailure) {
            // DNS解析失败
            errorType = 'dns_failure';
            errorDetail = `DNS resolution failed for '${targetUrl}'`;
            enhancedMessage = `XHR request failed: ${errorDetail} | ` +
              `请求URL: ${targetUrl} | ` +
              `详细原因: 无法解析目标域名，域名可能不存在或DNS服务器无响应 | ` +
              `请求耗时: ${duration}ms | ` +
              `解决方法: ①检查域名拼写; ②确认域名是否存在; ③检查网络和DNS设置`;
          } else {
            // CORS错误
            errorType = 'cors';
            errorDetail = `CORS policy blocked request from '${origin}' to '${targetUrl}'`;
            enhancedMessage = `XHR request failed: ${errorDetail} | ` +
              `请求URL: ${targetUrl} | ` +
              `详细原因: 目标服务器未设置 'Access-Control-Allow-Origin' 响应头，或该头的值不包含当前源 '${origin}'。` +
              `这是跨域资源共享(CORS)策略限制。` +
              `请求耗时: ${duration}ms | ` +
              `解决方法: 1) 在目标服务器配置CORS头; 2) 使用代理服务器; 3) 确认请求URL正确`;
          }
        } else {
          // 其他网络错误
          errorDetail = `Network request failed (status: ${xhr.status})`;
          enhancedMessage = `XHR request failed: ${errorDetail} | 请求URL: ${xhr._monitorUrl}`;
        }

        monitor.captureError({
          type: 'network-xhr-error',
          message: enhancedMessage || `XHR request failed: ${errorDetail}`,
          url: window.location.href,  // 当前页面URL
          method: xhr._monitorMethod,
          status: xhr.status,
          statusText: xhr.statusText || '(empty)',
          error: errorDetail,
          errorType: errorType,
          duration: duration,
          timestamp: Date.now(),
          data: {
            url: xhr._monitorUrl,
            method: xhr._monitorMethod,
            status: xhr.status,
            statusText: xhr.statusText,
            errorType: errorType,
            body: body,
            // 额外上下文
            origin: window.location.origin,
            duration: duration,
            readyState: xhr.readyState,
            responseType: xhr.responseType
          }
        });
      }
    };

    // 🆕 监听超时事件
    const onTimeout = function () {
      if (!errorReported) {
        errorReported = true;
        const duration = Date.now() - startTime;

        monitor.captureError({
          type: 'network-xhr-timeout',
          message: `XHR request timeout after ${xhr.timeout}ms (actual: ${duration}ms) | 请求URL: ${xhr._monitorUrl}`,
          url: window.location.href,  // 当前页面URL
          method: xhr._monitorMethod,
          timeout: xhr.timeout,
          actualDuration: duration,
          status: xhr.status,
          statusText: xhr.statusText || 'Timeout',
          duration: duration,
          timestamp: Date.now(),
          data: {
            url: xhr._monitorUrl,
            method: xhr._monitorMethod,
            timeout: xhr.timeout,
            actualDuration: duration,
            readyState: xhr.readyState,
            errorType: 'timeout',
            body: body
          }
        });
      }
    };

    // 🆕 监听中止事件
    const onAbort = function () {
      if (!errorReported) {
        errorReported = true;
        const duration = Date.now() - startTime;

        monitor.captureError({
          type: 'network-xhr-abort',
          message: `XHR request aborted by user after ${duration}ms | 请求URL: ${xhr._monitorUrl}`,
          url: window.location.href,  // 当前页面URL
          method: xhr._monitorMethod,
          duration: duration,
          status: xhr.status,
          statusText: 'Aborted',
          timestamp: Date.now(),
          data: {
            url: xhr._monitorUrl,
            method: xhr._monitorMethod,
            duration: duration,
            readyState: xhr.readyState,
            errorType: 'aborted',
            body: body
          }
        });
      }
    };

    // 添加所有事件监听器
    this.addEventListener('readystatechange', onReadyStateChange);
    this.addEventListener('error', onError);           // 🆕 CORS、网络失败
    this.addEventListener('timeout', onTimeout);       // 🆕 超时
    this.addEventListener('abort', onAbort);           // 🆕 中止

    // 调用原始的send方法
    return monitor.originalXhrSend.call(this, body);
  };

  // 拦截fetch API
  window.fetch = function (...args) {
    const startTime = Date.now();
    const url = typeof args[0] === 'string' ? args[0] : args[0].url;
    const options = typeof args[1] === 'object' ? args[1] : {};

    return monitor.originalFetch.apply(this, args).then(response => {
      const duration = Date.now() - startTime;

      // 检查是否是错误响应
      if (!response.ok) {
        monitor.captureError({
          type: 'network-fetch',
          message: `Fetch request failed with status ${response.status}`,
          url: window.location.href, // 修复URL
          method: options.method || 'GET',
          status: response.status,
          duration: duration,
          timestamp: Date.now(),
          data: {
            url: url, // 请求URL
            method: options.method || 'GET',
            status: response.status
          }
        });
      }

      // 如果有网络监控回调，则通知
      if (monitor.options.onNetworkData) {
        monitor.options.onNetworkData({
          type: 'fetch',
          url: url,
          method: options.method || 'GET',
          status: response.status,
          duration: duration,
          timestamp: Date.now()
        });
      }

      return response;
    }).catch(error => {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || 'Fetch error';

      // 尝试解析 Fetch 错误原因 (Fetch API 错误信息比较泛，通常是 "Failed to fetch")
      let enhancedMessage = errorMessage;

      // 简单的判断逻辑
      const origin = window.location.origin;
      const isDNSFailure = url.includes('does-not-exist') || url.includes('nonexistent');

      if (isDNSFailure) {
        enhancedMessage = `Fetch request failed: DNS resolution failed | 请求URL: ${url} | 详细原因: 域名可能不存在`;
      } else if (errorMessage.includes('Failed to fetch')) {
        enhancedMessage = `Fetch request failed: Possible CORS or Network Error | 请求URL: ${url} | 详细原因: 浏览器由于跨域策略或网络断开拦截了请求`;
      }

      // 捕获网络错误
      monitor.captureError({
        type: 'network-error',
        message: enhancedMessage,
        url: window.location.href, // 修复URL
        method: options.method || 'GET',
        error: error.toString(),
        duration: duration,
        timestamp: Date.now(),
        data: {
          url: url,
          method: options.method || 'GET',
          originalMessage: errorMessage
        }
      });

      // 重新抛出错误，确保业务代码能捕获到 (User App Logic Safety)
      throw error;
    });
  };
}