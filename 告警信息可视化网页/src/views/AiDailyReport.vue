<template>
  <div class="daily-report-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <el-icon class="header-icon"><MagicStick /></el-icon>
        <div>
          <h2 class="page-title">AI 巡检日报</h2>
          <p class="page-desc">每天 09:00 自动生成前一日监控摘要，并按配置发送邮件与 Vanish 消息</p>
        </div>
      </div>
      <div class="header-right">
        <el-button :icon="Setting" @click="notificationDialogVisible = true">通知配置</el-button>
      </div>
    </div>

    <!-- 触发区 -->
    <el-card class="trigger-card" shadow="never">
      <div class="trigger-inner">
        <el-icon class="trigger-icon"><Lightning /></el-icon>
        <div class="trigger-info">
          <span class="trigger-label">手动生成日报</span>
          <span class="trigger-hint">选择日期后点击立即生成（默认为昨日）</span>
        </div>
        <el-date-picker
          v-model="triggerDate"
          type="date"
          placeholder="选择日期（默认昨日）"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          :disabled-date="disableFutureDates"
          style="width: 180px;"
        />
        <el-checkbox v-model="skipNotifications" style="margin-left: 12px;">仅生成不发送通知</el-checkbox>
        <el-button
          type="primary"
          :loading="triggering"
          :icon="Promotion"
          @click="handleTrigger"
          style="margin-left: 12px;"
        >立即生成</el-button>
      </div>
    </el-card>

    <!-- 历史列表 -->
    <el-card class="list-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>历史日报记录</span>
          <el-button :icon="Refresh" circle size="small" @click="loadList" :loading="listLoading" />
        </div>
      </template>

      <el-table :data="tableData" v-loading="listLoading" stripe style="width: 100%">
        <el-table-column prop="report_date" label="报告日期" width="130" />
        <el-table-column label="触发方式" width="100">
          <template #default="{ row }">
            <el-tag :type="row.trigger_type === 'auto' ? 'info' : 'warning'" size="small">
              {{ row.trigger_type === 'auto' ? '⏰ 自动' : '🖱 手动' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="邮件" width="100">
          <template #default="{ row }">
            <el-tag :type="row.email_sent ? 'success' : 'danger'" size="small">
              {{ row.email_sent ? '✅ 已发送' : '⚠️ 未发送' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Vanish" width="100">
          <template #default="{ row }">
            <el-tag :type="row.vanish_sent ? 'success' : 'info'" size="small">
              {{ row.vanish_sent ? '✅ 已发送' : '未发送' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="headline" label="AI 摘要一句话" min-width="220" show-overflow-tooltip />
        <el-table-column label="生成时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDetail(row.id)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadList"
          @current-change="loadList"
        />
      </div>
    </el-card>

    <!-- ────────────── 详情抽屉 ────────────── -->
    <el-drawer
      v-model="drawerVisible"
      :title="`日报详情 · ${currentReport?.report_date || ''}`"
      size="820px"
      destroy-on-close
    >
      <div v-if="detailLoading" class="drawer-loading">
        <el-icon class="loading-icon"><Loading /></el-icon>
        <span>加载中...</span>
      </div>
      <template v-else-if="currentReport">
        <el-tabs v-model="activeTab" class="detail-tabs">
          <!-- ── 数据统计 Tab ── -->
          <el-tab-pane label="📊 数据统计" name="stats">
            <!-- 数据卡片 -->
            <div class="stat-cards">
              <div class="stat-card">
                <div class="stat-value primary">{{ currentReport.stat_json?.total || 0 }}</div>
                <div class="stat-label">昨日总错误</div>
              </div>
              <div class="stat-card">
                <div class="stat-value info">{{ affectedComponents }}</div>
                <div class="stat-label">影响组件数</div>
              </div>
              <div class="stat-card">
                <div class="stat-value warning">{{ topTypeName }}</div>
                <div class="stat-label">最高频类型</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" :class="trendClass">{{ trendText }}</div>
                <div class="stat-label">较前日环比</div>
              </div>
            </div>

            <!-- 错误类型分布饼图 -->
            <div class="chart-section" v-if="hasTypeData">
              <div class="chart-title">错误类型分布</div>
              <div ref="pieChartRef" class="echarts-box" />
            </div>

            <!-- Top 组件条形图 -->
            <div class="chart-section" v-if="hasAppkeyData">
              <div class="chart-title">Top 组件错误量</div>
              <div ref="barChartRef" class="echarts-box" />
            </div>

            <!-- Top5 高频错误表 -->
            <div class="chart-section" v-if="topErrors.length">
              <div class="chart-title">Top5 高频错误</div>
              <el-table :data="topErrors" size="small" stripe>
                <el-table-column type="index" width="50" label="#" />
                <el-table-column label="类型" width="100">
                  <template #default="{ row }">
                    <el-tag :type="errorTypeTag(row.error_type)" size="small">{{ row.error_type }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="error_message" label="错误信息" min-width="200" show-overflow-tooltip />
                <el-table-column prop="count" label="次数" width="80" />
              </el-table>
            </div>
          </el-tab-pane>

          <!-- ── AI 分析 Tab ── -->
          <el-tab-pane label="🤖 AI 分析" name="ai">
            <div class="ai-panel">
              <div v-if="!aiSummary || !aiSummary.headline" class="ai-empty">
                <el-empty description="暂无 AI 分析数据" />
              </div>
              <template v-else>
                <!-- 整体概况 -->
                <div class="ai-section overview-section">
                  <div class="section-label">整体概况</div>
                  <p class="overview-text">{{ aiSummary.overview }}</p>
                </div>

                <!-- 关键洞察 -->
                <div class="ai-section" v-if="aiSummary.highlights?.length">
                  <div class="section-label">关键洞察</div>
                  <div class="highlights-list">
                    <div
                      v-for="(h, i) in aiSummary.highlights"
                      :key="i"
                      class="highlight-item"
                      :class="`highlight-${h.type}`"
                    >
                      <el-icon v-if="h.type === 'warning'"><WarningFilled /></el-icon>
                      <el-icon v-else-if="h.type === 'success'"><CircleCheckFilled /></el-icon>
                      <el-icon v-else><InfoFilled /></el-icon>
                      <span>{{ h.text }}</span>
                    </div>
                  </div>
                </div>

                <!-- Top 问题 & 建议 -->
                <div class="ai-section" v-if="aiSummary.topIssues?.length">
                  <div class="section-label">问题 & 修复建议</div>
                  <div class="issue-cards">
                    <div v-for="(issue, i) in aiSummary.topIssues" :key="i" class="issue-card">
                      <div class="issue-header">
                        <el-tag size="small" type="danger">{{ issue.component || '未知组件' }}</el-tag>
                      </div>
                      <div class="issue-problem">❗ {{ issue.issue }}</div>
                      <div class="issue-suggestion">🔧 {{ issue.suggestion }}</div>
                    </div>
                  </div>
                </div>

                <!-- 趋势 -->
                <div class="ai-section" v-if="aiSummary.trend">
                  <div class="section-label">趋势分析</div>
                  <div class="trend-box">
                    <el-icon><DataLine /></el-icon>
                    <span>{{ aiSummary.trend }}</span>
                  </div>
                </div>

                <!-- 今日行动 -->
                <div class="ai-section action-section" v-if="aiSummary.action">
                  <div class="section-label">今日优先处理</div>
                  <div class="action-box">
                    <el-icon><Aim /></el-icon>
                    <span>{{ aiSummary.action }}</span>
                  </div>
                </div>
              </template>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <!-- ────────────── 通知配置 Dialog ────────────── -->
    <el-dialog v-model="notificationDialogVisible" title="📮 日报通知配置" width="620px">
      <el-alert
        :type="notificationForm.vanishChannel.configured ? 'success' : 'warning'"
        :closable="false"
        show-icon
        class="channel-status"
      >
        <template #title>
          Vanish 后端渠道：{{ notificationForm.vanishChannel.configured ? 'URL 与 AK 已配置' : '尚未完整配置 URL 与 AK' }}
        </template>
      </el-alert>

      <div class="notification-section">
        <div class="notification-section__header">
          <div>
            <div class="notification-title">邮件通知</div>
            <div class="recipient-hint">使用现有 SMTP 服务发送 HTML 完整日报。</div>
          </div>
          <el-switch v-model="notificationForm.emailEnabled" />
        </div>
        <el-input
          v-model="notificationForm.emailRecipients"
          type="textarea"
          :rows="3"
          :disabled="!notificationForm.emailEnabled"
          placeholder="example@company.com&#10;another@company.com"
        />
      </div>

      <div class="notification-section">
        <div class="notification-section__header">
          <div>
            <div class="notification-title">Vanish 通知</div>
            <div class="recipient-hint">发送文本摘要、趋势、Top 组件/问题与今日建议；每行一个 @myhexin.com 账号。</div>
          </div>
          <el-switch v-model="notificationForm.vanishEnabled" />
        </div>
        <el-input
          v-model="notificationForm.vanishRecipients"
          type="textarea"
          :rows="3"
          :disabled="!notificationForm.vanishEnabled"
          placeholder="user@myhexin.com&#10;owner@myhexin.com"
        />
        <div class="credential-hint">正式扶摇 URL 与 Vanish AK 仅由后端环境变量注入，本页面不会保存或显示凭证。</div>
      </div>
      <template #footer>
        <el-button @click="notificationDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingNotifications" @click="saveNotificationSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import {
  MagicStick, Setting, Lightning, Promotion, Refresh, Loading,
  WarningFilled, CircleCheckFilled, InfoFilled, Aim, DataLine
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts';
import request from '../api/request.js';

// ── 触发区 ──
const triggerDate = ref('');
const skipNotifications = ref(false);
const triggering = ref(false);

function disableFutureDates(date) {
  return date > new Date();
}

async function handleTrigger() {
  triggering.value = true;
  try {
    // 提前检查通知设置，给出友好提示（不阻断生成）
    if (!skipNotifications.value) {
      try {
        const settingRes = await request.get('/ai-daily-report/notification-settings');
        const settings = settingRes.data || {};
        const hasEmail = settings.emailEnabled && settings.emailRecipients?.trim();
        const hasVanish = settings.vanishEnabled && settings.vanishRecipients?.trim() && settings.vanishChannel?.configured;
        if (!hasEmail && !hasVanish) {
          ElMessage.warning('当前没有可用通知渠道，日报将只生成不发送。请先完成右上角「通知配置」。');
        }
      } catch (_) {}
    }
    const res = await request.post('/ai-daily-report/trigger', {
      date: triggerDate.value || undefined,
      skipEmail: skipNotifications.value,
      skipVanish: skipNotifications.value
    });
    ElMessage.success(res.msg || '日报生成成功');
    loadList();
  } catch (_) {
    // 错误由 request 拦截器统一处理
  } finally {
    triggering.value = false;
  }
}

// ── 列表 ──
const tableData = ref([]);
const listLoading = ref(false);
const pagination = ref({ page: 1, pageSize: 20, total: 0 });

async function loadList() {
  listLoading.value = true;
  try {
    const res = await request.get('/ai-daily-report/list', {
      params: { page: pagination.value.page, pageSize: pagination.value.pageSize }
    });
    tableData.value = res.data?.list || [];
    pagination.value.total = res.data?.total || 0;
  } catch (_) {}
  finally { listLoading.value = false; }
}

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

// ── 详情抽屉 ──
const drawerVisible = ref(false);
const detailLoading = ref(false);
const currentReport = ref(null);
const activeTab = ref('stats');
const pieChartRef = ref(null);
const barChartRef = ref(null);
let pieChartInstance = null;
let barChartInstance = null;

async function openDetail(id) {
  drawerVisible.value = true;
  detailLoading.value = true;
  activeTab.value = 'stats';
  currentReport.value = null;
  try {
    const res = await request.get(`/ai-daily-report/${id}`);
    currentReport.value = res.data;
    // 必须先关掉 loading，让图表容器渲染到 DOM，再初始化 ECharts
    detailLoading.value = false;
    await nextTick();
    initCharts();
  } catch (_) {
    detailLoading.value = false;
  }
}

// 计算属性
const aiSummary = computed(() => currentReport.value?.ai_summary_json || {});
const statJson = computed(() => currentReport.value?.stat_json || {});

const affectedComponents = computed(() =>
  (statJson.value?.byAppkey || []).filter(a => a.total > 0).length
);

const topTypeName = computed(() => {
  const byType = statJson.value?.byType || {};
  const top = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '-';
});

const trendText = computed(() => {
  const pct = statJson.value?.trendPct;
  const diff = statJson.value?.trendDiff || 0;
  if (pct === null || pct === undefined) return '首次';
  if (diff === 0) return '持平';
  return diff > 0 ? `↑ ${pct}%` : `↓ ${Math.abs(pct)}%`;
});

const trendClass = computed(() => {
  const diff = statJson.value?.trendDiff || 0;
  return diff > 0 ? 'danger' : diff < 0 ? 'success' : 'info';
});

const topErrors = computed(() => statJson.value?.topErrors || []);
const hasTypeData = computed(() => Object.keys(statJson.value?.byType || {}).length > 0);
const hasAppkeyData = computed(() => (statJson.value?.byAppkey || []).length > 0);

const TYPE_COLORS = {
  javascript: '#f56c6c', promise: '#e6a23c', resource: '#909399',
  network: '#409eff', white_screen: '#9b59b6', performance: '#1abc9c'
};

function errorTypeTag(type) {
  const map = { javascript: 'danger', promise: 'warning', resource: 'info', network: '', white_screen: '', performance: 'success' };
  return map[type] || '';
}

function initCharts() {
  const byType = statJson.value?.byType || {};
  const byAppkey = statJson.value?.byAppkey || [];

  // 饼图
  if (pieChartRef.value && Object.keys(byType).length) {
    if (pieChartInstance) pieChartInstance.dispose();
    pieChartInstance = echarts.init(pieChartRef.value);
    pieChartInstance.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c}次 ({d}%)' },
      legend: { orient: 'vertical', right: 10, top: 'center' },
      series: [{
        type: 'pie',
        radius: ['38%', '62%'],
        center: ['38%', '50%'],
        data: Object.entries(byType).map(([name, value]) => ({
          name, value,
          itemStyle: { color: TYPE_COLORS[name] || '#409eff' }
        })),
        label: { formatter: '{b}\n{d}%' }
      }]
    });
  }

  // 横向条形图
  if (barChartRef.value && byAppkey.length) {
    if (barChartInstance) barChartInstance.dispose();
    barChartInstance = echarts.init(barChartRef.value);
    const names = byAppkey.map(a => a.service_name || a.appkey || '未知').reverse();
    const values = byAppkey.map(a => a.total).reverse();
    barChartInstance.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '2%', right: '8%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: names, axisLabel: { width: 100, overflow: 'truncate' } },
      series: [{
        type: 'bar',
        data: values,
        barMaxWidth: 32,
        itemStyle: { color: '#409eff', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', formatter: '{c}次' }
      }]
    });
  }
}

watch(drawerVisible, (val) => {
  if (!val) {
    if (pieChartInstance) { pieChartInstance.dispose(); pieChartInstance = null; }
    if (barChartInstance) { barChartInstance.dispose(); barChartInstance = null; }
  }
});

// ── 通知配置 ──
const notificationDialogVisible = ref(false);
const savingNotifications = ref(false);
const notificationForm = ref({
  emailEnabled: true,
  emailRecipients: '',
  vanishEnabled: false,
  vanishRecipients: '',
  vanishChannel: { configured: false, urlConfigured: false, akConfigured: false }
});

async function loadNotificationSettings() {
  try {
    const res = await request.get('/ai-daily-report/notification-settings');
    notificationForm.value = { ...notificationForm.value, ...(res.data || {}) };
  } catch (_) {}
}

async function saveNotificationSettings() {
  if (notificationForm.value.vanishEnabled) {
    const recipients = notificationForm.value.vanishRecipients
      .split(/[,，\n;]/)
      .map(item => item.trim())
      .filter(Boolean);
    const invalid = recipients.find(item => !/^[^\s,@]+@myhexin\.com$/i.test(item));
    if (recipients.length === 0 || invalid) {
      ElMessage.error(invalid ? `Vanish 账号格式错误：${invalid}` : '启用 Vanish 后必须填写收件账号');
      return;
    }
  }

  savingNotifications.value = true;
  try {
    await request.post('/ai-daily-report/notification-settings', {
      emailEnabled: notificationForm.value.emailEnabled,
      emailRecipients: notificationForm.value.emailRecipients,
      vanishEnabled: notificationForm.value.vanishEnabled,
      vanishRecipients: notificationForm.value.vanishRecipients
    });
    ElMessage.success('日报通知配置已保存');
    notificationDialogVisible.value = false;
  } catch (_) {}
  finally { savingNotifications.value = false; }
}

watch(notificationDialogVisible, (val) => { if (val) loadNotificationSettings(); });

onMounted(() => { loadList(); });
</script>

<style scoped>
.daily-report-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 页头 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.header-icon {
  font-size: 32px;
  color: #409eff;
  background: linear-gradient(135deg, #ecf5ff, #d9eaff);
  border-radius: 10px;
  padding: 8px;
}
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: #1a2a4a;
}
.page-desc {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

/* 触发区 */
.trigger-card { border-radius: 10px; }
.trigger-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.trigger-icon {
  font-size: 24px;
  color: #e6a23c;
}
.trigger-info {
  display: flex;
  flex-direction: column;
  margin-right: 8px;
}
.trigger-label { font-weight: 600; color: #303133; font-size: 14px; }
.trigger-hint { font-size: 12px; color: #909399; }

/* 列表卡片 */
.list-card { border-radius: 10px; }
.card-header { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.pagination-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }

/* 抽屉 */
.drawer-loading {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 200px; color: #909399;
}
.loading-icon { font-size: 20px; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* 让抽屉 body 可滚动 */
:deep(.el-drawer__body) {
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.detail-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 20px;
}

/* tab 内容区域撑满并可滚动 */
:deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 32px;
}
:deep(.el-tab-pane) {
  height: 100%;
}

/* 数据卡片 */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.stat-card {
  background: #f8f9ff;
  border: 1px solid #e8ecff;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}
.stat-value.primary { color: #409eff; }
.stat-value.info    { color: #606266; }
.stat-value.warning { color: #e6a23c; font-size: 14px; }
.stat-value.success { color: #67c23a; }
.stat-value.danger  { color: #f56c6c; }
.stat-label { font-size: 12px; color: #909399; margin-top: 4px; }

/* ECharts */
.chart-section { margin-bottom: 24px; }
.chart-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 12px; }
.echarts-box { width: 100%; height: 240px; }

/* AI 分析面板 */
.ai-panel { display: flex; flex-direction: column; gap: 16px; }
.ai-section { }
.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0f2f5;
}
.overview-text {
  font-size: 14px;
  color: #303133;
  line-height: 1.8;
  background: #f8faff;
  border-left: 3px solid #409eff;
  padding: 12px 16px;
  border-radius: 0 6px 6px 0;
  margin: 0;
}

/* 洞察列表 */
.highlights-list { display: flex; flex-direction: column; gap: 8px; }
.highlight-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.highlight-warning { background: #fef8ed; color: #b07800; border-left: 3px solid #f0a020; }
.highlight-success { background: #f0f9eb; color: #3a8e10; border-left: 3px solid #67c23a; }
.highlight-info    { background: #ecf5ff; color: #1a6bb5; border-left: 3px solid #409eff; }

/* 问题建议 */
.issue-cards { display: flex; flex-direction: column; gap: 10px; }
.issue-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px 16px;
  background: #fff;
}
.issue-header { margin-bottom: 8px; }
.issue-problem {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}
.issue-suggestion {
  font-size: 13px;
  color: #606266;
  background: #f8f9fa;
  padding: 8px 10px;
  border-radius: 4px;
  border-left: 3px solid #409eff;
}

/* 趋势 & 行动 */
.trend-box, .action-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
}
.trend-box  { background: #f0f9ff; color: #1a6bb5; border: 1px solid #d4eaff; }
.action-box { background: #fff7ed; color: #b45309; border-left: 3px solid #f59e0b; }

/* 通知配置 */
.recipient-hint {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}
.channel-status { margin-bottom: 16px; }
.notification-section {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 12px;
}
.notification-section__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 10px;
}
.notification-title { font-size: 14px; font-weight: 600; color: #303133; }
.credential-hint { margin-top: 8px; color: #909399; font-size: 12px; }
.vanish-config-hint {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
