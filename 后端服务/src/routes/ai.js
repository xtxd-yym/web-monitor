const express = require('express');
const router = express.Router();
const serverConfig = require('../config/server');

router.post('/analyze', async (req, res) => {
    try {
        const { errorInfo } = req.body;
        if (!errorInfo) {
            return res.status(400).json({ success: false, msg: 'Missing errorInfo' });
        }

        const apiKey = serverConfig.ai.apiKey;
        const baseUrl = serverConfig.ai.baseUrl;
        const modelName = serverConfig.ai.model;

        if (!apiKey) {
            return res.status(500).json({ success: false, msg: 'AI API Key is not configured on the server.' });
        }

        // Construct Prompts
        const systemPrompt = `你是一个资深的前端开发与架构专家。
请根据提供的监控系统报错数据（包括错误基本信息、解析后的堆栈信息、以及用户行为轨迹面包屑），给出专业、直接的诊断。
请以 Markdown 格式输出你的分析，包含以下三个部分：
1. **根因分析**：直戳痛点地说明为什么会发生这个错误。
2. **场景还原**：根据用户行为了解报错前发生了什么。
3. **修复建议**：给出具体的代码修复示例或者排查方向。
请保持回复简练，不要说多余的客套话。`;

        const userPrompt = `【错误信息】
类型: ${errorInfo.error_type}
描述: ${errorInfo.error_message}
组件: ${errorInfo.parsedData?.service_name || '未知'}

【错误堆栈】
${errorInfo.parsedData?.original_stack || errorInfo.error_stack || '无'}

【用户行为轨迹 (倒序排列，最新行为在最后)】
${(errorInfo.breadcrumbs || []).map(b => `- [${new Date(b.event_time).toLocaleString()}] [${b.category}] ${b.breadcrumb_message}`).join('\n') || '未收集到面包屑'}
`;

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`AI API Error: ${errText}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '大模型未能返回有效内容。';

        res.json({
            success: true,
            data: content
        });

    } catch (error) {
        console.error('AI分析请求失败:', error);
        res.status(500).json({
            success: false,
            msg: 'AI请求失败',
            error: error.message
        });
    }
});

module.exports = () => router;
