<template>
  <div class="appkey-manager">
    <div class="page-header">
      <h2>AppKey 接入管理</h2>
      <p class="page-desc">管理各个业务线、Web组件或小程序的监控 AppKey，以及相关负责人信息。</p>
    </div>

    <!-- 工具栏 -->
    <el-card class="toolbar-card" shadow="never">
      <div class="toolbar">
        <el-input v-model="queryParams.appkey" placeholder="搜索 AppKey" style="width: 200px" clearable @keyup.enter="fetchData" />
        <el-input v-model="queryParams.customer_name" placeholder="客户名称" style="width: 200px" clearable @keyup.enter="fetchData" />
        <el-input v-model="queryParams.service_name" placeholder="组件/服务名" style="width: 200px" clearable @keyup.enter="fetchData" />
        <el-button type="primary" :icon="Search" @click="fetchData">查询</el-button>
        <el-button @click="resetQuery">重置</el-button>
        <div style="flex: 1"></div>
        <el-button type="success" :icon="Plus" @click="showCreateDialog">登记新组件(AppKey)</el-button>
      </div>
    </el-card>

    <!-- 列表 -->
    <el-card class="list-card" shadow="never">
      <el-table v-loading="loading" :data="tableData" style="width: 100%">
        <el-table-column prop="appkey" label="AppKey" min-width="250">
          <template #default="{ row }">
            <span class="appkey-text">{{ row.appkey }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="customer_name" label="客户名称" min-width="150" />
        <el-table-column prop="service_name" label="服务/组件名" min-width="150" />
        <el-table-column prop="owner" label="负责人" min-width="120" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'">
              {{ row.status === 1 ? '已启用' : '已禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="登记时间" width="180">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="{ row }">
            <el-button 
              link 
              :type="row.status === 1 ? 'danger' : 'success'" 
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="queryParams.page"
          v-model:page-size="queryParams.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <!-- 创建弹窗 -->
    <el-dialog v-model="dialogVisible" title="登记新组件与 AppKey" width="500px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="AppKey" prop="appkey">
          <el-input v-model="form.appkey" placeholder="例如: 100a-200b-300c-400d" />
        </el-form-item>
        <el-form-item label="客户名称" prop="customer_name">
          <el-input v-model="form.customer_name" placeholder="例如: 某某证券" />
        </el-form-item>
        <el-form-item label="组件名" prop="service_name">
          <el-input v-model="form.service_name" placeholder="例如: H5开户组件" />
        </el-form-item>
        <el-form-item label="负责人" prop="owner">
          <el-input v-model="form.owner" placeholder="例如: 张三" />
          <div style="font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.2;">
            填写组件的主要前端研发或实施人员名称，便于后续告警联系。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="submitForm">确定保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import request from '../api/request.js';

// ---- 状态 ----
const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const queryParams = reactive({
  page: 1,
  pageSize: 20,
  appkey: '',
  customer_name: '',
  service_name: ''
});

// 弹窗状态
const dialogVisible = ref(false);
const submitting = ref(false);
const formRef = ref(null);
const form = reactive({
  appkey: '',
  customer_name: '',
  service_name: '',
  owner: ''
});

const rules = {
  appkey: [{ required: true, message: '请输入由系统分配或自定义的唯一 AppKey', trigger: 'blur' }],
  customer_name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  service_name: [{ required: true, message: '请输入关联的服务或组件名称', trigger: 'blur' }]
};

// ---- 初始化 ----
onMounted(() => {
  fetchData();
});

// ---- 方法 ----
async function fetchData() {
  loading.value = true;
  try {
    const res = await request.get('/appkey/list', { params: queryParams });
    if (res.success) {
      tableData.value = res.data.data || [];
      total.value = res.data.total || 0;
    }
  } catch (error) {
    ElMessage.error('查询列表失败: ' + error.message);
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  queryParams.appkey = '';
  queryParams.customer_name = '';
  queryParams.service_name = '';
  queryParams.page = 1;
  fetchData();
}

function showCreateDialog() {
  dialogVisible.value = true;
}

function resetForm() {
  if (formRef.value) formRef.value.resetFields();
  form.appkey = '';
  form.customer_name = '';
  form.service_name = '';
  form.owner = '';
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true;
      try {
        const res = await request.post('/appkey/create', form);
        if (res.success) {
          ElMessage.success('登记成功');
          dialogVisible.value = false;
          fetchData();
        }
      } catch (error) {
        ElMessage.error(error.message || '登记失败');
      } finally {
        submitting.value = false;
      }
    }
  });
}

async function toggleStatus(row) {
  const isEnable = row.status === 0;
  const actionText = isEnable ? '启用' : '禁用';
  
  try {
    await ElMessageBox.confirm(
      `确定要${actionText}该 AppKey：[${row.appkey}] 吗？<br>禁用后，使用该 AppKey 的所有前端探针数据上报将被强制拒绝并丢弃！`,
      '风险提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: isEnable ? 'success' : 'warning',
        dangerouslyUseHTMLString: true
      }
    );
    
    const targetStatus = isEnable ? 1 : 0;
    const res = await request.post('/appkey/updateStatus', {
      id: row.id,
      status: targetStatus
    });
    
    if (res.success) {
      ElMessage.success(`${actionText}成功`);
      fetchData(); // 重新加载数据
    }
  } catch (cancel) {
    // cancelled
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
</script>

<style scoped>
.appkey-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.page-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.toolbar-card :deep(.el-card__body) {
  padding: 14px 20px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.list-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.list-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.appkey-text {
  font-family: monospace;
  background-color: #f4f4f5;
  padding: 2px 6px;
  border-radius: 4px;
  color: #909399;
  user-select: all;
  cursor: copy;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
