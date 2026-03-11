const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require('source-map');

class SourceMapService {
    constructor(sourceMapDir) {
        this.consumers = new Map();
        // 支持从配置传入路径，环境变量 SOURCEMAP_DIR 优先
        this.sourceMapDir = process.env.SOURCEMAP_DIR || sourceMapDir || path.resolve(__dirname, '../../sourcemaps');
        console.log(`[SourceMap] 初始化，目录: ${this.sourceMapDir}`);
    }

    /**
     * 获取 SourceMapConsumer 实例
     * 目录结构：{sourceMapDir}/{appkey}/{fileName}
     * 兼容逻辑：若按 appkey 目录找不到，则直接在 sourceMapDir 根目录下查找
     *
     * @param {string} fileName - map 文件名 (e.g., 'monitor.min.js.map')
     * @param {string} appkey - 业务组件的唯一标识，用于区分不同客户的构建产物
     */
    async getConsumer(fileName, appkey) {
        const cacheKey = appkey ? `${appkey}/${fileName}` : fileName;
        if (this.consumers.has(cacheKey)) {
            return this.consumers.get(cacheKey);
        }

        // 候选路径列表：优先按 appkey 子目录查找，兜底用根目录
        const candidatePaths = [];
        if (appkey) {
            candidatePaths.push(path.join(this.sourceMapDir, appkey, fileName));
        }
        candidatePaths.push(path.join(this.sourceMapDir, fileName));

        for (const mapPath of candidatePaths) {
            try {
                if (!fs.existsSync(mapPath)) {
                    console.warn(`[SourceMap] Map 文件不存在，跳过: ${mapPath}`);
                    continue;
                }

                console.log(`[SourceMap] 加载 Map 文件: ${mapPath}`);
                const rawSourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
                const consumer = await new SourceMapConsumer(rawSourceMap);
                this.consumers.set(cacheKey, consumer);
                return consumer;
            } catch (error) {
                console.error(`[SourceMap] 加载 Map 文件失败: ${mapPath}`, error);
            }
        }

        console.warn(`[SourceMap] 未找到 appkey=${appkey} 的 Map 文件: ${fileName}`);
        return null;
    }

    /**
     * 解析堆栈信息
     * @param {string} stack - 原始堆栈字符串
     * @param {string} appkey - 业务组件 appkey，用于定位对应的 sourcemap 文件
     * @returns {string} 解析后的堆栈字符串
     */
    async parseStack(stack, appkey) {
        if (!stack) return '';

        const lines = stack.split('\n');
        const parsedLines = [];

        for (const line of lines) {
            // 匹配堆栈行: at functionName (url:line:column) 或 at url:line:column
            const match = line.match(/at\s+(.+)?\s?\(?((?:http|https|file):\/\/[^:]+):(\d+):(\d+)\)?/);

            if (match) {
                const [fullMatch, funcName, url, lineNo, colNo] = match;

                // 提取文件名 (e.g. http://localhost:8080/js/app.123.js -> app.123.js)
                let fileName = '';
                try {
                    const urlObj = new URL(url);
                    fileName = path.basename(urlObj.pathname);
                } catch (e) {
                    fileName = path.basename(url);
                }

                // 忽略非 JS 文件或没有文件名的
                if (!fileName || !fileName.endsWith('.js')) {
                    parsedLines.push(line);
                    continue;
                }

                // 对应 Map 文件名
                const mapFileName = `${fileName}.map`;
                console.log(`[SourceMap] 查找 Map: ${mapFileName}，appkey: ${appkey}`);

                // 按 appkey 查找 consumer
                const consumer = await this.getConsumer(mapFileName, appkey);

                if (consumer) {
                    try {
                        const originalPos = consumer.originalPositionFor({
                            line: parseInt(lineNo),
                            column: parseInt(colNo)
                        });

                        if (originalPos.source) {
                            const sourceFile = originalPos.source.replace('webpack:///', '');
                            const parsedLine = `    at ${originalPos.name || funcName || '?'} (${sourceFile}:${originalPos.line}:${originalPos.column})`;
                            parsedLines.push(parsedLine);
                            console.log(`[SourceMap] 解析成功: ${fileName}:${lineNo} -> ${sourceFile}:${originalPos.line}`);
                            continue;
                        }
                    } catch (e) {
                        console.warn('[SourceMap] 解析行失败:', line, e);
                    }
                }
            }
            // 无法解析时保留原始行
            parsedLines.push(line);
        }

        return parsedLines.join('\n');
    }

    /**
     * 清除缓存
     */
    clearCache() {
        if (this.consumers) {
            this.consumers.clear();
            console.log('[SourceMap] 缓存已清除');
        }
    }
}

module.exports = SourceMapService;
