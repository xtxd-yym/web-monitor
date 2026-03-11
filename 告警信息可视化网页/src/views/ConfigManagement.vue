
<template>
  <div class="config-management">
    <!-- 搜索和添加 -->
    <el-card class="search-card" shadow="hover">
      <el-form :inline="true" :model="searchForm" size="default">
        <el-form-item label="AppKey">
          <el-input v-model="searchForm.appkey" placeholder="输入AppKey" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="客户名">
          <el-input v-model="searchForm.customer_name" placeholder="输入客户名" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
          <el-button type="success" @click="showAddDialog">新增配置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 配置列表 -->
    <el-card class="list-card" shadow="hover" style="margin-top: 20px">
      <el-table :data="configList" border v-loading="loading" style="width: 100%">
        <el-table-column prop="appkey" label="AppKey" width="180" />
        <el-table-column prop="customer_name" label="客户名" width="150" />
        <el-table-column prop="project" label="项目" width="150" />
        <el-table-column prop="env" label="环境" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.env === 'production' ? 'success' : 'info'">
              {{ scope.row.env }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="180">
          <template #default="scope">
            {{ new Date(scope.row.updated_at).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="viewConfig(scope.row)">查看</el-button>
            <el-button link type="warning" size="small" @click="editConfig(scope.row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="deleteConfig(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="70%"
      :close-on-click-modal="false"
    >
      <el-form :model="formData" label-width="120px" :rules="formRules" ref="configFormRef">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="AppKey" prop="appkey">
              <el-input v-model="formData.appkey" :disabled="isEdit" placeholder="组件AppKey" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户名" prop="customer_name">
              <el-input v-model="formData.customer_name" :disabled="isEdit" placeholder="客户名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="项目名">
              <el-input v-model="formData.project" placeholder="项目名（可选）" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="环境">
              <el-select v-model="formData.env" style="width: 100%">
                <el-option label="生产环境" value="production" />
                <el-option label="开发环境" value="development" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="配置内容" prop="config_json">
          <el-input
            v-model="formData.config_json"
            type="textarea"
            :rows="15"
            placeholder="请输入JSON格式的配置"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm" :loading="submitLoading">提交</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看配置对话框 -->
    <el-dialog v-model="viewDialogVisible" title="配置详情" width="60%">
      <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto;">{{
        viewConfigData
      }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '../api/request';

const loading = ref(false);
const submitLoading = ref(false);
const dialogVisible = ref(false);
const viewDialogVisible = ref(false);
const isEdit = ref(false);
const dialogTitle = ref('新增配置');
const configFormRef = ref(null);

const searchForm = reactive({
  appkey: '',
  customer_name: ''
});

const configList = ref([]);
const viewConfigData = ref('');

const formData = reactive({
  appkey: '',
  customer_name: '',
  project: '',
  env: 'production',
  config_json: ''
});

const formRules = {
  appkey: [{ required: true, message: '请输入AppKey', trigger: 'blur' }],
  customer_name: [{ required: true, message: '请输入客户名', trigger: 'blur' }],
  config_json: [
    { required: true, message: '请输入配置内容', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        try {
          JSON.parse(value);
          callback();
        } catch (e) {
          callback(new Error('配置内容必须是有效的JSON格式'));
        }
      },
      trigger: 'blur'
    }
  ]
};

const loadList = async () => {
  loading.value = true;
  try {
    const res = await request.get('/config/list', {
      params: searchForm
    });
    if (res.success) {
      configList.value = res.data || [];
    }
  } catch (error) {
    ElMessage.error('加载配置列表失败');
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const resetSearch = () => {
  searchForm.appkey = '';
  searchForm.customer_name = '';
  loadList();
};

const showAddDialog = () => {
  isEdit.value = false;
  dialogTitle.value = '新增配置';
  Object.assign(formData, {
    appkey: '',
    customer_name: '',
    project: '',
    env: 'production',
    config_json: JSON.stringify({
      enabled: true,
      config: {
        enableErrorMonitoring: true,
        enablePromiseRejection: true,
        enableResourceErrors: true,
        enableNetworkMonitoring: true,
        enableXHRMonitoring: true,
        enableFetchMonitoring: true,
        enablePerformanceMonitoring: false,
        enableWhiteScreenDetection: true,
        enableUserTracking: false,
        samplingRates: {
          javascript: 1.0,
          promise: 1.0,
          resource: 0.5,
          network: 0.3
        },
        maxErrorsPerMinute: 100,
        dedupeWindow: 300,
        logLevel: 'warn'
      },
      grayControl: {
        enabled: false,
        strategy: 'percentage',
        percentage: 100
      },
      emergency: {
        closeMonitor: false,
        reason: null
      }
    }, null, 2)
  });
  dialogVisible.value = true;
};

const viewConfig = (row) => {
  viewConfigData.value = JSON.stringify(row.config || JSON.parse(row.config_json || '{}'), null, 2);
  viewDialogVisible.value = true;
};

const editConfig = (row) => {
  isEdit.value = true;
  dialogTitle.value = '编辑配置';
  Object.assign(formData, {
    id: row.id,
    appkey: row.appkey,
    customer_name: row.customer_name,
    project: row.project || '',
    env: row.env || 'production',
    config_json: JSON.stringify(row.config || JSON.parse(row.config_json || '{}'), null, 2)
  });
  dialogVisible.value = true;
};

const submitForm = async () => {
  if (!configFormRef.value) return;

  try {
    await configFormRef.value.validate();
  } catch (e) {
    return;
  }

  submitLoading.value = true;
  try {
    const config = JSON.parse(formData.config_json);
    const res = await request.post('/config/update', {
      appkey: formData.appkey,
      customer_name: formData.customer_name,
      project: formData.project,
      env: formData.env,
      config
    });

    if (res.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '添加成功');
      dialogVisible.value = false;
      loadList();
    } else {
      throw new Error(res.msg || '操作失败');
    }
  } catch (error) {
    ElMessage.error(error.message || '操作失败');
    console.error(error);
  } finally {
    submitLoading.value = false;
  }
};

const deleteConfig = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除 ${row.appkey} - ${row.customer_name} 的配置吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    const res = await request.post('/config/delete', {
      appkey: row.appkey,
      customer_name: row.customer_name
    });
    if (res.success) {
      ElMessage.success('删除成功');
      loadList();
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败');
      console.error(error);
    }
  }
};

onMounted(() => {
  loadList();
});
</script>

<style scoped>
.config-management {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-card {
  flex-shrink: 0;
}

.list-card {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.list-card .el-card__body) {
  flex: 1;
  overflow: auto;
}
</style>
