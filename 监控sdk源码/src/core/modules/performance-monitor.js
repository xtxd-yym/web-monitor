/**
 * WebMonitor 性能监控模块
 * 包含性能数据收集和上报的相关功能
 */

/**
 * 设置性能监控
 * @param {Object} monitor - WebMonitor实例
 */
export function setupPerformanceCapture(monitor) {
  monitor.performanceHandlers = [];
  
  const loadHandler = () => {
    setTimeout(() => {
      const performance = window.performance;
      if (performance && performance.timing) {
        const timing = performance.timing;
        monitor.performanceData = {
          dns: timing.domainLookupEnd - timing.domainLookupStart,
          tcp: timing.connectEnd - timing.connectStart,
          ttfb: timing.responseStart - timing.requestStart,
          response: timing.responseEnd - timing.responseStart,
          domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
          loadComplete: timing.loadEventEnd - timing.navigationStart,
          timestamp: Date.now(),
          url: window.location.href
        };
        
        // 性能数据收集完成后立即上报
        reportPerformanceData(monitor);
        
        // 性能数据通过回调通知
        if (monitor.options.onPerformanceData) {
          monitor.options.onPerformanceData(monitor.performanceData);
        }
      }
    }, 0);
  };
  
  window.addEventListener('load', loadHandler);
  monitor.performanceHandlers.push(['load', loadHandler]);
}

/**
 * 上报性能数据
 * @param {Object} monitor - WebMonitor实例
 */
export async function reportPerformanceData(monitor) {
  if (!monitor.performanceData) return;
  
  // 将性能数据包装成与错误数据相同的格式
  const performanceError = {
    type: 'performance',
    data: monitor.performanceData,
    project: monitor.options.project,
    env: monitor.options.env,
    userId: monitor.getUserId(),
    timestamp: monitor.performanceData.timestamp
  };
  
  try {
    // 构建新的上报数据格式
    const reportData = {
      appkey: monitor.options.apiParams.appKey || '',
      list: [{
        customer_name: monitor.options.apiParams.customer_name || '',
        alarm_detail: '性能异常',
        service_name: monitor.options.apiParams.service_name || '',
        alarm_time: monitor.performanceData.timestamp,
        output: JSON.stringify(monitor.performanceData),
        expand: monitor.performanceData,
        index_id: 'performance',
        url: monitor.performanceData.url || window.location.href,
        mark: ''
      }]
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
      monitor.options.onReport([monitor.performanceData], response);
    }
  } catch (error) {
    console.error('性能数据上报失败:', error);
  }
}