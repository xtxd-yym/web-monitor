// 畸形 Cookie 编码应按未登录处理，避免 decodeURIComponent 异常变成 500。
function parseCookieToken(req, cookieName) {
    const raw = req.headers.cookie || '';
    const prefix = cookieName + '=';
    const match = raw.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    if (!match) return null;
    try {
        return decodeURIComponent(match.slice(prefix.length));
    } catch {
        return null;
    }
}

module.exports = { parseCookieToken };
