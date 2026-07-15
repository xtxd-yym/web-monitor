<template>
  <div class="dash-root">
    <!-- 顶部工具栏 -->
    <div class="dash-toolbar">
      <div class="dash-title">
        <span class="dash-title-icon">📊</span>
        <span>监控概览</span>
        <el-tag size="small" class="live-badge" effect="dark">LIVE</el-tag>
      </div>
      <div class="dash-controls">
        <el-select v-model="project" style="width: 160px" @change="loadDashboard">
          <el-option label="b2b-web-monitor" value="b2b-web-monitor" />
          </el-select>

        <el-select v-model="env" style="width: 120px" @change="loadDashboard">
          <el-option label="生产环境" value="production" />
          <el-option label="测试环境" value="development" />
        </el-select>
      
        <el-select v-model="days" style="width: 120px" @change="loadDashboard">
          <el-option label="近 7 天" :value="7" />
          <el-option label="近 14 天" :value="14" />
          <el-option label="近 30 天" :value="30" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="loadDashboard" circle />
      </div>
    </div>

    <!-- KPI 卡片 -->
    <div class="kpi-row">
      <div class="kpi-card" v-for="k in kpiCards" :key="k.label" :class="k.colorClass">
        <div class="kpi-icon">{{ k.icon }}</div>
        <div class="kpi-body">
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-label">{{ k.label }}</div>
        </div>
      </div>
    </div>

    <!-- 主图区：趋势 + 类型分布 -->
    <div class="chart-row">
      <div class="chart-card chart-main">
        <div class="chart-card-header">
          <span>错误趋势（{{ days }}天，按类型分类）</span>
        </div>
        <div ref="trendRef" class="chart-area"></div>
      </div>
      <div class="chart-card chart-pie">
        <div class="chart-card-header">
          <span>错误类型分布</span>
        </div>
        <div ref="pieRef" class="chart-area"></div>
      </div>
    </div>

    <!-- 按 AppKey 对比 + 高频错误 -->
    <div class="chart-row">
      <div class="chart-card chart-bar">
        <div class="chart-card-header">
          <span>各组件错误量对比</span>
          <span class="chart-card-sub">按 AppKey · {{ days }}天</span>
        </div>
        <div ref="barRef" class="chart-area"></div>
      </div>
      <div class="chart-card chart-top">
        <div class="chart-card-header">
          <span>高频错误 Top 10</span>
          <span class="chart-card-sub">按累计触发次数</span>
        </div>
        <div class="top-list">
          <div v-if="topErrors.length === 0" class="empty-tip">暂无数据</div>
          <div
            v-for="(err, idx) in topErrors"
            :key="err.fingerprint"
            class="top-item"
            @click="openErrorDetail(err)"
          >
            <div class="top-rank" :class="rankClass(idx)">{{ idx + 1 }}</div>
            <div class="top-info">
              <div class="top-msg">{{ err.error_message || err.message || '-' }}</div>
              <div class="top-meta">
                <el-tag size="small" :type="typeTagColor(err.error_type)">{{ err.error_type }}</el-tag>
              </div>
            </div>
            <div class="top-count">
              <span class="count-num">{{ err.count }}</span>
              <span class="count-unit">次</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 最近告警快照 -->
    <div class="alarm-section">
      <div class="chart-card-header" style="margin-bottom: 12px;">
        <span>最近告警快照</span>
        <router-link to="/console/alarm" class="view-all-link">查看全部 →</router-link>
      </div>
      <div v-if="recentAlarms.length === 0" class="empty-tip">暂无告警记录</div>
      <div v-else class="alarm-grid">
        <div
          v-for="alarm in recentAlarms"
          :key="alarm.id"
          class="alarm-card"
          :class="alarmLevelClass(alarm.alarm_level)"
        >
          <div class="alarm-card-level">{{ alarm.alarm_level || 'L1' }}</div>
          <div class="alarm-card-body">
            <div class="alarm-card-msg">{{ alarm.alarm_message || '-' }}</div>
            <div class="alarm-card-meta">
              <span v-if="alarm.service_name" class="meta-tag">🔑 {{ alarm.service_name }}</span>
              <span v-if="alarm.appkey" class="meta-tag key-tag">{{ alarm.appkey }}</span>
              <span class="meta-tag time-tag">{{ formatTime(alarm.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 错误详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="错误详情" size="50%">
      <div v-if="currentError">
        <el-descriptions border :column="1" size="small">
          <el-descriptions-item label="错误类型">{{ currentError.error_type }}</el-descriptions-item>
          <el-descriptions-item label="错误信息">{{ currentError.error_message }}</el-descriptions-item>
          <el-descriptions-item label="触发次数">{{ currentError.occurrence_count }}</el-descriptions-item>
          <el-descriptions-item label="最后发生">{{ new Date(currentError.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}</el-descriptions-item>
          <el-descriptions-item label="文件">{{ currentError.error_file || '-' }}</el-descriptions-item>
          <el-descriptions-item v-if="currentError.parsedData?.appkey" label="AppKey">{{ currentError.parsedData.appkey }}</el-descriptions-item>
          <el-descriptions-item v-if="currentError.parsedData?.service_name" label="组件名">{{ currentError.parsedData.service_name }}</el-descriptions-item>
        </el-descriptions>
        <h4 style="margin: 16px 0 8px;">堆栈信息</h4>
        <div class="code-block">
          <pre>{{ currentError.parsedData?.original_stack || currentError.error_stack || '-' }}</pre>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import request from '../api/request';

// ─── 状态 ───────────────────────────────────────────────────────────────────
const project = ref('b2b-web-monitor');
const env = ref('production');
const days = ref(7);
const loading = ref(false);

const statsByAppkey   = ref([]);  // [ { appkey, service_name, total, byType } ]
const trend           = ref([]);  // [ { time, count, types:{} } ]
const topErrors       = ref([]);  // Top 10
const typeDistribution = ref({}); // { javascript: N, ... }
const totalErrors     = ref(0);
const recentAlarms    = ref([]);

const drawerVisible = ref(false);
const currentError  = ref(null);

// ─── 图表 ref ────────────────────────────────────────────────────────────────
const trendRef = ref(null);
const pieRef   = ref(null);
const barRef   = ref(null);
let trendChart = null, pieChart = null, barChart = null;

// ─── KPI 卡片 ────────────────────────────────────────────────────────────────
const kpiCards = computed(() => {
  const byType = typeDistribution.value;
  return [
    {
      label: `总错误数（${days.value}天）`,
      value: totalErrors.value,
      icon: '💥',
      colorClass: 'kpi-red'
    },
    {
      label: 'JS / Promise 错误',
      value: (byType.javascript || 0) + (byType.promise || 0),
      icon: '⚡',
      colorClass: 'kpi-orange'
    },
    {
      label: '白屏异常',
      value: byType.white_screen || byType.whitepage || 0,
      icon: '🖥️',
      colorClass: 'kpi-purple'
    },
    {
      label: '接口 / 网络错误',
      value: (byType.network || 0) + (byType['network-error'] || 0),
      icon: '🔌',
      colorClass: 'kpi-blue'
    },
    {
      label: '接入组件数',
      value: statsByAppkey.value.length,
      icon: '📦',
      colorClass: 'kpi-green'
    },
    {
      label: '最近告警条数',
      value: recentAlarms.value.length,
      icon: '🔔',
      colorClass: 'kpi-yellow'
    }
  ];
});

// ─── 数据加载 ────────────────────────────────────────────────────────────────
const loadDashboard = async () => {
  loading.value = true;
  try {
    // 新增：将 project 和 env 放入 params
    const res = await request.get('/errors/dashboard', { 
      params: { 
        days: days.value,
        project: project.value,
        env: env.value
      } 
    });
    if (res.success) {
      const d = res.data;
      statsByAppkey.value    = d.statsByAppkey   || [];
      trend.value            = d.trend            || [];
      topErrors.value        = d.topErrors        || [];
      typeDistribution.value = d.typeDistribution || {};
      totalErrors.value      = d.totalErrors      || 0;
      recentAlarms.value     = d.recentAlarms     || [];
      renderAll();
    }
  } catch (e) {
    console.error('[Dashboard] 加载失败:', e);
  } finally {
    loading.value = false;
  }
};

const openErrorDetail = async (row) => {
  if (!row.id) return;
  try {
    const res = await request.get(`/errors/${row.id}`);
    if (res.success && res.data) {
      let parsedData = {};
      try { parsedData = typeof res.data.extra_data === 'string' ? JSON.parse(res.data.extra_data) : (res.data.extra_data || {}); } catch (_) {}
      currentError.value = { ...res.data, parsedData };
      drawerVisible.value = true;
    }
  } catch (e) { console.error(e); }
};

// ─── 渲染图表 ────────────────────────────────────────────────────────────────
const ERROR_COLORS = {
  javascript:     '#f56c6c',
  promise:        '#e6a23c',
  resource:       '#909399',
  network:        '#409eff',
  'network-error':'#409eff',
  white_screen:   '#a855f7',
  whitepage:      '#a855f7',
  performance:    '#67c23a',
};
const getColor = (type) => ERROR_COLORS[type] || '#67c23a';

// 7天趋势（分类堆叠折线）
const renderTrend = () => {
  if (!trendRef.value) return;
  if (trendChart) trendChart.dispose();
  trendChart = echarts.init(trendRef.value);

  const rawData = trend.value;

  // 收集所有类型
  const allTypes = new Set();
  rawData.forEach(p => Object.keys(p.types || {}).forEach(t => allTypes.add(t)));
  const types = Array.from(allTypes);

  // X轴
  const xData = rawData.map(p => {
    const d = new Date(p.time);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const series = types.map(type => ({
    name: type,
    type: 'line',
    stack: 'total',
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { color: getColor(type), width: 2.5 },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: getColor(type) + '33' }, // 20% opacity
        { offset: 1, color: getColor(type) + '00' }  // 0% opacity
      ])
    },
    itemStyle: { color: getColor(type) },
    data: rawData.map(p => (p.types && p.types[type]) || 0)
  }));

  trendChart.setOption({
    backgroundColor: 'transparent',
    tooltip: { 
      trigger: 'axis', 
      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
      borderColor: '#e4e7ed',
      borderWidth: 1,
      textStyle: { color: '#303133', fontSize: 13 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;'
    },
    legend: { 
      data: types, 
      bottom: 0, 
      textStyle: { color: '#606266', fontSize: 12 }, 
      icon: 'circle',
      itemGap: 15
    },
    grid: { 
      left: 15, 
      right: 15, 
      top: 15, 
      bottom: 60, 
      containLabel: true 
    },
    xAxis: { 
      type: 'category', 
      data: xData, 
      axisLine: { lineStyle: { color: '#dcdfe6' } }, 
      axisLabel: { color: '#606266', margin: 10 } 
    },
    yAxis: { 
      type: 'value', 
      minInterval: 1, 
      splitLine: { lineStyle: { color: '#f0f2f5', type: 'dashed' } }, 
      axisLabel: { color: '#606266' } 
    },
    series
  });
};

// 类型分布环形图
const renderPie = () => {
  if (!pieRef.value) return;
  if (pieChart) pieChart.dispose();
  pieChart = echarts.init(pieRef.value);

  const dist = typeDistribution.value;
  const data = Object.entries(dist)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v, itemStyle: { color: getColor(k) } }));

  pieChart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e4e7ed',
      borderWidth: 1,
      textStyle: { color: '#303133', fontSize: 13 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;'
    },
    legend: { 
      orient: 'vertical', 
      right: '2%', 
      top: 'center', 
      textStyle: { color: '#606266', fontSize: 11 }, 
      icon: 'circle',
      itemGap: 10,
      itemWidth: 8,
      itemHeight: 8,
      formatter: (name) => name.length > 18 ? name.slice(0, 18) + '…' : name
    },
    series: [{
      type: 'pie',
      radius: ['42%', '66%'],
      center: ['30%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: { 
        label: { 
          show: true, 
          fontSize: 13, 
          fontWeight: 'bold', 
          color: '#303133' 
        } 
      },
      data: data.length ? data : [{ name: '暂无数据', value: 1, itemStyle: { color: '#e4e7ed' } }]
    }]
  });
};

// 各 AppKey 对比柱状图
const renderBar = () => {
  if (!barRef.value) return;
  if (barChart) barChart.dispose();
  barChart = echarts.init(barRef.value);

  const items = statsByAppkey.value.slice(0, 12); // 最多展示12个
  const labels = items.map(i => i.service_name || i.appkey.slice(0, 8));

  // 收集所有出现的类型
  const allTypes = new Set();
  items.forEach(i => Object.keys(i.byType).forEach(t => allTypes.add(t)));
  const types = Array.from(allTypes);

  const series = types.map(type => ({
    name: type,
    type: 'bar',
    stack: 'total',
    barMaxWidth: 30,
    itemStyle: { color: getColor(type), borderRadius: type === types[types.length - 1] ? [4, 4, 0, 0] : 0 },
    data: items.map(i => i.byType[type] || 0)
  }));

  barChart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e4e7ed',
      borderWidth: 1,
      textStyle: { color: '#303133', fontSize: 13 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;'
    },
    legend: { 
      data: types, 
      bottom: 0, 
      textStyle: { color: '#606266', fontSize: 12 }, 
      icon: 'circle',
      itemGap: 15
    },
    grid: { 
      left: 15, 
      right: 15, 
      top: 15, 
      bottom: 80, 
      containLabel: true 
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { 
        color: '#606266', 
        rotate: labels.length > 6 ? 25 : 0, 
        fontSize: 11,
        margin: 10
      },
      axisLine: { lineStyle: { color: '#dcdfe6' } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f0f2f5', type: 'dashed' } },
      axisLabel: { color: '#606266' }
    },
    series
  });
};

const renderAll = () => {
  renderTrend();
  renderPie();
  renderBar();
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
const rankClass = (idx) => idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : 'rank-normal';

const typeTagColor = (type) => {
  const map = { javascript: 'danger', promise: 'warning', resource: 'info', network: '', 'network-error': '', white_screen: '', whitepage: '' };
  return map[type] ?? 'success';
};

const alarmLevelClass = (level) => {
  return { L1: 'alarm-l1', L2: 'alarm-l2', L3: 'alarm-l3' }[level] || 'alarm-l1';
};

const formatTime = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// ─── 生命周期 ─────────────────────────────────────────────────────────────────
const resizeHandler = () => {
  trendChart?.resize();
  pieChart?.resize();
  barChart?.resize();
};

onMounted(() => {
  loadDashboard();
  window.addEventListener('resize', resizeHandler);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler);
  trendChart?.dispose();
  pieChart?.dispose();
  barChart?.dispose();
});
</script>

<style scoped>
/* ─── 根容器 ─────────────────────────────────── */
.dash-root {
  padding: 16px 20px 32px;
  background: transparent;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* ─── 工具栏 ─────────────────────────────────── */
.dash-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.dash-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
}
.dash-title-icon { font-size: 24px; }
.live-badge {
  font-size: 10px;
  letter-spacing: 1px;
  background: linear-gradient(90deg, #f56c6c, #e6195c) !important;
  border: none !important;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}
.dash-controls { display: flex; align-items: center; gap: 8px; }

/* ─── KPI 卡片行 ─────────────────────────────── */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
  min-width: 0;
}
@media (max-width: 1400px) { .kpi-row { grid-template-columns: repeat(3, minmax(140px, 1fr)); } }
@media (max-width: 768px)  { .kpi-row { grid-template-columns: repeat(2, minmax(120px, 1fr)); } }

.kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e4e7ed;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: transform .2s, box-shadow .2s;
}
.kpi-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.kpi-icon { font-size: 28px; flex-shrink: 0; }
.kpi-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 4px;
}
.kpi-label { font-size: 12px; color: #606266; font-weight: 500; white-space: nowrap; }

/* KPI 颜色主题 */
.kpi-red    { border-left: 4px solid #f56c6c; }
.kpi-red    .kpi-value { color: #f56c6c; }
.kpi-orange { border-left: 4px solid #e6a23c; }
.kpi-orange .kpi-value { color: #e6a23c; }
.kpi-purple { border-left: 4px solid #a855f7; }
.kpi-purple .kpi-value { color: #a855f7; }
.kpi-blue   { border-left: 4px solid #409eff; }
.kpi-blue   .kpi-value { color: #409eff; }
.kpi-green  { border-left: 4px solid #22c55e; }
.kpi-green  .kpi-value { color: #22c55e; }
.kpi-yellow { border-left: 4px solid #f59e0b; }
.kpi-yellow .kpi-value { color: #f59e0b; }

/* ─── 图表行 ─────────────────────────────────── */
.chart-row {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  min-width: 0;
}
.chart-card {
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  min-width: 0;
  overflow: hidden;
}
.chart-main { flex: 2; min-width: 280px; }
.chart-pie  { flex: 1; min-width: 240px; }
.chart-bar  { flex: 2; min-width: 280px; }
.chart-top  { flex: 1; min-width: 240px; }

.chart-card-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}
.chart-card-sub {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
}

.chart-area { height: 280px; }

/* ─── Top 错误列表 ────────────────────────────── */
.top-list { max-height: 280px; overflow-y: auto; padding-right: 4px; }
.top-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-bottom: 1px solid #f2f6fc;
  cursor: pointer;
  transition: background .15s, transform .1s;
  border-radius: 6px;
}
.top-item:last-child { border-bottom: none; }
.top-item:hover {
  background: #f5f7fa;
  transform: translateX(4px);
}

.top-rank {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.rank-gold   { background: #f59e0b; color: #ffffff; }
.rank-silver { background: #94a3b8; color: #ffffff; }
.rank-bronze { background: #c2855a; color: #ffffff; }
.rank-normal { background: #e4e7ed; color: #606266; }

.top-info { flex: 1; min-width: 0; }
.top-msg {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.top-meta { display: flex; gap: 4px; }

.top-count { text-align: right; flex-shrink: 0; }
.count-num { font-size: 18px; font-weight: 700; color: #f56c6c; }
.count-unit { font-size: 11px; color: #909399; margin-left: 2px; }

/* ─── 最近告警区块 ────────────────────────────── */
.alarm-section { margin-top: 8px; }
.alarm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.alarm-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e4e7ed;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: transform .2s, box-shadow .2s;
}
.alarm-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
}

.alarm-l1 { border-left: 4px solid #f56c6c; }
.alarm-l2 { border-left: 4px solid #e6a23c; }
.alarm-l3 { border-left: 4px solid #909399; }

.alarm-card-level {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(245,108,108,0.15);
  color: #f56c6c;
  height: fit-content;
  flex-shrink: 0;
}
.alarm-l2 .alarm-card-level { background: rgba(230,162,60,0.15); color: #e6a23c; }
.alarm-l3 .alarm-card-level { background: rgba(144,147,153,0.15); color: #909399; }

.alarm-card-body { flex: 1; min-width: 0; }
.alarm-card-msg {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}
.alarm-card-meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.meta-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f4f4f5;
  color: #909399;
}
.key-tag {
  background: #ecf5ff;
  color: #409eff;
  font-family: monospace;
  border: 1px solid #d9ecff;
}
.time-tag {
  margin-left: auto;
  background: transparent;
  color: #909399;
  padding: 0;
}

.view-all-link {
  font-size: 13px;
  color: #409eff;
  text-decoration: none;
  margin-left: auto;
  font-weight: 500;
  transition: color 0.15s;
}
.view-all-link:hover { color: #66b1ff; text-decoration: none; }

.empty-tip {
  text-align: center;
  color: #909399;
  font-size: 13px;
  padding: 32px 0;
}

/* ─── 代码块 ─────────────────────────────────── */
.code-block {
  background: #1e1e2e;
  padding: 14px;
  border-radius: 8px;
  overflow-x: auto;
  font-family: 'Fira Code', Consolas, Monaco, monospace;
  font-size: 12px;
  max-height: 320px;
  color: #cdd6f4;
  border: 1px solid #313244;
}
pre { margin: 0; white-space: pre-wrap; word-break: break-all; }

/* ─── 滚动条 ─────────────────────────────────── */
.top-list::-webkit-scrollbar { width: 5px; }
.top-list::-webkit-scrollbar-track { background: transparent; }
.top-list::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 3px; }
.top-list::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.2); }
</style>
