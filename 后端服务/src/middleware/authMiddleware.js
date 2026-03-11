/**
 * JWT 鉴权中间件
 * 从 HttpOnly Cookie 中读取 Token 并验证
 * 验证通过后将 payload 挂到 req.user
 */

const jwt = require('jsonwebtoken');
const serverConfig = require('../config/server');

/**
 * 以下路径豁免鉴权（SDK 调用 / 公开接口）
 */
const PUBLIC_PATHS = [
    { method: 'POST', path: '/api/auth/login' },
    { method: 'POST', path: '/api/errors/report' },
    { method: 'GET', path: '/api/config' },
    { method: 'GET', path: '/health' },
    { method: 'HEAD', path: '/health' },   // K8s 健康检查用 HEAD
    { method: 'POST', path: '/wczj/alarm/report' },
    { method: 'GET', path: '/wczj/monitor/config' },
];

function isPublic(req) {
    return PUBLIC_PATHS.some(rule =>
        rule.method === req.method && req.path === rule.path
    );
}

/**
 * 从请求 Cookie 头中解析指定名称的 Token（不依赖 cookie-parser）
 */
function parseCookieToken(req) {
    const raw = req.headers.cookie || '';
    const name = serverConfig.auth.cookieName;
    const match = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

module.exports = function authMiddleware(req, res, next) {
    // 公开路径直接放行
    if (isPublic(req)) return next();

    const token = parseCookieToken(req);
    if (!token) {
        return res.status(401).json({ success: false, msg: '未登录，请先登录管理后台' });
    }

    try {
        req.user = jwt.verify(token, serverConfig.auth.jwtSecret);
        next();
    } catch (e) {
        return res.status(401).json({ success: false, msg: 'Token 已过期，请重新登录' });
    }
};
