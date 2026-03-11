const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());

// 确保在代理配置前解析JSON请求体
app.use(express.json());

// 配置代理
// app.use('/wczj/alarm/report', (req, res, next) => {
//   console.log('收到代理请求:', req.method, req.url);
//   console.log('请求头:', JSON.stringify(req.headers, null, 2));
//   if (req.body) {
//     console.log('请求体:', JSON.stringify(req.body, null, 2));
//   }
//   console.log('代理请求到:', 'http://b2b-wczj-alarm-producer-test.myhexin.com' + req.originalUrl);
//   next();
// }, createProxyMiddleware({
//   target: 'http://b2b-wczj-alarm-producer-test.myhexin.com',
//   changeOrigin: true,
//   secure: false,
//   headers: {
//     Host: 'b2b-wczj-alarm-producer-test.myhexin.com',
//   },
//   // 不使用pathRewrite，保持原始路径
//   // pathRewrite: {
//   //   '^/wczj/alarm': '/wczj/alarm',
//   // },
//   logLevel: 'debug',
//   onProxyReq: (proxyReq, req, res) => {
//     // 修改代理请求路径
//     proxyReq.path = '/wczj/alarm/report';
//     console.log('代理请求:', req.method, proxyReq.path);
//     console.log('代理请求完整URL:', proxyReq.protocol + '//' + proxyReq.host + proxyReq.path);
//     console.log('代理请求头:', JSON.stringify(proxyReq.getHeaders(), null, 2));

//     // 如果是POST请求且有请求体，需要重写请求体
//     if (req.body && req.method === 'POST') {
//       const bodyData = JSON.stringify(req.body);
//       proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
//       proxyReq.write(bodyData);
//       console.log('代理请求体已重写');
//     }
//   },
//   onProxyRes: (proxyRes, req, res) => {
//     console.log('代理响应:', proxyRes.statusCode);
//     console.log('响应头:', JSON.stringify(proxyRes.headers, null, 2));
//   },
//   onError: (err, req, res) => {
//     console.error('代理错误:', err);
//     res.status(500).send('代理请求失败: ' + err.message);
//   }
// }));

// 提供静态文件服务，将项目根目录作为静态资源目录
app.use(express.static(path.join(__dirname, '../../')));

const LOG_DIR = path.join(__dirname, '../logs');

// 配置存储
let monitorConfigs = new Map();

// 初始化默认配置
const defaultConfigs = {
  'demo-web-app': {
    development: {
      enabled: true,
      config: {
        enableErrorMonitoring: true,
        enablePerformanceMonitoring: true,
        enableNetworkMonitoring: true,
        enableUserTracking: true,
        enableWhiteScreenDetection: true,
        reportInterval: 3000,
        maxErrors: 100,
        closeMonitor: false
      }
    },
    production: {
      enabled: true,
      config: {
        enableErrorMonitoring: true,
        enablePerformanceMonitoring: true,
        enableNetworkMonitoring: false,
        enableUserTracking: false,
        enableWhiteScreenDetection: true,
        reportInterval: 10000,
        maxErrors: 50,
        closeMonitor: false
      }
    }
  }
};

// 加载配置到内存
Object.entries(defaultConfigs).forEach(([project, envs]) => {
  Object.entries(envs).forEach(([env, config]) => {
    monitorConfigs.set(`${project}:${env}`, config);
  });
});

// 确保日志目录存在
async function ensureLogDir() {
  try {
    await fs.access(LOG_DIR);
  } catch {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }
}

// 错误上报接口
app.post('/api/report', async (req, res) => {
  try {
    const { errors } = req.body;
    if (!errors || !Array.isArray(errors)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    await ensureLogDir();

    // 按日期分组日志
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `${today}.json`);

    let existingLogs = [];
    try {
      const data = await fs.readFile(logFile, 'utf8');
      existingLogs = JSON.parse(data);
    } catch {
      existingLogs = [];
    }

    existingLogs.push(...errors);
    await fs.writeFile(logFile, JSON.stringify(existingLogs, null, 2));

    console.log(`收到 ${errors.length} 条监控数据`);

    // 检查是否需要关闭监控
    const shouldClose = monitorConfigs.get('demo-web-app:production')?.config?.closeMonitor || false;

    res.json({
      success: true,
      count: errors.length,
      closeMonitor: shouldClose
    });
  } catch (error) {
    console.error('处理监控数据失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取监控配置
app.get('/api/monitor/config', (req, res) => {
  try {
    const { project = 'default', env = 'production' } = req.query;
    const key = `${project}:${env}`;

    const config = monitorConfigs.get(key) || {
      enabled: true,
      config: {
        enableErrorMonitoring: true,
        enablePerformanceMonitoring: true,
        enableNetworkMonitoring: true,
        enableUserTracking: true,
        enableWhiteScreenDetection: true,
        reportInterval: 5000,
        maxErrors: 100
      }
    };

    res.json(config);
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 更新监控配置
app.post('/api/monitor/config', (req, res) => {
  try {
    const { project, env, config } = req.body;

    if (!project || !env || !config) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const key = `${project}:${env}`;
    monitorConfigs.set(key, config);

    console.log(`Updated config for ${key}:`, config);
    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    console.error('更新配置失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 动态设置closeMonitor标志
app.post('/api/monitor/close', (req, res) => {
  try {
    const { project = 'demo-web-app', env = 'production', close = true } = req.body;
    const key = `${project}:${env}`;

    const currentConfig = monitorConfigs.get(key);
    if (currentConfig) {
      currentConfig.config = {
        ...currentConfig.config,
        closeMonitor: close
      };
      monitorConfigs.set(key, currentConfig);
    }

    console.log(`Set closeMonitor=${close} for ${key}`);
    res.json({
      success: true,
      message: `closeMonitor set to ${close}`,
      closeMonitor: close
    });
  } catch (error) {
    console.error('设置closeMonitor失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取统计信息
app.get('/api/stats', async (req, res) => {
  try {
    await ensureLogDir();
    const files = await fs.readdir(LOG_DIR);
    const stats = {
      totalErrors: 0,
      errorTypes: {},
      recentErrors: [],
      dailyStats: []
    };

    for (const file of files.slice(-7)) { // 最近7天
      if (file.endsWith('.json')) {
        const data = await fs.readFile(path.join(LOG_DIR, file), 'utf8');
        const logs = JSON.parse(data);
        const date = file.replace('.json', '');

        const dailyErrorTypes = {};
        logs.forEach(log => {
          const type = log.type;
          dailyErrorTypes[type] = (dailyErrorTypes[type] || 0) + 1;
          stats.errorTypes[type] = (stats.errorTypes[type] || 0) + 1;
        });

        stats.dailyStats.push({ date, count: logs.length, types: dailyErrorTypes });
        stats.totalErrors += logs.length;

        // 添加最近错误
        stats.recentErrors.unshift(...logs.slice(-10));
      }
    }

    stats.recentErrors = stats.recentErrors.slice(0, 50);
    res.json(stats);
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`监控服务端运行在端口 ${PORT}`);
});