/**
 * SourceMap 相关路由
 *
 * 原有接口（保持不变）：
 *   POST /api/sourcemap/parse       - 手动解析 SourceMap（调试用）
 *   GET  /api/sourcemap/check       - 检查 SourceMap 是否存在
 *   POST /api/sourcemap/clear-cache - 清理缓存
 *
 * 新增接口（OSS 管理）：
 *   POST /api/sourcemap/upload      - 上传 .map 文件到 OSS
 *   GET  /api/sourcemap/list        - 列出某 appkey 下的文件
 *   POST /api/sourcemap/delete      - 删除指定文件
 */

const express = require('express');
const multer  = require('multer');
const router  = express.Router();

// multer 使用内存存储，上传文件 buffer 直接传给 OssService
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 单文件上限 50 MB
    fileFilter(req, file, cb) {
        // 只允许 .map 文件
        if (!file.originalname.endsWith('.map')) {
            return cb(new Error('只允许上传 .map 文件'));
        }
        cb(null, true);
    },
});

module.exports = (sourcemapService) => {
    // ─────────────────────────────────────────
    // 原有接口
    // ─────────────────────────────────────────

    /**
     * POST /api/sourcemap/parse
     * 手动解析 SourceMap（用于调试）
     */
    router.post('/parse', async (req, res) => {
        try {
            const { version, filename, line, column, stack } = req.body;

            if (!version || !filename) {
                return res.status(400).json({
                    success: false,
                    msg: '缺少必填参数: version, filename'
                });
            }

            const result = {};

            // 解析位置
            if (line && column) {
                const position = await sourcemapService.parsePosition?.(
                    version,
                    filename,
                    parseInt(line),
                    parseInt(column)
                );
                result.position = position;
            }

            // 解析 stack
            if (stack) {
                const originalStack = await sourcemapService.parseStack(stack, version);
                result.originalStack = originalStack;
            }

            // 获取源码片段
            if (line && result.position) {
                const snippet = await sourcemapService.getSourceSnippet?.(
                    version,
                    filename,
                    parseInt(line)
                );
                result.snippet = snippet;
            }

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('解析 SourceMap 失败:', error);
            res.status(500).json({ success: false, msg: '解析 SourceMap 失败', error: error.message });
        }
    });

    /**
     * GET /api/sourcemap/check
     * 检查 SourceMap 是否存在
     */
    router.get('/check', async (req, res) => {
        try {
            const { version, filename } = req.query;

            if (!version || !filename) {
                return res.status(400).json({ success: false, msg: '缺少必填参数: version, filename' });
            }

            const exists = sourcemapService.hasSourceMap?.(version, filename) ?? false;
            res.json({ success: true, data: { exists, version, filename } });
        } catch (error) {
            console.error('检查 SourceMap 失败:', error);
            res.status(500).json({ success: false, msg: '检查 SourceMap 失败', error: error.message });
        }
    });

    /**
     * POST /api/sourcemap/clear-cache
     * 清理 SourceMap 缓存
     */
    router.post('/clear-cache', async (req, res) => {
        try {
            sourcemapService.clearCache();
            res.json({ success: true, msg: 'SourceMap 缓存已清理' });
        } catch (error) {
            console.error('清理缓存失败:', error);
            res.status(500).json({ success: false, msg: '清理缓存失败', error: error.message });
        }
    });

    // ─────────────────────────────────────────
    // 新增 OSS 管理接口
    // ─────────────────────────────────────────

    /**
     * POST /api/sourcemap/upload
     * 接收 multipart/form-data（字段：appkey + file）
     * 将 .map 文件写入 OSS
     */
    router.post('/upload', upload.single('file'), async (req, res) => {
        try {
            const { appkey } = req.body;
            const file = req.file;

            if (!appkey) {
                return res.status(400).json({ success: false, msg: '缺少必填参数: appkey' });
            }
            if (!file) {
                return res.status(400).json({ success: false, msg: '缺少上传文件 (字段名: file)' });
            }

            // 本地模式下不支持 uploadFile
            if (typeof sourcemapService.uploadFile !== 'function') {
                return res.status(501).json({
                    success: false,
                    msg: '当前为本地文件模式，不支持上传。请配置 OSS 环境变量后重启服务。'
                });
            }

            const key = await sourcemapService.uploadFile(appkey, file.originalname, file.buffer);
            res.json({ success: true, data: { key, size: file.size } });
        } catch (error) {
            console.error('上传 SourceMap 失败:', error);
            res.status(500).json({ success: false, msg: '上传失败', error: error.message });
        }
    });

    /**
     * GET /api/sourcemap/list?appkey=xxx
     * 列出某 appkey 下的所有 .map 文件
     */
    router.get('/list', async (req, res) => {
        try {
            const { appkey } = req.query;
            if (!appkey) {
                return res.status(400).json({ success: false, msg: '缺少必填参数: appkey' });
            }

            if (typeof sourcemapService.listFiles !== 'function') {
                return res.status(501).json({
                    success: false,
                    msg: '当前为本地文件模式，不支持文件列表。请配置 OSS 环境变量后重启服务。'
                });
            }

            const files = await sourcemapService.listFiles(appkey);
            res.json({ success: true, data: files });
        } catch (error) {
            console.error('列出 SourceMap 失败:', error);
            res.status(500).json({ success: false, msg: '列出文件失败', error: error.message });
        }
    });

    /**
     * POST /api/sourcemap/delete
     * 删除指定文件
     * Body: { appkey, fileName }
     */
    router.post('/delete', async (req, res) => {
        try {
            const { appkey, fileName } = req.body;
            if (!appkey || !fileName) {
                return res.status(400).json({ success: false, msg: '缺少必填参数: appkey, fileName' });
            }

            if (typeof sourcemapService.deleteFile !== 'function') {
                return res.status(501).json({
                    success: false,
                    msg: '当前为本地文件模式，不支持删除。请配置 OSS 环境变量后重启服务。'
                });
            }

            await sourcemapService.deleteFile(appkey, fileName);
            res.json({ success: true, msg: '删除成功' });
        } catch (error) {
            console.error('删除 SourceMap 失败:', error);
            res.status(500).json({ success: false, msg: '删除失败', error: error.message });
        }
    });

    return router;
};
