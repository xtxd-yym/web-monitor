
<template>
  <div class="monitor-view">
    <!-- 查询表单 -->
    <el-card class="query-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <el-icon><Search /></el-icon>
          <span>查询条件</span>
        </div>
      </template>
      <el-form :model="queryParams" label-width="80px" class="query-form">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-form-item label="指标名称">
              <el-input v-model="queryParams.index_name" placeholder="请输入" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="指标代码">
              <el-input v-model="queryParams.index_code" placeholder="请输入" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item>
              <el-button type="primary" @click="fetchData" :loading="loading">查询</el-button>
              <el-button @click="resetQuery">重置</el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-card class="list-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <el-icon><DataLine /></el-icon>
          <span>指标列表</span>
           <el-tag type="info" style="margin-left: 10px">共 {{ total }} 条</el-tag>
        </div>
      </template>
      
      <el-table
        :data="list"
        border
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="index_code" label="指标代码" width="180" />
        <el-table-column prop="index_name" label="指标名称" width="200" />
        <el-table-column prop="index_desc" label="描述" show-overflow-tooltip />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="showDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

       <div class="pagination-container">
        <el-pagination
          v-model:current-page="queryParams.page"
          v-model:page-size="queryParams.per"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-drawer v-model="drawerVisible" title="指标详情" size="40%">
      <el-descriptions :column="1" border v-if="currentItem">
        <el-descriptions-item label="指标代码">{{ currentItem.index_code }}</el-descriptions-item>
        <el-descriptions-item label="指标名称">{{ currentItem.index_name }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ currentItem.index_desc }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import request from '../api/request';
import { Search, DataLine } from '@element-plus/icons-vue';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const drawerVisible = ref(false);
const currentItem = ref(null);

const queryParams = reactive({
  index_name: '',
  index_code: '',
  page: 1,
  per: 10
});

const fetchData = async () => {
    loading.value = true;
    try {
        const res = await request.post('/index/query/page', queryParams);
        // The backend returns { code: 1, result: { data: [], count: 0 } }
        // request.js returns res directly.
        if (res.code === 1 && res.result) {
            list.value = res.result.data;
            total.value = res.result.count;
        }
    } catch (e) {
        console.error(e);
    } finally {
        loading.value = false;
    }
};

const resetQuery = () => {
    queryParams.index_name = '';
    queryParams.index_code = '';
    queryParams.page = 1;
    fetchData();
};

const showDetail = (row) => {
    currentItem.value = row;
    drawerVisible.value = true;
};

const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString();
};

onMounted(() => {
    fetchData();
});
</script>

<style scoped>
.monitor-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.query-card {
  flex-shrink: 0; /* Keep query form size fixed */
}

.list-card {
  flex: 1; /* Take remaining space */
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Prevent card from expanding beyond container */
}

/* Deep selector to make table take available height */
:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

:deep(.el-table) {
  flex: 1; /* Table takes remaining space inside card body */
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pagination-container {
    margin-top: 15px;
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
}
</style>
