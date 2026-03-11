/**
 * 数据脱敏工具
 * 用于保护隐私数据，防止敏感信息泄露
 */

/**
 * 敏感URL参数列表（关键词匹配，不区分大小写）
 */
const SENSITIVE_PARAMS = [
    'password', 'pwd', 'passwd',
    'token', 'access_token', 'refresh_token', 'auth_token',
    'secret', 'api_key', 'apikey', 'key',
    'phone', 'mobile', 'tel', 'telephone',
    'idcard', 'id_card', 'identitycard',
    'bankcard', 'bank_card', 'cardno',
    'email', 'mail'
];

/**
 * 敏感JSON字段（精确匹配或模糊匹配）
 */
const SENSITIVE_FIELDS = [
    'password', 'pwd', 'passwd',
    'token', 'accessToken', 'refreshToken',
    'secret', 'apiKey', 'privateKey',
    'phone', 'mobile', 'phoneNumber',
    'idCard', 'identityCard', 'idNumber',
    'bankCard', 'bankCardNo', 'cardNumber',
    'address', 'detailAddress',
    'email'
];

/**
 * 脱敏URL参数
 * @param {string} url - 原始URL
 * @returns {string} 脱敏后的URL
 */
export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return url;

    try {
        const urlObj = new URL(url);
        const params = urlObj.searchParams;

        // 遍历所有参数
        params.forEach((value, key) => {
            if (isSensitiveParam(key)) {
                params.set(key, maskValue(key, value));
            }
        });

        return urlObj.toString();
    } catch (e) {
        // URL解析失败，尝试正则替换
        return sanitizeUrlByRegex(url);
    }
}

/**
 * 通过正则表达式脱敏URL（fallback方案）
 */
function sanitizeUrlByRegex(url) {
    SENSITIVE_PARAMS.forEach(param => {
        // 匹配 ?param=value 或 &param=value
        const regex = new RegExp(`([?&]${param}=)([^&]+)`, 'gi');
        url = url.replace(regex, '$1***');
    });
    return url;
}

/**
 * 判断参数名是否敏感
 */
function isSensitiveParam(paramName) {
    const lower = paramName.toLowerCase();
    return SENSITIVE_PARAMS.some(sensitive =>
        lower.includes(sensitive)
    );
}

/**
 * 判断字段名是否敏感
 */
function isSensitiveField(fieldName) {
    const lower = fieldName.toLowerCase();
    return SENSITIVE_FIELDS.some(sensitive =>
        lower.includes(sensitive)
    );
}

/**
 * 根据类型脱敏值
 */
function maskValue(key, value) {
    const lower = key.toLowerCase();

    // 密码、token类 - 完全隐藏
    if (lower.includes('password') || lower.includes('token') ||
        lower.includes('secret') || lower.includes('key')) {
        return '***';
    }

    // 手机号 - 保留前3后4
    if (lower.includes('phone') || lower.includes('mobile')) {
        return maskPhone(value);
    }

    // 身份证 - 保留前4后2
    if (lower.includes('idcard') || lower.includes('identity')) {
        return maskIdCard(value);
    }

    // 银行卡 - 保留前4后4
    if (lower.includes('bank') || lower.includes('card')) {
        return maskBankCard(value);
    }

    // 邮箱 - 保留部分
    if (lower.includes('email') || lower.includes('mail')) {
        return maskEmail(value);
    }

    // 默认 - 完全隐藏
    return '***';
}

/**
 * 脱敏手机号: 138****8000
 */
function maskPhone(phone) {
    if (!phone || phone.length < 7) return '***';
    const str = String(phone);
    if (str.length === 11) {
        return str.substr(0, 3) + '****' + str.substr(7);
    }
    return str.substr(0, 3) + '****' + str.substr(-4);
}

/**
 * 脱敏身份证: 1101**********34
 */
function maskIdCard(idCard) {
    if (!idCard || idCard.length < 6) return '***';
    const str = String(idCard);
    if (str.length === 18) {
        return str.substr(0, 4) + '**********' + str.substr(16);
    }
    return str.substr(0, 4) + '******' + str.substr(-2);
}

/**
 * 脱敏银行卡: 6222**********90
 */
function maskBankCard(card) {
    if (!card || card.length < 8) return '***';
    const str = String(card);
    return str.substr(0, 4) + '*'.repeat(str.length - 8) + str.substr(-4);
}

/**
 * 脱敏邮箱: z***@example.com
 */
function maskEmail(email) {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    return local.substr(0, 1) + '***@' + domain;
}

/**
 * 脱敏请求体
 * @param {any} body - 请求体（可能是对象、字符串、FormData等）
 * @returns {any} 脱敏后的请求体
 */
export function sanitizeRequestBody(body) {
    if (!body) return body;

    // JSON对象
    if (typeof body === 'object' && !Array.isArray(body)) {
        return sanitizeObject(body);
    }

    // JSON字符串
    if (typeof body === 'string') {
        try {
            const obj = JSON.parse(body);
            const sanitized = sanitizeObject(obj);
            return JSON.stringify(sanitized);
        } catch (e) {
            // 不是JSON，尝试表单数据
            return sanitizeFormData(body);
        }
    }

    return body;
}

/**
 * 脱敏对象（递归）
 */
function sanitizeObject(obj, depth = 0) {
    if (depth > 10) return obj; // 防止循环引用
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};

    for (const [key, value] of Object.entries(obj)) {
        if (isSensitiveField(key)) {
            // 敏感字段脱敏
            result[key] = maskValue(key, value);
        } else if (typeof value === 'object' && value !== null) {
            // 递归处理嵌套对象
            if (Array.isArray(value)) {
                result[key] = value.map(item =>
                    typeof item === 'object' ? sanitizeObject(item, depth + 1) : item
                );
            } else {
                result[key] = sanitizeObject(value, depth + 1);
            }
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * 脱敏表单数据（a=1&b=2格式）
 */
function sanitizeFormData(formStr) {
    return formStr.split('&').map(pair => {
        const [key, value] = pair.split('=');
        if (isSensitiveParam(key)) {
            return `${key}=***`;
        }
        return pair;
    }).join('&');
}

/**
 * 脱敏堆栈信息
 * @param {string} stack - 错误堆栈
 * @returns {string} 脱敏后的堆栈
 */
export function sanitizeStack(stack) {
    if (!stack || typeof stack !== 'string') return stack;

    // 替换本地文件路径 - Windows
    // file:///C:/Users/zhangsan/... → [FILE_PATH]/...
    let cleaned = stack.replace(
        /file:\/\/\/[A-Z]:\/Users\/[^\/]+\//gi,
        '[FILE_PATH]/'
    );

    // 替换其他本地路径 - Windows
    cleaned = cleaned.replace(
        /file:\/\/\/[A-Z]:\/[^:]+:/gi,
        match => match.replace(/\/[^\/]+\//, '/[USER]/')
    );

    // 移除可能包含用户名的路径 - Unix
    cleaned = cleaned.replace(
        /\/Users\/[^\/]+\//g,
        '/[USER]/'
    );

    // 移除可能包含用户名的路径 - Windows
    cleaned = cleaned.replace(
        /\\Users\\[^\\]+\\/g,
        '\\[USER]\\'
    );

    // 替换home目录
    cleaned = cleaned.replace(
        /\/home\/[^\/]+\//g,
        '/[USER]/'
    );

    return cleaned;
}

/**
 * 完整脱敏错误对象
 * @param {Object} error - 错误对象
 * @returns {Object} 脱敏后的错误对象
 */
export function sanitizeError(error) {
    const sanitized = { ...error };

    // 脱敏URL
    if (sanitized.url) {
        sanitized.url = sanitizeUrl(sanitized.url);
    }

    // 脱敏资源URL
    if (sanitized.resource) {
        sanitized.resource = sanitizeUrl(sanitized.resource);
    }

    // 脱敏网络请求URL
    if (sanitized.data && sanitized.data.url) {
        sanitized.data.url = sanitizeUrl(sanitized.data.url);
    }

    // 脱敏请求体
    if (sanitized.data && sanitized.data.body) {
        sanitized.data.body = sanitizeRequestBody(sanitized.data.body);
    }

    // 脱敏响应体（如果包含）
    if (sanitized.data && sanitized.data.response) {
        sanitized.data.response = sanitizeRequestBody(sanitized.data.response);
    }

    // 脱敏堆栈
    if (sanitized.stack) {
        sanitized.stack = sanitizeStack(sanitized.stack);
    }

    // 脱敏文件名
    if (sanitized.filename) {
        sanitized.filename = sanitizeStack(sanitized.filename);
    }

    return sanitized;
}
