/**
 * 环境判断工具
 */

/**
 * 检查当前是否为本地开发环境
 * @returns {boolean}
 */
export function isLocalEnv(monitor) {
  // 1. 优先读取业务方初始化 SDK 时传入的 env 配置（最准确）
  if (monitor && monitor.options && monitor.options.env) {
    const env = monitor.options.env.toLowerCase();
    if (env === 'development' || env === 'local' || env === 'dev') {
      return true;
    }
  }

  // 2. 检查全局的 process.env.NODE_ENV (兼容 Webpack 等构建工具自动注入的全局变量)
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
    const nodeEnv = process.env.NODE_ENV.toLowerCase();
    if (nodeEnv === 'development' || nodeEnv === 'local' || nodeEnv === 'dev') {
      return true;
    }
  }

  // 3. 极度安全的 URL 特征检查（仅限绝对本地环境）
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      window.location.protocol === 'file:'
      // [安全加固] 已删除 192.168.* 和 10.* 的拦截，防止误伤内网正式部署
    );
  }

  return false;
}
