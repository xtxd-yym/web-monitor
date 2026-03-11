
import { createRouter, createWebHistory } from 'vue-router';

// 懒加载组件
const Login = () => import('../views/Login.vue');
const Home = () => import('../views/Home.vue');
const MainLayout = () => import('../components/MainLayout.vue');

const Dashboard = () => import('../views/Dashboard.vue');
const ErrorLog = () => import('../views/ErrorList.vue');
const AlarmList = () => import('../views/AlarmList.vue');
const IndexMonitor = () => import('../views/IndexMonitor.vue');
const InstanceMonitor = () => import('../views/InstanceMonitor.vue');
const DataManagement = () => import('../views/DataManagement.vue');
const ConfigManagement = () => import('../views/ConfigManagement.vue');

const routes = [
    {
        path: '/login',
        name: 'Login',
        component: Login,
        meta: { title: '登录', requiresAuth: false }
    },
    {
        path: '/',
        name: 'Home',
        component: Home,
        meta: { title: '首页', requiresAuth: false }
    },
    {
        path: '/console',
        component: MainLayout,
        redirect: '/console/dashboard',
        meta: { requiresAuth: true },
        children: [
            {
                path: 'dashboard',
                name: 'Dashboard',
                component: Dashboard,
                meta: { title: '监控概览', icon: 'Odometer', requiresAuth: true }
            },
            {
                path: 'alarm',
                name: 'AlarmList',
                component: AlarmList,
                meta: { title: '告警记录', icon: 'Warning', requiresAuth: true }
            },
            {
                path: 'error',
                name: 'ErrorLog',
                component: ErrorLog,
                meta: { title: '错误日志', icon: 'Document', requiresAuth: true }
            },
            {
                path: 'index',
                name: 'IndexMonitor',
                component: IndexMonitor,
                meta: { title: '指标监控', icon: 'DataLine', requiresAuth: true }
            },
            {
                path: 'instance',
                name: 'InstanceMonitor',
                component: InstanceMonitor,
                meta: { title: '实例监控', icon: 'Monitor', requiresAuth: true }
            },
            {
                path: 'data',
                name: 'DataManagement',
                component: DataManagement,
                meta: { title: '数据管理', icon: 'Edit', requiresAuth: true }
            },
            {
                path: 'config',
                name: 'ConfigManagement',
                component: ConfigManagement,
                meta: { title: 'Config管理', icon: 'Setting', requiresAuth: true }
            }
        ]
    }
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
});

// 全局路由守卫
router.beforeEach((to, from, next) => {
    const isLoggedIn = !!localStorage.getItem('monitor_logged_in');

    if (to.meta.requiresAuth && !isLoggedIn) {
        // 需要鉴权但未登录 → 跳到登录页
        next({ path: '/login', query: { redirect: to.fullPath } });
    } else if (to.path === '/login' && isLoggedIn) {
        // 已登录不允许访问登录页 → 跳到控制台
        next('/console/dashboard');
    } else {
        next();
    }
});

export default router;
