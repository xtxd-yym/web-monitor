// 同一个请求错误最多提示一次，页面调用 report 处理本地错误时也不会重复 toast。
export function createErrorFeedback(notify) {
    const reportedErrors = new WeakSet();

    return function report(error, fallback = '请求失败', type = 'error') {
        const trackable = error !== null && (typeof error === 'object' || typeof error === 'function');
        if (trackable && reportedErrors.has(error)) return;
        if (trackable) reportedErrors.add(error);

        const message = error?.response?.data?.msg || error?.message || fallback;
        notify({ message, type, duration: type === 'warning' ? 3000 : 5000 });
    };
}
