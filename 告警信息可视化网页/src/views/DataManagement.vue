
<template>
  <div class="data-management">
    <!-- 接口选择 -->
    <el-card class="select-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <el-icon><Setting /></el-icon>
          <span>选择操作接口</span>
        </div>
      </template>
      <el-form label-width="120px">
        <el-form-item label="接口选择">
          <el-select v-model="selectedApi" placeholder="请选择接口" style="width: 100%" @change="handleApiChange">
            <el-option
              v-for="api in apiOptions"
              :key="api.value"
              :label="api.label"
              :value="api.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 参数输入区域 -->
    <el-card v-if="selectedApi" class="params-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <el-icon><Edit /></el-icon>
          <span>参数配置</span>
        </div>
      </template>
      
      <!-- 指标相关接口 -->
      <div v-if="selectedApi.includes('index')">
        <el-form :model="formData" label-width="120px" class="params-form">
          <el-row :gutter="20">
            <el-col :span="12" v-if="hasField('index_id')">
              <el-form-item label="指标ID" required>
                <el-input v-model="formData.index_id" placeholder="请输入指标ID (英文唯一标识)" />
              </el-form-item>
            </el-col>
            <el-col :span="12" v-if="hasField('index_name')">
              <el-form-item label="指标名" :required="!isDelete">
                <el-input v-model="formData.index_name" placeholder="请输入指标名" />
              </el-form-item>
            </el-col>
            <el-col :span="24" v-if="hasField('description') && !isDelete">
              <el-form-item label="描述">
                <el-input v-model="formData.description" type="textarea" :rows="3" placeholder="请输入描述" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </div>

      <!-- 实例相关接口 -->
      <div v-if="selectedApi.includes('instance')">
        <el-form :model="formData" label-width="140px" class="params-form">
          <el-row :gutter="20">
            <!-- 实例特有字段: delete只保留ID -->
            <!-- 实例ID: 更新时使用联想，删除时普通输入 -->
            <el-col :span="12" v-if="hasField('instance_id')">
              <el-form-item label="实例ID" required>
                 <!-- 更新模式：联想输入 -->
                <el-autocomplete
                  v-if="selectedApi.includes('update')"
                  v-model="formData.instance_id"
                  :fetch-suggestions="querySearchInstance"
                  placeholder="请输入或搜索实例ID"
                  @select="handleInstanceSelect"
                  style="width: 100%"
                  clearable
                >
                  <template #default="{ item }">
                    <span style="float: left">{{ item.instance_id }}</span>
                    <span style="float: right; color: #8492a6; font-size: 13px">{{ item.instance_name }}</span>
                  </template>
                </el-autocomplete>
                <!-- 添加/删除模式：普通输入 -->
                <el-input v-else v-model="formData.instance_id" placeholder="请输入实例ID (唯一标识)" />
              </el-form-item>
            </el-col>
            
            <template v-if="!isDelete">
              <el-col :span="12">
                <el-form-item label="告警名称" required>
                  <el-input v-model="formData.instance_name" placeholder="请输入告警名称" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="AppKey" required>
                  <el-input v-model="formData.appkey" placeholder="请输入AppKey (SDK初始化时使用)" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="客户名" required>
                  <el-input v-model="formData.customer_name" placeholder="请输入客户名" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="项目名" required>
                  <el-input v-model="formData.project_name" placeholder="请输入项目名" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="关联指标ID" required>
                  <el-select
                    v-model="formData.index_id"
                    placeholder="请选择关联指标"
                    style="width: 100%"
                    filterable
                    clearable
                  >
                    <el-option
                      v-for="idx in indexOptions"
                      :key="idx.index_code"
                      :label="`${idx.index_name} (${idx.index_code})`"
                      :value="idx.index_code"
                    >
                      <div class="index-option">
                        <span class="index-option__name">{{ idx.index_name }}</span>
                        <el-tag size="small" type="info">{{ idx.index_code }}</el-tag>
                      </div>
                    </el-option>
                  </el-select>
                  <div v-if="indexOptions.length === 0 && !indexLoading" class="index-hint">
                    暂无可用指标，请先在『添加指标』接口中添加
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="阈值" required>
                  <el-input-number v-model="formData.threshold" :min="minimumThreshold" placeholder="请输入阈值" style="width: 100%" />
                  <div v-if="formData.level === 'L1'" class="field-tip">L1 至少连续发生 2 次才允许触发，单次异常不会发送最高级别告警。</div>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="时间范围(秒)" required>
                  <el-input-number v-model="formData.time_frame" :min="1" placeholder="请输入时间范围" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="异常输出" required>
                  <el-input v-model="formData.output" placeholder="请输入异常输出信息" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="告警等级" required>
                  <el-select v-model="formData.level" placeholder="请选择告警等级" style="width: 100%">
                    <el-option v-for="level in levelOptions" :key="level" :label="level" :value="level" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="是否启用" required>
                  <el-switch v-model="formData.enabled" active-text="启用" inactive-text="禁用" />
                </el-form-item>
              </el-col>
               <el-col :span="12">
                <el-form-item label="重复次数" required>
                  <el-input-number v-model="formData.repeat_count" :min="1" placeholder="触发次数" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="重复间隔(秒)" required>
                  <el-input-number v-model="formData.repeat_interval" :min="1" placeholder="通知间隔" style="width: 100%" />
                </el-form-item>
              </el-col>
               <el-col :span="12">
                <el-form-item label="告警邮箱" required>
                  <el-input v-model="formData.notice_person" placeholder="请输入告警邮箱，多个用逗号分隔" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="Vanish 告警">
                  <el-switch v-model="formData.vanish_enabled" active-text="启用" inactive-text="关闭" />
                </el-form-item>
              </el-col>
              <el-col :span="24" v-if="formData.vanish_enabled">
                <el-form-item label="Vanish 账号" required>
                  <el-input
                    v-model="formData.vanish_notice_person"
                    type="textarea"
                    :rows="2"
                    placeholder="请输入 @myhexin.com 账号，多个用逗号或换行分隔"
                  />
                  <div class="vanish-config-hint">
                    消息包含级别、规则、项目/环境、组件、客户、错误摘要和触发时间，不发送完整堆栈。正式 URL 与 AK 仅由后端环境变量注入。
                  </div>
                </el-form-item>
              </el-col>
               <el-col :span="24">
                <el-form-item label="描述">
                  <el-input v-model="formData.description" type="textarea" :rows="2" placeholder="请输入实例描述" />
                </el-form-item>
              </el-col>
            </template>
          </el-row>
        </el-form>
      </div>

      <!-- 操作按钮 -->
      <div style="text-align: center; margin-top: 30px;">
        <el-button type="primary" @click="submitForm" :loading="submitLoading" size="large">
          <el-icon class="el-icon--left"><Check /></el-icon>
          执行操作
        </el-button>
        <el-button @click="resetForm" size="large">
          <el-icon class="el-icon--left"><Refresh /></el-icon>
          重置
        </el-button>
      </div>
    </el-card>

    <!-- 结果提示Dialog -->
    <el-dialog
      v-model="resultDialog.visible"
      :title="resultDialog.title"
      width="400px"
      align-center
    >
      <div style="text-align: center; padding: 20px 0;">
        <el-icon :size="48" :color="resultDialog.color">
            <component :is="resultDialog.icon" />
        </el-icon>
        <p style="margin-top: 15px; font-size: 16px;">{{ resultDialog.message }}</p>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" @click="resultDialog.visible = false">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';
import { Setting, Edit, Check, Refresh, SuccessFilled, CircleCloseFilled } from '@element-plus/icons-vue';

const selectedApi = ref('');
const submitLoading = ref(false);
const indexOptions = ref([]);   // 关联指标下拉选项
const indexLoading = ref(false);

const apiOptions = [
  { value: '/index/add', label: '添加指标' },
  { value: '/index/update', label: '更新指标' },
  { value: '/index/delete', label: '删除指标' },
  { value: '/instance/add', label: '添加实例/规则' },
  { value: '/instance/update', label: '更新实例/规则' },
  { value: '/instance/delete', label: '删除实例/规则' }
];

const levelOptions = ['L1', 'L2', 'L3', 'L4', 'L5'];
const minimumThreshold = computed(() => formData.level === 'L1' ? 2 : 1);

const isDelete = computed(() => selectedApi.value.includes('delete'));

const formData = reactive({
  // 指标
  index_name: '',
  index_id: '',
  description: '',
  
  // 实例
  instance_name: '',
  instance_id: '',
  appkey: '',
  customer_name: '',
  project_name: '',
  threshold: 2,
  time_frame: 300,
  output: '',
  level: 'L1',
  enabled: true,
  repeat_count: 1,
  repeat_interval: 3600,
  notice_person: '',
  vanish_enabled: false,
  vanish_notice_person: '',
  notice_way: '1'
});

const resultDialog = reactive({
  visible: false,
  title: '',
  message: '',
  icon: 'SuccessFilled',
  color: ''
});

const handleApiChange = () => {
    resetForm();
};

const hasField = (field) => {
    if (isDelete.value) {
        // 删除操作只需要 ID
        if (selectedApi.value.includes('index') && field === 'index_id') return true;
        if (selectedApi.value.includes('instance') && field === 'instance_id') return true;
        return false;
    }
    // 添加/更新需要展示所有相关字段
    return true; 
};

const resetForm = () => {
    Object.keys(formData).forEach(key => {
        if (typeof formData[key] === 'boolean') {
            formData[key] = key === 'vanish_enabled' ? false : true;
        } else if (typeof formData[key] === 'number') {
           formData[key] = key === 'threshold' ? 2 : (key === 'time_frame' ? 300 : (key === 'repeat_interval' ? 3600 : 1));
        } else {
            formData[key] = key === 'level' ? 'L1' : '';
        }
    });
};

// 预加载全量指标列表（组件挂载时执行，不需要用户手动触发）
const loadIndexOptions = async () => {
    indexLoading.value = true;
    try {
        const res = await request.post('/index/query/page', { page: 1, per: 200 });
        if (res.code === 1 && res.result && res.result.data) {
            indexOptions.value = res.result.data;
        }
    } catch (e) {
        console.warn('[DataManagement] 加载指标列表失败:', e.message);
    } finally {
        indexLoading.value = false;
    }
};

onMounted(() => {
    loadIndexOptions();
});

// 指标联想搜索
const querySearchIndex = async (queryString, cb) => {
    if (!queryString) {
        cb([]);
        return;
    }
    try {
        // 搜索指标名称或指标代码
        const res = await request.post('/index/query/page', {
            page: 1,
            per: 20,
            index_name: queryString
        });
        
        let results = [];
        if (res.code === 1 && res.result && res.result.data) {
            results = res.result.data.map(item => ({
                value: item.index_code,  // 用于 v-model 绑定
                ...item
            }));
        }
        cb(results);
    } catch (e) {
        console.error(e);
        cb([]);
    }
};

// 选择指标后自动填充
const handleIndexSelect = (item) => {
    formData.index_id = item.index_code;
    formData.index_name = item.index_name || '';
    formData.description = item.index_desc || '';
    ElMessage.success('已加载指标配置');
};

const querySearchInstance = async (queryString, cb) => {
    if (!queryString) {
        cb([]);
        return;
    }
    try {
        // 只搜索实例ID，确保联想的是 ID
        const res = await request.post('/instance/query/page', {
            page: 1,
            per: 20,
            instance_id: queryString 
        });

        let list = [];
        if (res.code === 1 && res.result && res.result.data) {
             list = res.result.data.map(item => ({
                value: item.instance_id, // 联想结果的值为 instance_id
                ...item
             }));
        }
        cb(list);
    } catch (e) {
        console.error(e);
        cb([]);
    }
};

// 选择实例后自动填充
const handleInstanceSelect = (item) => {
    // Populate formData with selected item
    const data = { ...item };
    
    // Parse rules_json if it exists and is string
    if (data.rules_json) {
        try {
            const rules = JSON.parse(data.rules_json);
            Object.assign(data, rules);
        } catch (e) {
            console.error('Parse rules_json failed', e);
        }
    }

    Object.keys(formData).forEach(key => {
        if (data[key] !== undefined && data[key] !== null) {
            if (typeof formData[key] === 'boolean' && typeof data[key] === 'number') {
                formData[key] = data[key] === 1;
            } else {
                formData[key] = data[key];
            }
        }
    });
    // Ensure ID is set (though it should be via v-model)
    formData.instance_id = data.instance_id;
    // Map index_code to index_id if needed
    if (data.index_code) formData.index_id = data.index_code;
    // Map project to project_name (后端字段是project，前端字段是project_name)
    if (data.project) formData.project_name = data.project;
    
    ElMessage.success('已加载实例配置');
};

const validateForm = () => {
    if (selectedApi.value.includes('index')) {
        if (!formData.index_id) {
             ElMessage.warning('请输入指标ID');
             return false;
        }
        if (!isDelete.value && !formData.index_name) {
            ElMessage.warning('请输入指标名称');
            return false;
        }
    } else if (selectedApi.value.includes('instance')) {
         if (!formData.instance_id) {
             ElMessage.warning('请输入实例 ID');
             return false;
        }
        if (!isDelete.value) {
             const required = ['instance_name', 'appkey', 'index_id', 'threshold', 'notice_person'];
             for (const field of required) {
                 if (!formData[field] && formData[field] !== 0) {
                     const labels = {
                       instance_name: '实例名称',
                       appkey: 'AppKey',
                       index_id: '关联指标',
                       threshold: '阈值',
                       notice_person: '告警邮笱'
                     };
                     ElMessage.warning(`请填写必填项：${labels[field] || field}`);
                     return false;
                 }
             }
             if (formData.threshold < minimumThreshold.value) {
                 ElMessage.warning(`当前告警等级的阈值不得小于 ${minimumThreshold.value}`);
                 return false;
             }
             if (formData.vanish_enabled) {
                 const vanishRecipients = formData.vanish_notice_person
                     .split(/[,，\n;]/)
                     .map(item => item.trim())
                     .filter(Boolean);
                 if (vanishRecipients.length === 0) {
                     ElMessage.warning('启用 Vanish 告警后必须填写 Vanish 账号');
                     return false;
                 }
                 const invalid = vanishRecipients.find(item => !/^[^\s,@]+@myhexin\.com$/i.test(item));
                 if (invalid) {
                     ElMessage.error(`Vanish 账号必须是 @myhexin.com 邮箱：${invalid}`);
                     return false;
                 }
             }
             // 校验关联指标 ID 是否来自已有指标列表
             if (indexOptions.value.length > 0) {
                 const validIndexIds = indexOptions.value.map(i => i.index_code);
                 if (!validIndexIds.includes(formData.index_id)) {
                     ElMessage.error(`关联指标 ID “${formData.index_id}” 不在已有指标中，请从下拉选择`);
                     return false;
                 }
             }
        }
    }
    return true;
};

const submitForm = async () => {
    if (!selectedApi.value) {
        ElMessage.warning('请选择接口');
        return;
    }
    if (!validateForm()) return;

    submitLoading.value = true;
    try {
        const url = selectedApi.value; // e.g., /index/add
        
        // 根据 API 类型，只发送相关字段
        let payload = {};
        
        if (url.includes('index')) {
            // 指标接口：后端使用 index_code 而不是 index_id
            payload = {
                index_code: formData.index_id,  // 前端 index_id → 后端 index_code
                index_name: formData.index_name,
                index_desc: formData.description  // 前端 description → 后端 index_desc
            };
            // 删除操作只需要 index_code
            if (isDelete.value) {
                payload = { index_code: formData.index_id };
            }
        } else if (url.includes('instance')) {
            // 实例接口：发送所有实例相关字段
            payload = {
                instance_id: formData.instance_id,
                instance_name: formData.instance_name,
                appkey: formData.appkey,
                customer_name: formData.customer_name,
                project_name: formData.project_name,
                index_id: formData.index_id,
                threshold: formData.threshold,
                time_frame: formData.time_frame,
                output: formData.output,
                level: formData.level,
                enabled: formData.enabled,
                repeat_count: formData.repeat_count,
                repeat_interval: formData.repeat_interval,
                notice_person: formData.notice_person,
                vanish_enabled: formData.vanish_enabled,
                vanish_notice_person: formData.vanish_notice_person,
                notice_way: formData.notice_way,
                description: formData.description
            };
            // 删除操作只需要 instance_id
            if (isDelete.value) {
                payload = { instance_id: formData.instance_id };
            }
        }

        const res = await request.post(url, payload);

        if (res.success || res.code === 1) { // 兼容 res.success 和后端历史接口返回的 res.code
            resultDialog.title = '操作成功';
            resultDialog.message = '操作执行成功';
            resultDialog.icon = 'SuccessFilled';
            resultDialog.color = '#67C23A';
            resultDialog.visible = true;
            if (isDelete.value) resetForm(); // 删除成功后清空
        } else {
            throw new Error(res.msg || 'Unknown error');
        }
    } catch (error) {
         resultDialog.title = '操作失败';
         resultDialog.message = error.msg || error.message || '请求失败';
         resultDialog.icon = 'CircleCloseFilled';
         resultDialog.color = '#F56C6C';
         resultDialog.visible = true;
    } finally {
        submitLoading.value = false;
    }
};
</script>

<style scoped>
.data-management {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Ensure no outer scroll */
}

.select-card {
  margin-bottom: 20px;
  flex-shrink: 0; /* Keep select card fixed size */
}

.params-card {
  flex: 1; /* Take remaining height */
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Container for scrollable body */
}

/* Ensure the body of the params card scrolls */
:deep(.params-card .el-card__body) {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 30px; /* Extra padding for bottom buttons */
}

.card-header {
  display: flex;
  align-items: center;
  font-weight: bold;
  gap: 8px;
}

.card-header .el-icon {
    color: #409eff;
}

.params-card .card-header .el-icon {
    color: #67c23a;
}

/* 关联指标下拉项样式 */
.index-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.index-option__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

/* 无指标时的提示文字 */
.index-hint {
  font-size: 12px;
  color: #e6a23c;
  margin-top: 4px;
}

.vanish-config-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
}

.field-tip {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}
</style>
