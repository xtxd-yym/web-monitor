/**
 * 鉴权路由
 * POST /api/auth/login  - 登录，签发 JWT 写入 HttpOnly Cookie
 * POST /api/auth/logout - 登出，清除 Cookie
 * GET  /api/auth/me     - 验证当前登录态
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const serverConfig = require('../config/server');

const router = express.Router();

/**
 * POST /api/auth/login
 * 登录接口，校验账号密码，成功后写入 HttpOnly Cookie
 */
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, msg: '请输入用户名和密码' });
    }

    const { auth } = serverConfig;
    if (username !== auth.username || password !== auth.password) {
        return res.status(401).json({ success: false, msg: '用户名或密码错误' });
    }

    // 签发 JWT
    const token = jwt.sign(
        { username, role: 'admin' },
        auth.jwtSecret,
        { expiresIn: auth.tokenExpire }
    );

    // 写入 HttpOnly Cookie（前端 JS 无法读取，防止 XSS 窃取）
    // COOKIE_SECURE=true 仅在 HTTPS 正式环境设置，测试环境（HTTP）保持 false
    const cookieSecure = process.env.COOKIE_SECURE === 'true';
    res.cookie(auth.cookieName, token, {
        httpOnly: true,               // JS 不可读
        secure: cookieSecure,         // 生产 HTTPS 时由运维设置 COOKIE_SECURE=true
        sameSite: 'lax',              // 防 CSRF
        maxAge: 24 * 60 * 60 * 1000  // 24 小时
    });

    return res.json({
        success: true,
        msg: '登录成功',
        data: { username }
    });
});

/**
 * POST /api/auth/logout
 * 登出，清除 Cookie
 */
router.post('/logout', (req, res) => {
    res.clearCookie(serverConfig.auth.cookieName);
    res.json({ success: true, msg: '已退出登录' });
});

/**
 * GET /api/auth/me
 * 验证当前登录态（前端路由守卫初始化时调用）
 */
router.get('/me', (req, res) => {
    const token = parseCookieToken(req);
    if (!token) {
        return res.status(401).json({ success: false, msg: '未登录' });
    }
    try {
        const payload = jwt.verify(token, serverConfig.auth.jwtSecret);
        res.json({ success: true, data: { username: payload.username } });
    } catch (e) {
        res.status(401).json({ success: false, msg: 'Token 已过期，请重新登录' });
    }
});

/**
 * 从请求中解析 Cookie Token（不依赖 cookie-parser）
 */
function parseCookieToken(req) {
    const raw = req.headers.cookie || '';
    const name = serverConfig.auth.cookieName;
    const match = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

module.exports = router;
