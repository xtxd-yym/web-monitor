/**
 * WebMonitor 用户行为追踪模块
 * 包含用户行为监控的相关功能
 */

/**
 * 设置用户行为追踪
 * @param {Object} monitor - WebMonitor实例
 */
export function setupUserTracking(monitor) {
  monitor.userTrackingHandlers = [];
  monitor.timers = monitor.timers || [];
  
  // 监听点击事件
  const clickHandler = (event) => {
    const action = {
      type: 'click',
      element: event.target.tagName,
      className: event.target.className,
      id: event.target.id,
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    // 添加到用户行为数据数组
    monitor.userActions.push(action);
    
    // 如果有用户行为回调，则通知
    if (monitor.options.onUserAction) {
      monitor.options.onUserAction(action);
    }
  };
  
  // 监听页面可见性变化
  const visibilityHandler = () => {
    const action = {
      type: 'visibility-change',
      state: document.visibilityState,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    // 添加到用户行为数据数组
    monitor.userActions.push(action);
    
    // 如果有用户行为回调，则通知
    if (monitor.options.onUserAction) {
      monitor.options.onUserAction(action);
    }
  };
  
  // 监听页面滚动
  let scrollTimer;
  const scrollHandler = () => {
    // 防抖处理，避免频繁触发
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const action = {
        type: 'scroll',
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        timestamp: Date.now(),
        url: window.location.href
      };
      
      // 添加到用户行为数据数组
      monitor.userActions.push(action);
      
      // 如果有用户行为回调，则通知
      if (monitor.options.onUserAction) {
        monitor.options.onUserAction(action);
      }
    }, 100);
  };
  
  // 监听页面大小变化
  let resizeTimer;
  const resizeHandler = () => {
    // 防抖处理，避免频繁触发
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const action = {
        type: 'resize',
        width: window.innerWidth,
        height: window.innerHeight,
        timestamp: Date.now(),
        url: window.location.href
      };
      
      // 添加到用户行为数据数组
      monitor.userActions.push(action);
      
      // 如果有用户行为回调，则通知
      if (monitor.options.onUserAction) {
        monitor.options.onUserAction(action);
      }
    }, 100);
  };
  
  // 添加事件监听器
  document.addEventListener('click', clickHandler, true);
  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('scroll', scrollHandler);
  window.addEventListener('resize', resizeHandler);
  
  // 保存事件处理函数引用用于清理
  monitor.userTrackingHandlers = [
    ['click', clickHandler, true],
    ['visibilitychange', visibilityHandler],
    ['scroll', scrollHandler],
    ['resize', resizeHandler]
  ];
  
  // 保存定时器引用
  monitor.timers.push(scrollTimer, resizeTimer);
}