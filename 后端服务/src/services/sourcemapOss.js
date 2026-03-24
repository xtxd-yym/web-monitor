/**
 * OSS 版 SourceMapService
 *
 * 与本地版 (sourcemap.js) 保持相同对外接口：
 *   - parseStack(stack, appkey)
 *   - clearCache()
 *
 * 额外新增（供管理接口调用）：
 *   - uploadFile(appkey, fileName, buffer)
 *   - listFiles(appkey)
 *   - deleteFile(appkey, fileName)
 *
 * OSS 对象路径约定：{appkey}/{fileName}.map
 */

const { Client } = require('minio');
const path = require('path');
const { SourceMapConsumer } = require('source-map');

class OssSourceMapService {
    /**
     * @param {object} ossConfig - { endpoint, accessKey, secretKey, bucket }
     */
    constructor(ossConfig) {
        const { endpoint, accessKey, secretKey, bucket } = ossConfig;

        // 解析 endpoint（可能含端口，如 oss.myhexin.com:7480）
        const [host, portStr] = endpoint.split(':');
        const port = portStr ? parseInt(portStr) : 80;

        this.bucket = bucket;
        this.consumers = new Map(); // 内存缓存

        this.minioClient = new Client({
            endPoint: host,
            port,
            useSSL: false,
            accessKey,
            secretKey,
        });

        console.log(`[OssSourceMap] 初始化完成，endpoint: ${endpoint}, bucket: ${bucket}`);
    }

    // ─────────────────────────────────────────
    // 内部辅助
    // ─────────────────────────────────────────

    /**
     * 从 OSS 下载对象并返回 Buffer
     * @private
     */
    _getObject(objectKey) {
        return new Promise((resolve, reject) => {
            let chunks = [];
            this.minioClient.getObject(this.bucket, objectKey, (err, dataStream) => {
                if (err) return reject(err);
                dataStream.on('data', chunk => chunks.push(chunk));
                dataStream.on('end', () => resolve(Buffer.concat(chunks)));
                dataStream.on('error', reject);
            });
        });
    }

    /**
     * 获取 SourceMapConsumer（带内存缓存）
     * @private
     */
    async _getConsumer(appkey, fileName) {
        const cacheKey = `${appkey}/${fileName}`;
        if (this.consumers.has(cacheKey)) {
            return this.consumers.get(cacheKey);
        }

        const objectKey = `${appkey}/${fileName}`;
        try {
            const buf = await this._getObject(objectKey);
            const rawSourceMap = JSON.parse(buf.toString('utf8'));
            const consumer = await new SourceMapConsumer(rawSourceMap);
            this.consumers.set(cacheKey, consumer);
            console.log(`[OssSourceMap] 已加载并缓存: ${objectKey}`);
            return consumer;
        } catch (err) {
            console.warn(`[OssSourceMap] 加载 Map 失败 (${objectKey}):`, err.message);
            return null;
        }
    }

    // ─────────────────────────────────────────
    // 与本地版相同的接口
    // ─────────────────────────────────────────

    /**
     * 解析堆栈信息
     * @param {string} stack - 原始堆栈字符串
     * @param {string} appkey - 业务组件 appkey
     * @returns {string} 解析后的堆栈字符串
     */
    async parseStack(stack, appkey) {
        if (!stack) return '';

        const lines = stack.split('\n');
        const parsedLines = [];

        for (const line of lines) {
            const match = line.match(/at\s+(.+)?\s?\(?((?:http|https|file):\/\/[^:]+):(\d+):(\d+)\)?/);

            if (match) {
                const [, funcName, url, lineNo, colNo] = match;

                let fileName = '';
                try {
                    const urlObj = new URL(url);
                    fileName = path.basename(urlObj.pathname);
                } catch {
                    fileName = path.basename(url);
                }

                if (!fileName || !fileName.endsWith('.js')) {
                    parsedLines.push(line);
                    continue;
                }

                // OSS 中对象名：{appkey}/{fileName}.map
                const mapFileName = `${fileName}.map`;
                const consumer = await this._getConsumer(appkey, mapFileName);

                if (consumer) {
                    try {
                        const originalPos = consumer.originalPositionFor({
                            line: parseInt(lineNo),
                            column: parseInt(colNo),
                        });

                        if (originalPos.source) {
                            const sourceFile = originalPos.source.replace('webpack:///', '');
                            parsedLines.push(`    at ${originalPos.name || funcName || '?'} (${sourceFile}:${originalPos.line}:${originalPos.column})`);
                            console.log(`[OssSourceMap] 解析成功: ${fileName}:${lineNo} -> ${sourceFile}:${originalPos.line}`);
                            continue;
                        }
                    } catch (e) {
                        console.warn('[OssSourceMap] 解析行失败:', line, e.message);
                    }
                }
            }

            parsedLines.push(line);
        }

        return parsedLines.join('\n');
    }

    /**
     * 清除内存缓存（与本地版同名方法）
     */
    clearCache() {
        this.consumers.clear();
        console.log('[OssSourceMap] 缓存已清除');
    }

    // ─────────────────────────────────────────
    // OSS 专有接口（供管理路由调用）
    // ─────────────────────────────────────────

    /**
     * 上传 .map 文件到 OSS
     * @param {string} appkey
     * @param {string} fileName - 例如 "app.js.map"（不含路径）
     * @param {Buffer} buffer
     * @returns {Promise<string>} 对象路径，例如 "my-appkey/app.js.map"
     */
    async uploadFile(appkey, fileName, buffer) {
        // 确保文件名末尾有 .map
        const safeFileName = fileName.endsWith('.map') ? fileName : `${fileName}.map`;
        const objectKey = `${appkey}/${safeFileName}`;

        await this.minioClient.putObject(this.bucket, objectKey, buffer, buffer.length, {
            'Content-Type': 'application/json',
        });

        // 上传后清除该文件的缓存，确保下次 parseStack 重新加载最新版本
        this.consumers.delete(objectKey);
        console.log(`[OssSourceMap] 上传成功: ${objectKey}`);
        return objectKey;
    }

    /**
     * 列出某 appkey 下的所有 .map 文件
     * @param {string} appkey
     * @returns {Promise<Array<{name, size, lastModified}>>}
     */
    listFiles(appkey) {
        const prefix = `${appkey}/`;
        return new Promise((resolve, reject) => {
            const results = [];
            const stream = this.minioClient.listObjects(this.bucket, prefix, false);
            stream.on('data', obj => {
                results.push({
                    name: obj.name.replace(prefix, ''), // 只保留文件名部分
                    size: obj.size,
                    lastModified: obj.lastModified,
                });
            });
            stream.on('end', () => resolve(results));
            stream.on('error', reject);
        });
    }

    /**
     * 删除指定文件
     * @param {string} appkey
     * @param {string} fileName
     */
    async deleteFile(appkey, fileName) {
        const objectKey = `${appkey}/${fileName}`;
        await this.minioClient.removeObject(this.bucket, objectKey);
        // 同时清除内存缓存
        this.consumers.delete(objectKey);
        console.log(`[OssSourceMap] 删除成功: ${objectKey}`);
    }
}

module.exports = OssSourceMapService;
