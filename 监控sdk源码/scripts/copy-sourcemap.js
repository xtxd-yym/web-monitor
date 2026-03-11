/**
 * SourceMap版本化脚本
 * 将构建生成的SourceMap按版本号存储
 */

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const version = packageJson.version;
const distDir = path.join(__dirname, '../dist');
const sourceMapFile = path.join(distDir, 'monitor.min.js.map');
const sourceMapDir = path.join(distDir, 'sourcemaps', version);

// 创建版本目录
if (!fs.existsSync(sourceMapDir)) {
    fs.mkdirSync(sourceMapDir, { recursive: true });
    console.log(`[SourceMap] Created directory: sourcemaps/${version}/`);
}

// 复制SourceMap文件
if (fs.existsSync(sourceMapFile)) {
    fs.copyFileSync(
        sourceMapFile,
        path.join(sourceMapDir, 'monitor.min.js.map')
    );
    console.log(`[SourceMap] Copied to: sourcemaps/${version}/monitor.min.js.map`);
    console.log(`[SourceMap] Version: ${version}`);
} else {
    console.error(`[SourceMap] Error: ${sourceMapFile} not found`);
    console.error('[SourceMap] Please run "npm run build" first');
    process.exit(1);
}
