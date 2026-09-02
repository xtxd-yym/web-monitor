/**
 * WebMonitor 白屏检测模块
 * 通过采样点、主容器、连续确认和恢复跟踪降低瞬时误报。
 */

import { isLocalEnv } from '../../utils/env.js';
import { buildBreadcrumbs, getRecentRelatedErrors } from './diagnostics.js';

const DEFAULT_ROOT_SELECTORS = ['#app', '#root', '[id^="app"]', '.app', '.container', 'main'];
const IGNORED_TAGS = new Set(['HTML', 'BODY', 'SCRIPT', 'STYLE', 'META', 'HEAD', 'LINK']);

function positiveInteger(value, fallback, minimum = 1) {
  return Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
}

function elementClassName(element) {
  if (!element) return '';
  if (typeof element.className === 'string') return element.className.slice(0, 200);
  return String(element.className?.baseVal || '').slice(0, 200);
}

function elementHasMedia(element) {
  return Boolean(
    element?.matches?.('img, canvas, svg, iframe, video') ||
    element?.querySelector?.('img, canvas, svg, iframe, video')
  );
}

/**
 * 返回采样结论和不包含页面文本的诊断信息。
 */
export function inspectWhiteScreen() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const coordinates = [
    [viewportWidth / 2, viewportHeight / 2],
    [viewportWidth / 4, viewportHeight / 4],
    [viewportWidth * 3 / 4, viewportHeight / 4],
    [viewportWidth / 4, viewportHeight * 3 / 4],
    [viewportWidth * 3 / 4, viewportHeight * 3 / 4]
  ];

  const points = coordinates.map(([x, y]) => {
    const element = document.elementFromPoint(x, y);
    if (!element || IGNORED_TAGS.has(element.tagName)) {
      return {
        x: Math.round(x), y: Math.round(y), tagName: element?.tagName || '',
        id: element?.id || '', className: elementClassName(element), empty: true,
        hasText: false, hasMedia: false, hasSize: false
      };
    }

    const rect = element.getBoundingClientRect();
    const hasText = Boolean(element.innerText?.trim());
    const hasMedia = elementHasMedia(element);
    const hasSize = rect.width > 0 && rect.height > 0;
    return {
      x: Math.round(x), y: Math.round(y), tagName: element.tagName || '',
      id: element.id || '', className: elementClassName(element),
      empty: !(hasSize && (hasText || hasMedia)), hasText, hasMedia, hasSize
    };
  });

  const emptyPoints = points.filter(point => point.empty).length;
  const emptyRatio = emptyPoints / points.length;
  return {
    isWhite: emptyRatio >= 0.8,
    emptyPoints,
    totalPoints: points.length,
    emptyRatio,
    points
  };
}

/**
 * 检查业务根容器并返回每个候选选择器的状态。
 */
export function inspectMainContainer(selectors = DEFAULT_ROOT_SELECTORS) {
  const candidates = selectors.map(selector => {
    const container = document.querySelector(selector);
    if (!container) return { selector, found: false, visible: false, hasContent: false };

    const rect = container.getBoundingClientRect();
    const computedStyle = typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(container)
      : null;
    const visible = container.style?.display !== 'none' &&
      computedStyle?.display !== 'none' && computedStyle?.visibility !== 'hidden' &&
      rect.width > 0 && rect.height > 0;
    const hasContent = container.children.length > 0 ||
      Boolean(container.innerText?.trim()) || elementHasMedia(container);

    return {
      selector,
      found: true,
      visible,
      hasContent,
      childCount: container.children.length,
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  });

  const matched = candidates.find(candidate => candidate.visible && candidate.hasContent);
  return {
    hasMainContainer: Boolean(matched),
    matchedSelector: matched?.selector || '',
    candidates
  };
}

/**
 * 纯状态机：连续 N 次白屏才确认；确认后首次恢复会返回持续时间并重置。
 */
export function createWhiteScreenStateTracker(requiredConfirmations = 2, minimumGapMs = 200) {
  const required = positiveInteger(requiredConfirmations, 2, 2);
  let state = {
    consecutive: 0,
    suspectedAt: 0,
    lastWhiteAt: 0,
    reported: false,
    incidentId: ''
  };

  const reset = () => {
    state = { consecutive: 0, suspectedAt: 0, lastWhiteAt: 0, reported: false, incidentId: '' };
  };

  return {
    observe(isWhite, now = Date.now()) {
      if (isWhite) {
        if (state.reported) {
          state.lastWhiteAt = now;
          return { status: 'ongoing', shouldReport: false, ...state };
        }

        if (state.consecutive === 0) {
          state.suspectedAt = now;
          state.incidentId = `white-screen-${now}`;
          state.consecutive = 1;
          state.lastWhiteAt = now;
        } else if (now - state.lastWhiteAt >= minimumGapMs) {
          state.consecutive += 1;
          state.lastWhiteAt = now;
        }

        if (state.consecutive >= required) {
          state.reported = true;
          return { status: 'confirmed', shouldReport: true, ...state };
        }
        return { status: 'suspected', shouldReport: false, ...state };
      }

      if (state.reported) {
        const recovery = {
          status: 'recovered',
          shouldReportRecovery: true,
          incidentId: state.incidentId,
          suspectedAt: state.suspectedAt,
          recoveredAt: now,
          duration: Math.max(0, now - state.suspectedAt)
        };
        reset();
        return recovery;
      }

      const wasSuspected = state.consecutive > 0;
      reset();
      return { status: wasSuspected ? 'transient' : 'normal', shouldReport: false };
    },
    getState() {
      return { ...state };
    }
  };
}

function buildInspection(monitor) {
  const sampling = inspectWhiteScreen();
  const rootContainer = inspectMainContainer(
    Array.isArray(monitor.options.whiteScreenRootSelectors)
      ? monitor.options.whiteScreenRootSelectors
      : DEFAULT_ROOT_SELECTORS
  );
  return {
    isWhite: sampling.isWhite && !rootContainer.hasMainContainer,
    sampling,
    rootContainer
  };
}

function buildEvidence(monitor, triggerReason, inspection, transition, now) {
  const relatedWindow = positiveInteger(monitor.options.whiteScreenRelatedErrorWindow, 30000);
  return {
    incidentId: transition.incidentId,
    triggerReason,
    confirmations: transition.consecutive,
    suspectedAt: transition.suspectedAt,
    detectedAt: now,
    documentReadyState: document.readyState,
    visibilityState: document.visibilityState,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    sampling: inspection.sampling,
    rootContainer: inspection.rootContainer,
    relatedErrors: getRecentRelatedErrors(monitor, now - relatedWindow, now).slice(-10)
  };
}

function createReportItem(monitor, type, message, timestamp, expand, breadcrumbs = []) {
  return {
    customer_name: monitor.options.apiParams.customer_name || '',
    alarm_detail: type === 'white_screen' ? '页面白屏' : '页面白屏恢复',
    service_name: monitor.options.apiParams.service_name || '',
    userId: monitor.getUserId(),
    type,
    message,
    timestamp,
    expand,
    breadcrumbs,
    url: window.location.href,
    stack: '',
    filename: '',
    lineno: 0,
    colno: 0
  };
}

async function sendWhiteScreenReport(monitor, item, callbackPayload) {
  if (isLocalEnv(monitor)) {
    console.log('[Monitor] 本地开发环境检测，跳过白屏事件网络上报');
    return;
  }

  try {
    const reportData = {
      appkey: monitor.options.apiParams.appKey || '',
      sdkVersion: typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : 'development',
      runtimeId: monitor.options.runtimeId || '',
      configVersion: monitor.options.configVersion || '',
      configMatched: monitor.options.configMatched === true,
      list: [item]
    };
    const response = typeof monitor.options.monitorReport === 'function'
      ? await monitor.options.monitorReport(reportData)
      : { ok: false };

    monitor.options.onReport?.([callbackPayload], response);
    monitor.options.onWhiteScreen?.(callbackPayload, response);
  } catch (error) {
    console.error('白屏事件上报失败:', error);
  }
}

export function setupWhiteScreenDetection(monitor) {
  monitor.whiteScreenHandlers = [];
  monitor.timers = monitor.timers || [];

  const confirmationDelay = positiveInteger(monitor.options.whiteScreenConfirmationDelay, 1000, 200);
  const recoveryInterval = positiveInteger(monitor.options.whiteScreenRecoveryInterval, 2000, 500);
  const tracker = createWhiteScreenStateTracker(monitor.options.whiteScreenConfirmations, 200);
  let confirmationTimer = null;
  let recoveryTimer = null;

  const cancelConfirmation = () => {
    if (confirmationTimer !== null) {
      clearTimeout(confirmationTimer);
      confirmationTimer = null;
    }
  };

  const stopRecoveryMonitoring = () => {
    if (recoveryTimer !== null) {
      clearInterval(recoveryTimer);
      recoveryTimer = null;
    }
  };

  const performWhiteScreenCheck = triggerReason => {
    const now = Date.now();
    const inspection = buildInspection(monitor);
    const transition = tracker.observe(inspection.isWhite, now);

    if (transition.status === 'suspected' && confirmationTimer === null) {
      confirmationTimer = setTimeout(() => {
        confirmationTimer = null;
        performWhiteScreenCheck('连续确认');
      }, confirmationDelay);
      monitor.timers.push(confirmationTimer);
      return;
    }

    if (transition.shouldReport) {
      cancelConfirmation();
      const evidence = buildEvidence(monitor, triggerReason, inspection, transition, now);
      reportWhiteScreenError(monitor, {
        type: 'white-screen',
        // 触发原因和确认次数放在 evidence 中，消息保持稳定以便同一路由白屏正确聚合。
        message: 'White screen detected after consecutive confirmations',
        timestamp: now,
        url: window.location.href,
        evidence
      });

      if (recoveryTimer === null) {
        recoveryTimer = setInterval(() => performWhiteScreenCheck('恢复检测'), recoveryInterval);
        monitor.timers.push(recoveryTimer);
      }
      return;
    }

    if (transition.shouldReportRecovery) {
      cancelConfirmation();
      stopRecoveryMonitoring();
      reportWhiteScreenRecovery(monitor, transition, inspection);
      return;
    }

    if (transition.status === 'normal' || transition.status === 'transient') {
      cancelConfirmation();
    }
  };

  const loadHandler = () => {
    const timer = setTimeout(() => performWhiteScreenCheck('页面加载完成'), 2000);
    monitor.timers.push(timer);
  };

  if (document.readyState === 'complete') loadHandler();
  else {
    window.addEventListener('load', loadHandler);
    monitor.whiteScreenHandlers.push(['load', loadHandler]);
  }

  let lastUrl = location.href;
  const routeCheckTimer = setInterval(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      const timer = setTimeout(() => performWhiteScreenCheck('SPA路由变化'), 1500);
      monitor.timers.push(timer);
    }
  }, 500);
  monitor.timers.push(routeCheckTimer);

  const observer = new MutationObserver(mutations => {
    const shouldCheck = mutations.some(mutation => {
      const target = mutation.target;
      if (mutation.type === 'childList') {
        return mutation.removedNodes.length > 3 &&
          (target.id === 'app' || target.id === 'root' || target === document.body);
      }
      return mutation.type === 'attributes' && mutation.attributeName === 'style' &&
        (target.id === 'app' || target.id === 'root' || target.classList?.contains('container'));
    });

    if (shouldCheck) {
      const timer = setTimeout(() => performWhiteScreenCheck('DOM结构变化'), 300);
      monitor.timers.push(timer);
    }
  });

  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, attributes: true, subtree: true });
    monitor.whiteScreenObserver = observer;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
}

export async function reportWhiteScreenError(monitor, error) {
  const breadcrumbs = buildBreadcrumbs(monitor.userActions, 20);
  const item = createReportItem(
    monitor,
    'white_screen',
    error.message,
    error.timestamp,
    error.evidence,
    breadcrumbs
  );
  return sendWhiteScreenReport(monitor, item, {
    ...error,
    project: monitor.options.project,
    env: monitor.options.env,
    userId: item.userId,
    breadcrumbs
  });
}

export async function reportWhiteScreenRecovery(monitor, recovery, inspection) {
  const timestamp = recovery.recoveredAt;
  const message = `White screen recovered after ${recovery.duration}ms`;
  const expand = {
    incidentId: recovery.incidentId,
    suspectedAt: recovery.suspectedAt,
    recoveredAt: recovery.recoveredAt,
    duration: recovery.duration,
    recoveryInspection: inspection
  };
  const item = createReportItem(monitor, 'white_screen_recovery', message, timestamp, expand);
  return sendWhiteScreenReport(monitor, item, {
    type: 'white-screen-recovery',
    message,
    timestamp,
    expand,
    project: monitor.options.project,
    env: monitor.options.env,
    userId: item.userId
  });
}
