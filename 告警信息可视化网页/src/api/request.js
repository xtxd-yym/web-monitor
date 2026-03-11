
import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '../router/index.js';

// 创建 axios 实例
const service = axios.create({
    baseURL: '/api',
    timeout: 10000,
    // HttpOnly Cookie 方案：必须开启，否则浏览器不会随请求携带 Cookie
    withCredentials: true
});

// request 拦截器
service.interceptors.request.use(
    config => {
        return config;
    },
    error => {
        console.log(error);
        return Promise.reject(error);
    }
);

// response 拦截器
service.interceptors.response.use(
    response => {
        const res = response.data;
        if (res.success === false) {
            ElMessage({
                message: res.msg || 'Error',
                type: 'error',
                duration: 5 * 1000
            });
            return Promise.reject(new Error(res.msg || 'Error'));
        } else {
            return res;
        }
    },
    error => {
        // 401：未登录或 Token 过期
        if (error.response?.status === 401) {
            // 登录接口本身返回 401（密码错误），交由 Login.vue 自行处理，不走全局跳转
            const url = error.config?.url || '';
            if (url.includes('/auth/login')) {
                return Promise.reject(error);
            }

            // 其他接口 401 → 清除登录态，用 Vue Router 软跳转（避免硬刷新导致 404）
            localStorage.removeItem('monitor_logged_in');
            ElMessage({ message: '登录已过期，请重新登录', type: 'warning', duration: 3000 });
            router.push('/login');
            return Promise.reject(error);
        }

        console.log('err' + error);
        ElMessage({
            message: error.message,
            type: 'error',
            duration: 5 * 1000
        });
        return Promise.reject(error);
    }
);

export default service;
