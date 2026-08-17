const DEFAULT_TIMEOUT = 10000;

class HttpError extends Error {
    constructor(message, { response, config, code, cause } = {}) {
        super(message, cause ? { cause } : undefined);
        this.name = 'HttpError';
        this.response = response;
        this.config = config;
        this.code = code;
    }
}

function appendParams(url, params) {
    if (!params) return url;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        if (Array.isArray(value)) {
            value.forEach(item => searchParams.append(key, String(item)));
            return;
        }

        searchParams.append(key, String(value));
    });

    const query = searchParams.toString();
    if (!query) return url;

    const hashIndex = url.indexOf('#');
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
    const path = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    return `${path}${path.includes('?') ? '&' : '?'}${query}${hash}`;
}

function joinUrl(baseURL, url) {
    if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(url)) return url;
    return `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

async function parseResponse(response) {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function createBody(data, headers) {
    if (data === undefined || data === null) return undefined;

    if (data instanceof FormData) {
        // 浏览器会自动补充 multipart boundary，手工保留该请求头会导致上传失败。
        headers.delete('Content-Type');
        return data;
    }

    if (typeof data === 'string' || data instanceof Blob || data instanceof URLSearchParams) {
        return data;
    }

    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    return JSON.stringify(data);
}

export function createHttpClient({
    baseURL = '',
    timeout = DEFAULT_TIMEOUT,
    credentials = 'include',
    fetchImpl = globalThis.fetch,
    onError = () => {}
} = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new TypeError('fetchImpl must be a function');
    }

    const dispatch = async requestConfig => {
        const config = { ...requestConfig };
        const method = (config.method || 'GET').toUpperCase();
        const requestTimeout = config.timeout ?? timeout;
        const headers = new Headers(config.headers || {});
        const url = appendParams(joinUrl(baseURL, config.url), config.params);
        const controller = new AbortController();
        const externalSignal = config.signal;
        let timedOut = false;
        let timer;

        const abortFromExternalSignal = () => controller.abort(externalSignal.reason);
        if (externalSignal) {
            if (externalSignal.aborted) {
                abortFromExternalSignal();
            } else {
                externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
            }
        }

        if (requestTimeout > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, requestTimeout);
        }

        const normalizedConfig = { ...config, method, url: config.url };

        try {
            const response = await fetchImpl(url, {
                method,
                headers,
                body: method === 'GET' || method === 'HEAD' ? undefined : createBody(config.data, headers),
                credentials: config.credentials || credentials,
                signal: controller.signal
            });
            const data = await parseResponse(response);

            if (!response.ok) {
                throw new HttpError(`Request failed with status code ${response.status}`, {
                    response: { status: response.status, data, headers: response.headers },
                    config: normalizedConfig
                });
            }

            return data;
        } catch (error) {
            let normalizedError;

            if (error instanceof HttpError) {
                normalizedError = error;
            } else if (timedOut) {
                normalizedError = new HttpError(`timeout of ${requestTimeout}ms exceeded`, {
                    config: normalizedConfig,
                    code: 'ECONNABORTED',
                    cause: error
                });
            } else {
                const message = error instanceof Error ? error.message : 'Network Error';
                normalizedError = new HttpError(message, {
                    config: normalizedConfig,
                    code: externalSignal?.aborted ? 'ERR_CANCELED' : 'ERR_NETWORK',
                    cause: error instanceof Error ? error : undefined
                });
            }

            onError(normalizedError);
            throw normalizedError;
        } finally {
            if (timer) clearTimeout(timer);
            externalSignal?.removeEventListener('abort', abortFromExternalSignal);
        }
    };

    const client = config => dispatch(config);
    client.request = dispatch;
    client.get = (url, config = {}) => dispatch({ ...config, method: 'GET', url });
    client.delete = (url, config = {}) => dispatch({ ...config, method: 'DELETE', url, data: config.data });
    client.post = (url, data, config = {}) => dispatch({ ...config, method: 'POST', url, data });
    client.put = (url, data, config = {}) => dispatch({ ...config, method: 'PUT', url, data });
    client.patch = (url, data, config = {}) => dispatch({ ...config, method: 'PATCH', url, data });

    return client;
}
