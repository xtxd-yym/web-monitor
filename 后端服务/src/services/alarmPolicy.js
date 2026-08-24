const MIN_L1_THRESHOLD = 2;

function normalizeLevel(level) {
    return typeof level === 'string' && level.trim()
        ? level.trim().toUpperCase()
        : 'L1';
}

function normalizeThreshold(threshold) {
    const parsed = Number.parseInt(threshold, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function resolveEffectiveThreshold(threshold, level) {
    const normalizedThreshold = normalizeThreshold(threshold);
    return normalizeLevel(level) === 'L1'
        ? Math.max(normalizedThreshold, MIN_L1_THRESHOLD)
        : normalizedThreshold;
}

function validateAlarmRule({ threshold, level }) {
    const parsedThreshold = Number.parseInt(threshold, 10);
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1) {
        throw new Error('告警阈值必须为大于等于 1 的整数');
    }

    if (normalizeLevel(level) === 'L1' && parsedThreshold < MIN_L1_THRESHOLD) {
        throw new Error(`L1 告警阈值不得小于 ${MIN_L1_THRESHOLD}，避免单次异常直接触发最高级别告警`);
    }
}

function buildAlarmAggregationScope(errorData) {
    return {
        project: errorData.project || '',
        env: errorData.env || '',
        type: errorData.type || '',
        fingerprint: errorData.fingerprint || '',
        appkey: errorData.appkey || '',
        customer_name: errorData.customer_name || '',
        service_name: errorData.service_name || ''
    };
}

module.exports = {
    MIN_L1_THRESHOLD,
    buildAlarmAggregationScope,
    normalizeLevel,
    resolveEffectiveThreshold,
    validateAlarmRule
};
