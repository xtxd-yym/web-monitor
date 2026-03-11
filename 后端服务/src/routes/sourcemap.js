/**
 * SourceMap 相关路由
 */

const express = require('express');
const router = express.Router();

module.exports = (sourcemapService) => {
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
                const position = await sourcemapService.parsePosition(
                    version,
                    filename,
                    parseInt(line),
                    parseInt(column)
                );
                result.position = position;
            }

            // 解析 stack
            if (stack) {
                const originalStack = await sourcemapService.parseStack(version, filename, stack);
                result.originalStack = originalStack;
            }

            // 获取源码片段
            if (line && result.position) {
                const snippet = await sourcemapService.getSourceSnippet(
                    version,
                    filename,
                    parseInt(line)
                );
                result.snippet = snippet;
            }

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('解析 SourceMap 失败:', error);
            res.status(500).json({
                success: false,
                msg: '解析 SourceMap 失败',
                error: error.message
            });
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
                return res.status(400).json({
                    success: false,
                    msg: '缺少必填参数: version, filename'
                });
            }

            const exists = sourcemapService.hasSourceMap(version, filename);

            res.json({
                success: true,
                data: {
                    exists,
                    version,
                    filename
                }
            });
        } catch (error) {
            console.error('检查 SourceMap 失败:', error);
            res.status(500).json({
                success: false,
                msg: '检查 SourceMap 失败',
                error: error.message
            });
        }
    });

    /**
     * POST /api/sourcemap/clear-cache
     * 清理 SourceMap 缓存
     */
    router.post('/clear-cache', async (req, res) => {
        try {
            sourcemapService.clearCache();

            res.json({
                success: true,
                msg: 'SourceMap 缓存已清理'
            });
        } catch (error) {
            console.error('清理缓存失败:', error);
            res.status(500).json({
                success: false,
                msg: '清理缓存失败',
                error: error.message
            });
        }
    });

    return router;
};
