const DEFAULT_SAMPLING_RATE = 1.0;
const DEFAULT_DEDUPLICATION_WINDOW = 5 * 60 * 1000;

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

function isValidSamplingRate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function firstValidSamplingRate(...values) {
  return values.find(isValidSamplingRate) ?? DEFAULT_SAMPLING_RATE;
}

export function isNetworkErrorType(errorType) {
  return NETWORK_ERROR_TYPES.has(errorType);
}

export function isUrlIgnored(url, patterns) {
  if (!url || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }

  const normalizedUrl = String(url);
  return patterns.some(pattern => {
    if (typeof pattern === 'string') {
      return pattern.length > 0 && normalizedUrl.includes(pattern);
    }

    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
      return pattern.test(normalizedUrl);
    }

    return false;
  });
}

export function resolveSamplingRate(samplingRates, errorType, defaultSamplingRate) {
  const rates = samplingRates && typeof samplingRates === 'object' ? samplingRates : {};
  const familyRate = isNetworkErrorType(errorType) ? rates.network : undefined;

  return firstValidSamplingRate(
    rates[errorType],
    familyRate,
    defaultSamplingRate,
    DEFAULT_SAMPLING_RATE
  );
}

export function resolveDeduplicationWindow(options = {}) {
  const milliseconds = options.deduplicationWindow;
  if (typeof milliseconds === 'number' && Number.isFinite(milliseconds) && milliseconds >= 0) {
    return milliseconds;
  }

  const seconds = options.dedupeWindow;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  return DEFAULT_DEDUPLICATION_WINDOW;
}

export function isErrorTypeEnabled(options, errorType) {
  if (errorType === 'resource') {
    return options.enableResourceErrors !== false && options.reportResourceErrors !== false;
  }

  if (errorType === 'promise') {
    return options.enablePromiseRejection !== false;
  }

  if (errorType === 'network-fetch') {
    return options.enableNetworkMonitoring !== false && options.enableFetchMonitoring !== false;
  }

  if (errorType.startsWith('network-xhr')) {
    return options.enableNetworkMonitoring !== false && options.enableXHRMonitoring !== false;
  }

  if (isNetworkErrorType(errorType)) {
    return options.enableNetworkMonitoring !== false;
  }

  return true;
}

export function createConfigCacheKey(options = {}) {
  const apiParams = options.apiParams || {};
  const scope = [
    apiParams.appKey || apiParams.appkey || '',
    apiParams.customer_name || '',
    options.project || 'default',
    options.env || 'production'
  ];

  return `web_monitor_config:${scope.map(value => encodeURIComponent(String(value))).join(':')}`;
}
