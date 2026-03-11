
<template>
  <div class="dashboard-container">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>总错误数</span>
              <el-tag type="danger">Total</el-tag>
            </div>
          </template>
          <div class="card-value">{{ stats.total || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>JS错误</span>
              <el-tag>Javascript</el-tag>
            </div>
          </template>
          <div class="card-value">{{ stats.byType?.javascript || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>资源错误</span>
              <el-tag type="warning">Resource</el-tag>
            </div>
          </template>
          <div class="card-value">{{ stats.byType?.resource || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>接口错误</span>
              <el-tag type="info">API</el-tag>
            </div>
          </template>
          <div class="card-value">{{ (stats.byType?.['network-error'] || 0) + (stats.byType?.fetch || 0) + (stats.byType?.xhr || 0) }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选条件 -->
    <el-row style="margin-top: 20px;">
      <el-col :span="24">
        <el-card shadow="never">
          <el-form :inline="true" size="default">
            <el-form-item label="项目">
              <el-select v-model="filters.project" placeholder="选择项目" style="width: 180px" clearable filterable @change="refreshData">
                <el-option v-for="item in projectOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="环境">
              <el-select v-model="filters.env" style="width: 120px" @change="refreshData">
                <el-option label="生产" value="production" />
                <el-option label="开发" value="development" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="refreshData">刷新</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="16">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>错误趋势 (24h)</span>
            </div>
          </template>
          <div ref="chartRef" style="height: 350px;"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>高频错误 Top 5</span>
            </div>
          </template>
          <el-table :data="(stats.topErrors || []).slice(0, 5)" style="width: 100%" size="small">
            <el-table-column prop="message" label="信息" show-overflow-tooltip />
            <el-table-column prop="count" label="次数" width="60" align="center" />
            <el-table-column label="操作" width="60" align="center">
              <template #default="scope">
                <el-button link type="primary" size="small" @click="goToErrorDetail(scope.row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 错误详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="错误详情" size="50%">
      <div v-if="currentError">
        <h3>基本信息</h3>
        <el-descriptions border :column="1">
          <el-descriptions-item label="类型">{{ currentError.error_type }}</el-descriptions-item>
          <el-descriptions-item label="信息">{{ currentError.error_message }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ new Date(currentError.created_at).toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="文件">{{ currentError.error_file || '-' }}</el-descriptions-item>
          <el-descriptions-item label="位置">行 {{ currentError.error_line || 0 }}, 列 {{ currentError.error_col || 0 }}</el-descriptions-item>
        </el-descriptions>
        <h3>堆栈信息</h3>
        <div class="code-block">
          <pre>{{ currentError.parsedData?.original_stack || currentError.error_stack || '-' }}</pre>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import request from '../api/request';

const router = useRouter();
const stats = ref({});
const chartRef = ref(null);
let myChart = null;

// 抽屉状态
const drawerVisible = ref(false);
const currentError = ref(null);

// 筛选条件
const filters = reactive({
  project: '',
  env: 'production'
});

const projectOptions = ref([]);

// 获取项目列表
const fetchProjects = async () => {
    try {
        const res = await request.get('/errors/projects');
        if (res.success) {
            projectOptions.value = res.data;
            // 默认选中第一个
            if (projectOptions.value.length > 0) {
                filters.project = projectOptions.value[0];
            }
        }
    } catch (e) {
        console.error('Fetch projects failed', e);
    }
};

// 查看错误详情
const goToErrorDetail = async (row) => {
  if (!row.id) {
    console.warn('No error ID available');
    return;
  }
  try {
    const res = await request.get(`/errors/${row.id}`);
    if (res.success && res.data) {
      // Parse extra_data
      let parsedData = {};
      if (res.data.extra_data) {
        try {
          parsedData = typeof res.data.extra_data === 'string' ? JSON.parse(res.data.extra_data) : res.data.extra_data;
        } catch (e) { /* ignore */ }
      }
      currentError.value = { ...res.data, parsedData };
      drawerVisible.value = true;
    }
  } catch (e) {
    console.error('Fetch error detail failed', e);
  }
};

// 获取统计数据
const fetchStats = async () => {
  if (!filters.project) return; // Don't fetch if no project selected
  try {
    const res = await request.get('/errors/stats', {
      params: {
        project: filters.project,
        env: filters.env
      }
    });
    if (res.success) {
      stats.value = res.data;
    }
  } catch (error) {
    console.error('Fetch stats failed', error);
  }
};

// 获取趋势数据并渲染图表
const fetchTrend = async () => {
  if (!filters.project) return;
  try {
    // 获取过去24小时的数据
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000;
    
    const res = await request.get('/errors/trend', {
      params: {
        project: filters.project,
        env: filters.env,
        startTime,
        endTime,
        interval: 'hour'
      }
    });

    if (res.success && res.data.timeline) {
      initChart(res.data.timeline);
    }
  } catch (error) {
    console.error('Fetch trend failed', error);
  }
};

const refreshData = async () => {
  await fetchStats();
  await fetchTrend();
};

const initChart = (data) => {
  if (!chartRef.value) return;
  
  if (myChart) myChart.dispose();
  myChart = echarts.init(chartRef.value);

  const times = data.map(item => {
    // 格式化时间 HH:mm
    const date = new Date(item.time);
    return `${date.getHours()}:00`;
  });
  const counts = data.map(item => item.count);

  const option = {
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: times
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        data: counts,
        type: 'line',
        smooth: true,
        areaStyle: {
          opacity: 0.3
        },
        itemStyle: {
          color: '#409EFF'
        }
      }
    ],
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    }
  };

  myChart.setOption(option);
};

onMounted(async () => {
  // First fetch projects, then fetch data
  await fetchProjects();
  await refreshData();
  
  window.addEventListener('resize', () => {
    myChart && myChart.resize();
  });
});
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-value {
  font-size: 28px;
  font-weight: bold;
  text-align: center;
  color: #303133;
}
.code-block {
  background: #f4f4f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: monospace;
  font-size: 12px;
  margin-top: 10px;
  max-height: 300px;
}
</style>
