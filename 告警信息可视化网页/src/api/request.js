import { ElMessage } from 'element-plus';
import router from '../router/index.js';
import { createHttpClient } from './http-client.js';

function handleRequestError(error) {
    // 401：未登录或 Token 过期
    if (error.response?.status === 401) {
        // 登录接口本身返回 401（密码错误），交由 Login.vue 自行处理，不走全局跳转
        const url = error.config?.url || '';
        if (url.includes('/auth/login')) return;

        // 其他接口 401 → 清除登录态，用 Vue Router 软跳转（避免硬刷新导致 404）
        localStorage.removeItem('monitor_logged_in');
        ElMessage({ message: '登录已过期，请重新登录', type: 'warning', duration: 3000 });
        router.push('/login');
        return;
    }

    console.error(error);
    ElMessage({
        message: error.message,
        type: 'error',
        duration: 5 * 1000
    });
}

const client = createHttpClient({
    baseURL: '/api',
    timeout: 10000,
    credentials: 'include',
    onError: handleRequestError
});

function handleBusinessResponse(response) {
    if (response?.success === false) {
        const message = response.msg || 'Error';
        ElMessage({ message, type: 'error', duration: 5 * 1000 });
        throw new Error(message);
    }
    return response;
}

const transform = promise => promise.then(handleBusinessResponse);
const service = config => transform(client(config));

service.request = config => transform(client.request(config));
service.get = (url, config) => transform(client.get(url, config));
service.delete = (url, config) => transform(client.delete(url, config));
service.post = (url, data, config) => transform(client.post(url, data, config));
service.put = (url, data, config) => transform(client.put(url, data, config));
service.patch = (url, data, config) => transform(client.patch(url, data, config));

export default service;
