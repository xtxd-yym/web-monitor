/**
 * 将 SDK 内部 userActions 转换为后端面包屑格式。
 */
export function buildBreadcrumbs(userActions, limit = 30) {
  if (!userActions || userActions.length === 0) return [];

  return userActions.slice(-limit).map(action => {
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
      category: action.type || '',
      message,
      data: {
        element: action.element,
        className: action.className,
        id: action.id,
        x: action.x,
        y: action.y,
        scrollX: action.scrollX,
        scrollY: action.scrollY,
        width: action.width,
        height: action.height,
        state: action.state,
        url: action.url
      },
      timestamp: action.timestamp || 0
    };
  });
}

export function getRecentRelatedErrors(monitor, since, now = Date.now()) {
  return (monitor.recentErrors || []).filter(error =>
    error.timestamp >= since && error.timestamp <= now
  );
}
