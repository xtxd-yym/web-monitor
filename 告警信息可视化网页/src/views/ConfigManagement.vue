
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
          <!-- 参数说明面板 -->
          <el-collapse v-model="helpExpanded" class="config-help-collapse">
            <el-collapse-item name="help">
              <template #title>
                <el-icon style="margin-right: 4px; color: #409eff"><InfoFilled /></el-icon>
                <span style="font-size: 13px; color: #409eff; font-weight: 500">查看参数说明</span>
              </template>
              <el-table :data="configHelpItems" size="small" border class="config-help-table">
                <el-table-column prop="key" label="配置项" width="220" />
                <el-table-column prop="type" label="类型" width="70" />
                <el-table-column prop="default" label="默认值" width="80" />
                <el-table-column prop="desc" label="功能说明" />
              </el-table>
            </el-collapse-item>
          </el-collapse>
          <!-- 配置 JSON 编辑区 -->
          <el-input
            v-model="formData.config_json"
            type="textarea"
            :rows="14"
            placeholder="请输入JSON格式的配置"
            class="config-json-input"
            spellcheck="false"
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
import { InfoFilled } from '@element-plus/icons-vue';
import request from '../api/request';

const loading = ref(false);
const submitLoading = ref(false);
const dialogVisible = ref(false);
const viewDialogVisible = ref(false);
const isEdit = ref(false);
const dialogTitle = ref('新增配置');
const configFormRef = ref(null);
const helpExpanded = ref([]); // 默认折叠

// 配置参数说明数据
const configHelpItems = [
  // 顶层
  { key: 'enabled', type: 'boolean', default: 'true', desc: '全局开关：是否启用监控 SDK，关闭后所有监控功能停止' },
  // config.*
  { key: 'config.enableErrorMonitoring', type: 'boolean', default: 'true', desc: '是否监控 JS 运行时错误（window.onerror）' },
  { key: 'config.enablePromiseRejection', type: 'boolean', default: 'true', desc: '是否监控 Promise 未处理的拒绝（unhandledrejection）' },
  { key: 'config.enableResourceErrors', type: 'boolean', default: 'true', desc: '是否监控资源加载失败（img/script/link 等）' },
  { key: 'config.enableNetworkMonitoring', type: 'boolean', default: 'true', desc: '是否监控网络请求（XHR + Fetch 层面）' },
  { key: 'config.enableXHRMonitoring', type: 'boolean', default: 'true', desc: '是否监控 XMLHttpRequest 请求（依赖 enableNetworkMonitoring）' },
  { key: 'config.enableFetchMonitoring', type: 'boolean', default: 'true', desc: '是否监控 Fetch API 请求（依赖 enableNetworkMonitoring）' },
  { key: 'config.enablePerformanceMonitoring', type: 'boolean', default: 'false', desc: '是否采集性能指标（FCP/LCP/CLS/TTFB），开启后有小幅性能消耗' },
  { key: 'config.enableWhiteScreenDetection', type: 'boolean', default: 'true', desc: '是否开启白屏检测功能，页面白屏时自动上报' },
  { key: 'config.whiteScreenConfirmations', type: 'number', default: '2', desc: '白屏连续确认次数，最低为 2' },
  { key: 'config.whiteScreenConfirmationDelay', type: 'number', default: '1000', desc: '两次白屏确认之间的等待时间（毫秒）' },
  { key: 'config.whiteScreenRecoveryInterval', type: 'number', default: '2000', desc: '已确认白屏后的恢复检查间隔（毫秒）' },
  { key: 'config.whiteScreenRelatedErrorWindow', type: 'number', default: '30000', desc: '白屏关联 JS/资源/网络错误的时间窗口（毫秒）' },
  { key: 'config.whiteScreenRootSelectors', type: 'string[]', default: '["#app", "#root", "[id^=\\"app\\"]", ".app", ".container", "main"]', desc: '业务根容器选择器；可按组件实际挂载节点补充' },
  { key: 'config.enableUserTracking', type: 'boolean', default: 'false', desc: '是否记录用户行为（点击/滚动/页面切换）作为面包屑，开启后 payload 增大' },
  { key: 'config.maxErrorsPerMinute', type: 'number', default: '100', desc: '客户端限流：每分钒最多上报多少条错误，超出后丢弃，防止刷屏攻击' },
  { key: 'config.dedupeWindow', type: 'number', default: '300', desc: '错误去重时间窗口（秒），相同错误在该时间内只上报一次' },
  { key: 'config.logLevel', type: 'string', default: '"warn"', desc: 'SDK 内部日志级别，可选 debug / info / warn / error，不影响上报行为' },
  { key: 'config.samplingRates.javascript', type: 'number', default: '1.0', desc: 'JS 错误采样率，1.0 = 100%，0.5 = 随机采样 50%' },
  { key: 'config.samplingRates.promise', type: 'number', default: '1.0', desc: 'Promise 拒绝采样率' },
  { key: 'config.samplingRates.resource', type: 'number', default: '0.5', desc: '资源错误采样率' },
  { key: 'config.samplingRates.network', type: 'number', default: '0.3', desc: '网络错误采样率' },
  { key: 'config.ignoreResourceUrls', type: 'string[]', default: '[]', desc: '精准忽略资源 URL；字符串按 URL 片段匹配，仅填写已确认无须处理的资源' },
  { key: 'config.ignoreNetworkUrls', type: 'string[]', default: '[]', desc: '精准忽略网络 URL；字符串按 URL 片段匹配，仅填写已确认无须处理的接口' },
  // grayControl.*
  { key: 'grayControl.enabled', type: 'boolean', default: 'false', desc: '是否开启灰度发布，可按比例/用户列表渐进接入' },
  { key: 'grayControl.strategy', type: 'string', default: '"percentage"', desc: '灰度策略：percentage（比例）/ whitelist（白名单）' },
  { key: 'grayControl.percentage', type: 'number', default: '100', desc: '灰度比例 0~100，100 = 全量接入' },
  // emergency.*
  { key: 'emergency.closeMonitor', type: 'boolean', default: 'false', desc: '紧急开关：true 时远程关闭所有客户端监控，无需发版' },
  { key: 'emergency.reason', type: 'string/null', default: 'null', desc: '紧急关闭原因，会在客户端控制台弹出告警日志' },
];

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
        whiteScreenConfirmations: 2,
        whiteScreenConfirmationDelay: 1000,
        whiteScreenRecoveryInterval: 2000,
        whiteScreenRelatedErrorWindow: 30000,
        whiteScreenRootSelectors: ['#app', '#root', '[id^="app"]', '.app', '.container', 'main'],
        enableUserTracking: false,
        samplingRates: {
          javascript: 1.0,
          promise: 1.0,
          resource: 0.5,
          network: 0.3
        },
        ignoreResourceUrls: [],
        ignoreNetworkUrls: [],
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

/* 参数说明面板 */
.config-help-collapse {
  width: 100%;
  margin-bottom: 8px;
  border: 1px solid #e6e9f0;
  border-radius: 4px;
  background: #fafbff;
}

:deep(.config-help-collapse .el-collapse-item__header) {
  padding: 0 12px;
  height: 36px;
  background: #f0f5ff;
  border-radius: 4px 4px 0 0;
}

:deep(.config-help-collapse .el-collapse-item__content) {
  padding: 8px;
}

.config-help-table {
  font-size: 12px;
}

:deep(.config-help-table .el-table__cell) {
  padding: 4px 8px;
}

.config-json-input {
  width: 100%;
}

:deep(.config-json-input textarea) {
  font-family: 'Courier New', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}
</style>
