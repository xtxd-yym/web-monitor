/**
 * 设置 SourceMap 脚本
 * 将 SDK 的 SourceMap 文件复制到后端的 sourcemaps 目录
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const SDK_DIR = path.join(__dirname, '../../监控sdk源码');
const SDK_DIST_DIR = path.join(SDK_DIR, 'dist');
const SDK_SOURCEMAP_DIR = path.join(SDK_DIST_DIR, 'sourcemaps');
const BACKEND_SOURCEMAP_DIR = path.join(__dirname, '../sourcemaps');

console.log('📦 开始设置 SourceMap...');
console.log('SDK 目录:', SDK_DIR);
console.log('后端 SourceMap 目录:', BACKEND_SOURCEMAP_DIR);

// 创建后端 sourcemaps 目录
if (!fs.existsSync(BACKEND_SOURCEMAP_DIR)) {
    fs.mkdirSync(BACKEND_SOURCEMAP_DIR, { recursive: true });
    console.log('✅ 创建目录:', BACKEND_SOURCEMAP_DIR);
}

// 检查 SDK 是否已构建
const sdkMapFile = path.join(SDK_DIST_DIR, 'monitor.min.js.map');
if (!fs.existsSync(sdkMapFile)) {
    console.error('❌ 错误: 未找到 SDK 的 SourceMap 文件');
    console.error('请先在 SDK 目录运行: npm run build');
    process.exit(1);
}

// 读取 SDK 版本
const packageJsonPath = path.join(SDK_DIR, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

console.log(`SDK 版本: ${version}`);

// 创建版本目录
const versionDir = path.join(BACKEND_SOURCEMAP_DIR, version);
if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
    console.log(`✅ 创建版本目录: sourcemaps/${version}/`);
}

// 复制 SourceMap 文件
const destFile = path.join(versionDir, 'monitor.min.js.map');
fs.copyFileSync(sdkMapFile, destFile);
console.log(`✅ 复制 SourceMap 文件到: sourcemaps/${version}/monitor.min.js.map`);

// 同时检查 SDK 的 sourcemaps 目录
if (fs.existsSync(SDK_SOURCEMAP_DIR)) {
    const versions = fs.readdirSync(SDK_SOURCEMAP_DIR);
    console.log(`\n📋 SDK 中已存在的版本: ${versions.join(', ')}`);

    // 复制所有版本
    versions.forEach(ver => {
        const srcDir = path.join(SDK_SOURCEMAP_DIR, ver);
        const destDir = path.join(BACKEND_SOURCEMAP_DIR, ver);

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const srcFile = path.join(srcDir, 'monitor.min.js.map');
        const destFile = path.join(destDir, 'monitor.min.js.map');

        if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, destFile);
            console.log(`✅ 复制版本 ${ver} 的 SourceMap`);
        }
    });
}

// 列出后端 sourcemaps 目录的内容
console.log('\n📂 后端 sourcemaps 目录结构:');
const backendVersions = fs.readdirSync(BACKEND_SOURCEMAP_DIR);
backendVersions.forEach(ver => {
    const versionPath = path.join(BACKEND_SOURCEMAP_DIR, ver);
    if (fs.statSync(versionPath).isDirectory()) {
        const files = fs.readdirSync(versionPath);
        console.log(`  ${ver}/`);
        files.forEach(file => {
            console.log(`    ${file}`);
        });
    }
});

console.log('\n✅ SourceMap 设置完成！');
console.log('现在可以启动后端服务: node server-new.js');
