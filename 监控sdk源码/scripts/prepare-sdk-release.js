/**
 * 生成共享 Loader 可发布目录：
 *   monitor-loader.js
 *   sdk-manifest.json
 *   {version}/monitor.min.js
 *
 * 默认输出到 dist/release；可通过 --output <dir> 指定后端镜像静态目录。
 */

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

function readOutputArgument(args) {
    const outputIndex = args.indexOf('--output');
    if (outputIndex === -1) {
        return path.resolve(__dirname, '../dist/release');
    }

    const outputValue = args[outputIndex + 1];
    if (!outputValue) {
        throw new Error('--output 后必须提供目录');
    }
    return path.resolve(process.cwd(), outputValue);
}

const version = packageJson.version;
const distDir = path.resolve(__dirname, '../dist');
const sdkSource = path.join(distDir, 'monitor.min.js');
const loaderSource = path.resolve(__dirname, '../src/loader/monitor-loader.js');
const outputDir = readOutputArgument(process.argv.slice(2));
const versionDir = path.join(outputDir, version);

if (!fs.existsSync(sdkSource)) {
    throw new Error(`未找到 ${sdkSource}，请先执行 npm.cmd run build`);
}

fs.mkdirSync(versionDir, { recursive: true });
fs.copyFileSync(loaderSource, path.join(outputDir, 'monitor-loader.js'));
fs.copyFileSync(sdkSource, path.join(versionDir, 'monitor.min.js'));
fs.writeFileSync(
    path.join(outputDir, 'sdk-manifest.json'),
    `${JSON.stringify({
        version,
        sdkUrl: `./${version}/monitor.min.js`
    }, null, 2)}\n`,
    'utf8'
);

console.log(`[SDK Release] Output: ${outputDir}`);
console.log(`[SDK Release] Version: ${version}`);
