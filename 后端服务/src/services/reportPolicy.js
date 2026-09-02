const crypto = require('crypto');

const NETWORK_ERROR_TYPES = new Set([
    'network',
    'network-error',
    'network-xhr',
    'network-xhr-error',
    'network-xhr-timeout',
    'network-xhr-abort',
    'network-fetch',
    'cors'
]);

const VOLATILE_QUERY_PARAMS = new Set([
    '_',
    '_abfpc',
    'cacheBust',
    'cache_bust',
    't',
    'timestamp',
    'ts'
]);

function isNetworkErrorType(type) {
    return NETWORK_ERROR_TYPES.has(type);
}

function resolveSamplingRate(config, type) {
    const rates = config?.config?.samplingRates || {};
    if (typeof rates[type] === 'number') return rates[type];
    if (isNetworkErrorType(type) && typeof rates.network === 'number') return rates.network;
    return null;
}

function resolveServerDropReason(config, type) {
    if (!config) return null;
    if (config.enabled === false || config.emergency?.closeMonitor) return 'monitor_disabled';

    const options = config.config || {};
    if (type === 'resource' && (
        options.enableResourceErrors === false ||
        options.reportResourceErrors === false
    )) return 'resource_disabled';

    if (type === 'promise' && options.enablePromiseRejection === false) {
        return 'promise_disabled';
    }

    if (type === 'javascript' && options.enableErrorMonitoring === false) {
        return 'javascript_disabled';
    }

    if (isNetworkErrorType(type)) {
        if (options.enableNetworkMonitoring === false) return 'network_disabled';
        if (type === 'network-fetch' && options.enableFetchMonitoring === false) {
            return 'network_fetch_disabled';
        }
        if (type.startsWith('network-xhr') && options.enableXHRMonitoring === false) {
            return 'network_xhr_disabled';
        }
    }

    return resolveSamplingRate(config, type) === 0 ? 'sampling_rate_zero' : null;
}

function extractTargetUrl(error = {}) {
    const structuredUrl = error.context?.targetUrl || error.data?.url || error.resource || error.targetUrl;
    if (structuredUrl) return String(structuredUrl);

    const message = String(error.message || '');
    const requestUrlMatch = message.match(/请求URL:\s*(https?:\/\/[^\s|]+)/i);
    if (requestUrlMatch) return requestUrlMatch[1].replace(/[)'"，。]+$/, '');

    const quotedUrlMatch = message.match(/'(https?:\/\/[^']+)'/i);
    return quotedUrlMatch ? quotedUrlMatch[1] : '';
}

function normalizeFingerprintUrl(rawUrl, type) {
    if (!rawUrl) return '';
    try {
        const url = new URL(String(rawUrl));
        url.hash = '';
        if (type === 'resource') {
            url.search = '';
            return url.href;
        }
        for (const key of [...url.searchParams.keys()]) {
            if (VOLATILE_QUERY_PARAMS.has(key)) url.searchParams.delete(key);
        }
        url.searchParams.sort();
        return url.href;
    } catch (_) {
        return String(rawUrl).replace(/[?#].*$/, '');
    }
}

function normalizeMessage(message) {
    return String(message || '')
        .replace(/after \d+ms/g, 'after Xms')
        .replace(/\(actual: \d+ms\)/g, '(actual: Xms)')
        .replace(/(?:请求)?耗时:\s*\d+ms/g, '耗时: Xms')
        .replace(/\d+ms内/g, 'Xms内');
}

function generateFingerprint(error = {}) {
    const type = error.type || 'unknown';
    let identity;

    if (type === 'resource' || isNetworkErrorType(type)) {
        identity = [
            type,
            String(error.context?.method || error.method || error.data?.method || '').toUpperCase(),
            normalizeFingerprintUrl(extractTargetUrl(error), type),
            error.context?.status ?? error.status ?? error.data?.status ?? '',
            error.context?.errorType || error.errorType || error.data?.errorType || '',
            error.filename || '',
            error.lineno || 0
        ].join('|');
    } else {
        identity = [
            type,
            normalizeMessage(error.message),
            error.filename || '',
            error.lineno || 0
        ].join('|');
    }

    return crypto.createHash('md5').update(identity).digest('hex');
}

module.exports = {
    generateFingerprint,
    isNetworkErrorType,
    normalizeFingerprintUrl,
    resolveSamplingRate,
    resolveServerDropReason
};
