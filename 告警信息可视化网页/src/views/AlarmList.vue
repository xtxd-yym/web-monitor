
<template>
  <div class="alarm-list-container">
    <el-card>
      <!-- 搜索栏 -->
      <el-form :inline="true" :model="form" class="demo-form-inline" size="default">
        <el-form-item label="项目">
          <el-input v-model="form.project" placeholder="输入项目名" clearable />
        </el-form-item>
        <el-form-item label="实例ID">
          <el-input v-model="form.instance_id" placeholder="输入实例ID" clearable />
        </el-form-item>
        <el-form-item label="时间">
           <el-date-picker
            v-model="form.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="x" 
            :default-time="defaultTime"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="Pending" value="pending" />
            <el-option label="Resolved" value="resolved" />
            <el-option label="Ignored" value="ignored" />
          </el-select>
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="form.level" placeholder="全部" clearable style="width: 120px">
            <el-option label="L1 (严重)" value="L1" />
            <el-option label="L2 (警告)" value="L2" />
            <el-option label="L3 (提示)" value="L3" />
            <el-option label="L4 (关注)" value="L4" />
            <el-option label="L5 (信息)" value="L5" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" border style="width: 100%" v-loading="loading">
        <el-table-column prop="alarm_level" label="等级" width="100" align="center">
          <template #default="scope">
            <el-tag :type="getLevelTag(scope.row.alarm_level)">{{ scope.row.alarm_level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="实例" width="200" show-overflow-tooltip>
             <template #default="scope">
                 <div>{{ scope.row.instance_name }}</div>
                 <div style="font-size: 12px; color: #909399">{{ scope.row.instance_uuid }}</div>
             </template>
        </el-table-column>
        <el-table-column prop="alarm_message" label="告警内容" min-width="250" show-overflow-tooltip />
        <el-table-column prop="customer_name" label="客户名" width="120" show-overflow-tooltip />
        <el-table-column prop="appkey" label="AppKey" width="120" show-overflow-tooltip />
        <el-table-column prop="service_name" label="服务名" width="120" show-overflow-tooltip />
        <el-table-column prop="alarm_status" label="状态" width="100" align="center">
          <template #default="scope">
              <el-tag :type="getStatusTag(scope.row.alarm_status)" effect="dark">{{ scope.row.alarm_status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="触发时间" width="180">
          <template #default="scope">
            {{ new Date(scope.row.created_at).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="scope">
            <el-popconfirm title="确定删除这条告警记录吗?" @confirm="handleDelete(scope.row)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="handleSearch"
          @current-change="loadData"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';

const form = reactive({
  project: '',
  instance_id: '',
  dateRange: [],
  status: '',
  level: ''
});

const defaultTime = [
  new Date(2000, 1, 1, 0, 0, 0),
  new Date(2000, 2, 1, 23, 59, 59),
];

const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const getLevelTag = (level) => {
  const map = { L1: 'danger', L2: 'warning', L3: 'info', L4: 'success', L5: '' };
  return map[level] || 'info';
};

const getStatusTag = (status) => {
  const map = { pending: 'warning', resolved: 'success', ignored: 'info' };
  return map[status] || 'info';
};

const loadData = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      per: pageSize.value,
      project: form.project,
      status: form.status,
      level: form.level,
      instance_id: form.instance_id
    };

    if (form.dateRange && form.dateRange.length === 2) {
        params.startTime = form.dateRange[0];
        params.endTime = form.dateRange[1];
    }

    const res = await request.post('/alarm/query/page', params);
    if (res.code === 1) {
      tableData.value = res.result.data;
      total.value = res.result.count;
    }
  } catch (e) {
    ElMessage.error('加载告警列表失败');
  } finally {
    loading.value = false;
  }
};

const handleDelete = async (row) => {
  try {
    const res = await request.post('/alarm/delete', { id: row.id });
    if (res.success || res.code === 1) {
      ElMessage.success('删除成功');
      loadData();
    } else {
      ElMessage.error(res.msg || '删除失败');
    }
  } catch (e) {
    ElMessage.error('删除请求失败');
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  loadData();
};

const resetForm = () => {
  form.project = '';
  form.instance_id = '';
  form.dateRange = [];
  form.status = '';
  form.level = '';
  handleSearch();
};

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.alarm-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

:deep(.el-card) {
  display: flex;
  flex-direction: column;
  flex: 1;
}

:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
}

:deep(.el-table) {
  flex: 1;
}

.pagination-container {
  margin-top: 15px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
</style>
