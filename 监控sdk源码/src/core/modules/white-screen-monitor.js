/**
 * WebMonitor 白屏检测模块
 * 使用采样点检测法，生产级实现（无hardcode判断）
 */

/**
 * 采样点检测法：在页面关键位置采样，检测是否有实际内容
 */
function isWhiteScreen() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 定义采样点（页面中心 + 四个象限中心）
  const samplingPoints = [
    { x: viewportWidth / 2, y: viewportHeight / 2 },       // 中心点
    { x: viewportWidth / 4, y: viewportHeight / 4 },       // 左上
    { x: viewportWidth * 3 / 4, y: viewportHeight / 4 },   // 右上
    { x: viewportWidth / 4, y: viewportHeight * 3 / 4 },   // 左下
    { x: viewportWidth * 3 / 4, y: viewportHeight * 3 / 4 } // 右下
  ];

  let emptyPoints = 0;
  const ignoreElements = ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'META', 'HEAD', 'LINK'];

  console.log('[白屏检测] 开始采样点检测...');

  // 检查每个采样点
  for (const point of samplingPoints) {
    const element = document.elementFromPoint(point.x, point.y);

    console.log(`  采样点(${point.x.toFixed(0)}, ${point.y.toFixed(0)}):`, element?.tagName, element?.id || '', element?.className || '');

    if (!element || ignoreElements.includes(element.tagName)) {
      emptyPoints++;
      console.log(`    -> 空点 (忽略元素或null)`);
      continue;
    }

    // 检查元素是否有实际内容（纯粹基于内容判断）
    const rect = element.getBoundingClientRect();
    const hasText = element.innerText?.trim().length > 0;
    const hasMedia = element.querySelector('img, canvas, svg, iframe, video') !== null;
    const hasSize = rect.width > 0 && rect.height > 0;

    const hasContent = hasText || hasMedia;

    console.log(`    -> 文本:${hasText}, 媒体:${hasMedia}, 尺寸:${hasSize}, 有内容:${hasContent}`);

    if (!hasContent) {
      emptyPoints++;
    }
  }

  // 如果超过80%的采样点为空，判定为白屏
  const emptyRatio = emptyPoints / samplingPoints.length;

  console.log(`[白屏检测] 采样点数: ${samplingPoints.length}, 空白点: ${emptyPoints}, 空白率: ${(emptyRatio * 100).toFixed(1)}%`);

  return emptyRatio >= 0.8;
}

/**
 * 检查主要容器是否存在且有内容
 */
function checkMainContainer() {
  // 常见的应用容器ID/Class
  const containerSelectors = ['#app', '#root', '[id^="app"]', '.app', '.container', 'main'];

  console.log('[白屏检测] 检查主容器...');

  for (const selector of containerSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      const isVisible = container.style.display !== 'none' &&
        container.offsetWidth > 0 &&
        container.offsetHeight > 0;
      const hasChildren = container.children.length > 0;

      console.log(`  容器 ${selector}: 可见=${isVisible}, 有子元素=${hasChildren}`);

      if (isVisible && hasChildren) {
        return true; // 找到可见且有内容的主容器
      }
    }
  }

  console.log('  未找到有效的主容器');
  return false; // 没有找到有效的主容器
}

/**
 * 设置白屏检测
 * @param {Object} monitor - WebMonitor实例
 */
export function setupWhiteScreenDetection(monitor) {
  monitor.whiteScreenHandlers = [];
  monitor.timers = monitor.timers || [];
  monitor.whiteScreenDetected = false; // 防止重复上报

  // 白屏检测核心函数
  const performWhiteScreenCheck = (triggerReason) => {
    console.log(`[白屏检测] 触发原因: ${triggerReason}`);

    // 如果已经检测到白屏，不重复上报
    if (monitor.whiteScreenDetected) {
      console.log('[白屏检测] 已检测到白屏，跳过重复检测');
      return;
    }

    const isWhite = isWhiteScreen();
    const hasMainContainer = checkMainContainer();

    console.log(`[白屏检测] 综合判断: 采样点白屏=${isWhite}, 有主容器=${hasMainContainer}`);

    // 采样点检测为白屏 且 没有主容器 → 判定为白屏
    if (isWhite && !hasMainContainer) {
      console.log(`[白屏检测] ⚠️ 检测到白屏！触发原因: ${triggerReason}`);
      monitor.whiteScreenDetected = true;

      reportWhiteScreenError(monitor, {
        type: 'white-screen',
        message: `White screen detected (trigger: ${triggerReason})`,
        timestamp: Date.now(),
        url: window.location.href,
        triggerReason: triggerReason,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      });
    } else {
      console.log(`[白屏检测] ✓ 页面正常`);
    }
  };

  // ===== 检测时机 1: 页面加载完成后 =====
  const loadHandler = () => {
    // 等待DOM完全渲染，延迟2秒检测（给SPA框架足够的渲染时间）
    const timer = setTimeout(() => {
      performWhiteScreenCheck('页面加载完成');
    }, 2000);
    monitor.timers.push(timer);
  };

  window.addEventListener('load', loadHandler);
  monitor.whiteScreenHandlers.push(['load', loadHandler]);

  // ===== 检测时机 2: SPA路由变化 =====
  let lastUrl = location.href;
  const routeCheckTimer = setInterval(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('[白屏检测] 检测到路由变化:', currentUrl);

      // 路由变化后延迟1.5秒检测（给新页面渲染时间）
      const timer = setTimeout(() => {
        performWhiteScreenCheck('SPA路由变化');
      }, 1500);
      monitor.timers.push(timer);
    }
  }, 500); // 每500ms检查一次URL变化

  monitor.timers.push(routeCheckTimer);

  // ===== 检测时机 3: 监听DOM重大变化（容器被清空或隐藏） =====
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const target = mutation.target;

        // 检测主要容器的子节点被大量移除
        if (mutation.removedNodes.length > 3 &&
          (target.id === 'app' || target.id === 'root' || target === document.body)) {

          console.log('[白屏检测] 检测到主容器DOM大量移除:', target.tagName, target.id);

          // 延迟200ms检测（可能是框架在重新渲染）
          const timer = setTimeout(() => {
            performWhiteScreenCheck('DOM结构变化');
          }, 200);
          monitor.timers.push(timer);

          break;
        }
      } else if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        // 检测主容器被隐藏（display: none）
        const target = mutation.target;
        if ((target.id === 'app' || target.id === 'root' || target.classList?.contains('container')) &&
          target.style.display === 'none') {

          console.log('[白屏检测] 检测到主容器被隐藏:', target.tagName, target.id || target.className);

          // 延迟300ms检测
          const timer = setTimeout(() => {
            performWhiteScreenCheck('主容器隐藏');
          }, 300);
          monitor.timers.push(timer);

          break;
        }
      }
    }
  });

  // 监听body和主要应用容器
  // 兼容框架应用初始化时序：body 可能在 SDK init() 时尚未挂载（如 Vue 挂载前），
  // 用 DOMContentLoaded 保证 body 一定存在后再启动 observer，避免 observe(null) 报错
  const startObserver = () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,   // 监听子节点变化
        attributes: true,  // 监听属性变化
        subtree: true      // 监听后代节点
      });
      monitor.whiteScreenObserver = observer;
    } else {
      console.warn('[白屏检测] document.body 尚未就绪，跳过 MutationObserver');
    }
  };

  if (document.readyState === 'loading') {
    // DOM 还没解析完，等 DOMContentLoaded 再 observe
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    // DOM 已就绪（readyState: interactive / complete），直接 observe
    startObserver();
  }

  // 保存observer引用用于清理（startObserver 内部赋值，这里不重复赋值）
}

/**
 * 上报白屏错误
 * @param {Object} monitor - WebMonitor实例
 * @param {Object} error - 错误对象
 */
export async function reportWhiteScreenError(monitor, error) {
  // 添加项目信息
  const errorWithProjectInfo = {
    ...error,
    project: monitor.options.project,
    env: monitor.options.env,
    userId: monitor.getUserId()
  };

  try {
    // 构建新的上报数据格式
    const reportData = {
      appkey: monitor.options.apiParams.appKey || '',
      list: [{
        customer_name: monitor.options.apiParams.customer_name || '',
        alarm_detail: '页面白屏',
        service_name: monitor.options.apiParams.service_name || '',

        // 此处必须使用标准字段，以匹配 routes/errors.js 的解构逻辑
        type: 'white_screen',           // 修正: 明确指定 type
        message: `White screen detected (trigger: ${error.triggerReason})`, // 修正: 放入 message
        timestamp: error.timestamp,

        // 扩展数据放入 expand
        expand: {
          viewport: error.viewport,
          triggerReason: error.triggerReason
        },

        // 兼容字段 (可选)
        url: error.url || window.location.href,

        // SourceMap 字段 (白屏通常没有堆栈，设为空)
        stack: '',
        filename: '',
        lineno: 0,
        colno: 0
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
      monitor.options.onReport([errorWithProjectInfo], response);
    }

    // 如果有白屏检测回调，则通知
    if (monitor.options.onWhiteScreen) {
      monitor.options.onWhiteScreen(errorWithProjectInfo, response);
    }
  } catch (err) {
    console.error('白屏错误上报失败:', err);
  }
}