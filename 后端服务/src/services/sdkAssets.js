const SDK_PUBLIC_PATHS = Object.freeze([
    '/monitor-sdk',
    '/api/monitor-sdk'
]);

function setSdkAssetHeaders(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (filePath.endsWith('sdk-manifest.json') || filePath.endsWith('monitor-loader.js')) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}

module.exports = {
    SDK_PUBLIC_PATHS,
    setSdkAssetHeaders
};
