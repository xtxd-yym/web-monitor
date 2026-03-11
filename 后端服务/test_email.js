const emailService = require('./src/services/email');

// 模拟一条告警数据
const mockAlarmData = {
    project: 'b2b-openplat-monitor',
    env: 'development',
    instance_name: 'JS运行时错误规则',
    appkey: 'test-key-123',
    customer_name: 'demo-user-v2',
    service_name: '测试服务',
    level: 'L1',
    message: '[JS运行时错误规则] 触发告警: 60秒内发生 5 次 (阈值: 5)',
    error_message: 'TypeError: Cannot read properties of undefined (reading \'bar\')',
    error_stack: 'TypeError: Cannot read properties of undefined (reading \'bar\')\n    at demoJSError (http://localhost:5173/index.html:496:17)\n    at HTMLButtonElement.onclick (http://localhost:5173/index.html:280:61)',
    created_at: Date.now()
};

// 替换为你希望接收告警的邮箱
const toEmail = 'your-email@example.com';

console.log(`正在尝试向 ${toEmail} 发送测试告警邮件...`);

emailService.sendAlarmEmail(toEmail, mockAlarmData)
    .then(success => {
        if (success) {
            console.log('✅ 测试邮件发送成功！请检查你的收件箱（或垃圾箱）。');
        } else {
            console.log('❌ 测试邮件发送失败，请检查上方日志中的错误信息。');
        }
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ 发送过程中发生异常:', err);
        process.exit(1);
    });
