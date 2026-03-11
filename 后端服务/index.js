/**
 * 云监控告警系统 - 后端服务入口
 */

const MonitorServer = require('./src/app');

// 创建并启动服务器
const server = new MonitorServer();
server.start();
