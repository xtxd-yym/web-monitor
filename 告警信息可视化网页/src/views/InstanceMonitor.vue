
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
            <el-form-item label="实例名称">
              <el-input v-model="queryParams.instance_name" placeholder="请输入" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="项目">
              <el-input v-model="queryParams.project" placeholder="请输入" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="AppKey">
              <el-input v-model="queryParams.appkey" placeholder="请输入" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20" style="margin-top: 10px">
           <el-col :span="6">
            <el-form-item label="客户名">
              <el-input v-model="queryParams.customer_name" placeholder="请输入" clearable />
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
           <el-icon><Monitor /></el-icon>
          <span>实例列表</span>
           <el-tag type="info" style="margin-left: 10px">共 {{ total }} 条</el-tag>
        </div>
      </template>

      <el-table
        :data="list"
        border
        style="width: 100%"
        v-loading="loading"
      >
      >
        <el-table-column prop="instance_id" label="ID" width="120" fixed show-overflow-tooltip />
        <el-table-column prop="instance_name" label="名称" width="150" show-overflow-tooltip />
        <el-table-column prop="project" label="项目" width="120" show-overflow-tooltip />
        <el-table-column label="AppKey/Customer" width="180" show-overflow-tooltip>
             <template #default="{ row }">
                <div v-if="row.rules_json">
                    <el-tag size="small" v-if="getRuleField(row, 'appkey')">App: {{ getRuleField(row, 'appkey') }}</el-tag>
                    <el-tag size="small" type="info" v-if="getRuleField(row, 'customer_name')" style="margin-left: 5px">Cust: {{ getRuleField(row, 'customer_name') }}</el-tag>
                </div>
            </template>
        </el-table-column>
        <el-table-column prop="index_code" label="指标代码" width="120" />
        <el-table-column prop="threshold" label="阈值" width="80" />
        <el-table-column prop="time_frame" label="时间窗口" width="100">
            <template #default="{ row }">
               {{ row.time_frame }} 秒
            </template>
        </el-table-column>
        <el-table-column prop="instance_status" label="状态" width="80">
             <template #default="{ row }">
                <el-tag :type="row.instance_status === 1 ? 'success' : 'danger'">{{ row.instance_status === 1 ? '启用' : '禁用' }}</el-tag>
            </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
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

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="实例详情" size="50%">
      <el-descriptions :column="1" border v-if="currentItem">
        <el-descriptions-item label="ID">{{ currentItem.instance_id }}</el-descriptions-item>
        <el-descriptions-item label="实例名称">{{ currentItem.instance_name }}</el-descriptions-item>
        <el-descriptions-item label="项目">{{ currentItem.project }}</el-descriptions-item>
        <el-descriptions-item label="关联指标代码">{{ currentItem.index_code }}</el-descriptions-item>
        <el-descriptions-item label="启用状态">
             <el-tag :type="currentItem.instance_status === 1 ? 'success' : 'danger'">{{ currentItem.instance_status === 1 ? '启用' : '禁用' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="阈值">{{ currentItem.threshold }}</el-descriptions-item>
        <el-descriptions-item label="时间窗口">{{ currentItem.time_frame }} 秒</el-descriptions-item>
        <el-descriptions-item label="规则配置">
          <pre v-if="currentItem.rules_json" style="margin: 0; max-height: 120px; overflow-y: auto; background: #f5f7fa; padding: 8px; border-radius: 4px; font-size: 12px;">{{ formatRulesJson(currentItem.rules_json) }}</pre>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(currentItem.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatTime(currentItem.updated_at) }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import request from '../api/request';
import { Search, Monitor } from '@element-plus/icons-vue';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const drawerVisible = ref(false);
const currentItem = ref(null);

const queryParams = reactive({
  instance_name: '',
  project: '',
  appkey: '',
  customer_name: '',
  page: 1,
  per: 10
});

const fetchData = async () => {
    loading.value = true;
    try {
        const res = await request.post('/instance/query/page', queryParams);
        // The backend returns { code: 1, result: { data: [], count: 0 } }
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
    queryParams.instance_name = '';
    queryParams.project = '';
    queryParams.appkey = '';
    queryParams.customer_name = '';
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

const formatRulesJson = (jsonStr) => {
    try {
        const obj = JSON.parse(jsonStr);
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        return jsonStr;
    }
};

const getRuleField = (row, field) => {
    try {
        if (!row.rules_json) return '';
        const rules = JSON.parse(row.rules_json);
        return rules[field] || '';
    } catch (e) {
        return '';
    }
};

const getLevelType = (level) => {
    switch(level) {
        case 'L1': return 'danger';
        case 'L2': return 'warning';
        case 'L3': return 'primary';
        default: return 'info';
    }
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
  flex-shrink: 0;
}

.list-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

:deep(.el-table) {
  flex: 1;
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
