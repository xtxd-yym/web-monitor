
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
    <el-drawer v-model="drawerVisible" title="实例详情" size="50%" :before-close="handleDrawerClose">
      <template v-if="currentItem">
        <!-- 只读字段展示（关键标识不可改变） -->
        <el-descriptions :column="1" border class="readonly-descriptions">
          <el-descriptions-item label="ID">
            <el-tag size="small" type="info">{{ currentItem.instance_id }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="项目">{{ currentItem.project }}</el-descriptions-item>
          <el-descriptions-item label="关联指标代码">
            <el-tag size="small">{{ currentItem.index_code }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(currentItem.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(currentItem.updated_at) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">
          <el-icon><Edit /></el-icon> 可编辑配置
        </el-divider>

        <!-- 可编辑字段表单 -->
        <el-form :model="editForm" label-width="100px" class="edit-form" ref="editFormRef">
          <el-form-item label="实例名称" prop="instance_name"
            :rules="[{ required: true, message: '请输入实例名称', trigger: 'blur' }]">
            <el-input v-model="editForm.instance_name" placeholder="请输入实例名称" />
          </el-form-item>
          <el-form-item label="启用状态">
            <el-switch
              v-model="editForm.enabled"
              active-text="启用"
              inactive-text="禁用"
              :active-value="1"
              :inactive-value="0"
            />
          </el-form-item>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="阈值" prop="threshold"
                :rules="[{ required: true, message: '请输入阈值', trigger: 'change' }]">
                <el-input-number v-model="editForm.threshold" :min="minimumThreshold" style="width: 100%" />
                <div v-if="editForm.level === 'L1'" class="field-tip">L1 至少连续发生 2 次才允许触发。</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="时间窗口" prop="time_frame"
                :rules="[{ required: true, message: '请输入时间窗口', trigger: 'change' }]">
                <el-input-number v-model="editForm.time_frame" :min="1" style="width: 100%">
                  <template #suffix>秒</template>
                </el-input-number>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="应急输出">
            <el-input v-model="editForm.output" placeholder="告警触发时的异常描述" />
          </el-form-item>
          <el-form-item label="Vanish 告警">
            <el-switch v-model="editForm.vanish_enabled" active-text="启用" inactive-text="关闭" />
          </el-form-item>
          <el-form-item v-if="editForm.vanish_enabled" label="Vanish 账号">
            <el-input
              v-model="editForm.vanish_notice_person"
              type="textarea"
              :rows="2"
              placeholder="请输入 @myhexin.com 账号，多个用逗号或换行分隔"
            />
          </el-form-item>
          <el-form-item label="进阶配置">
            <pre class="rules-json-preview">{{ formatRulesJson(currentItem.rules_json) }}</pre>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="editForm.description" type="textarea" :rows="2" placeholder="可选，实例描述" />
          </el-form-item>
        </el-form>

        <!-- 操作按钮 -->
        <div class="drawer-footer">
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" :loading="saveLoading" @click="saveEdit">保存修改</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';
import { Search, Monitor, Edit } from '@element-plus/icons-vue';

const loading = ref(false);
const saveLoading = ref(false);
const list = ref([]);
const total = ref(0);
const drawerVisible = ref(false);
const currentItem = ref(null);
const editFormRef = ref(null);

// 可编辑字段的表单模型
const editForm = reactive({
  instance_name: '',
  enabled: 1,
  threshold: 2,
  time_frame: 300,
  level: 'L1',
  output: '',
  vanish_enabled: false,
  vanish_notice_person: '',
  description: ''
});
const minimumThreshold = computed(() => editForm.level === 'L1' ? 2 : 1);

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
    currentItem.value = { ...row };
    // 初始化可编辑字段
    editForm.instance_name = row.instance_name || '';
    editForm.enabled = row.instance_status ?? 1;
    editForm.threshold = row.threshold ?? 0;
    editForm.time_frame = row.time_frame ?? 300;
    // 从 rules_json 中提取 output
    try {
        const rules = row.rules_json ? JSON.parse(row.rules_json) : {};
        editForm.output = rules.output || '';
        editForm.level = rules.level || 'L1';
        editForm.vanish_enabled = rules.vanish_enabled === true;
        editForm.vanish_notice_person = rules.vanish_notice_person || '';
        editForm.description = rules.description || '';
    } catch (e) {
        editForm.output = '';
        editForm.level = 'L1';
        editForm.vanish_enabled = false;
        editForm.vanish_notice_person = '';
        editForm.description = '';
    }
    drawerVisible.value = true;
};

// 关闭抽屉操作
const handleDrawerClose = (done) => {
    done();
};

// 保存编辑
const saveEdit = async () => {
    if (!editFormRef.value) return;
    try {
        await editFormRef.value.validate();
    } catch (e) {
        return;
    }
    if (editForm.threshold < minimumThreshold.value) {
        ElMessage.error(`当前告警等级的阈值不得小于 ${minimumThreshold.value}`);
        return;
    }
    saveLoading.value = true;
    try {
        if (editForm.vanish_enabled) {
            const recipients = editForm.vanish_notice_person.split(/[,，\n;]/).map(item => item.trim()).filter(Boolean);
            const invalid = recipients.find(item => !/^[^\s,@]+@myhexin\.com$/i.test(item));
            if (recipients.length === 0 || invalid) {
                ElMessage.error(invalid ? `Vanish 账号格式错误：${invalid}` : '请填写 Vanish 账号');
                return;
            }
        }
        const res = await request.post('/instance/update', {
            instance_id: currentItem.value.instance_id,
            instance_name: editForm.instance_name,
            enabled: editForm.enabled,
            threshold: editForm.threshold,
            time_frame: editForm.time_frame,
            level: editForm.level,
            output: editForm.output,
            vanish_enabled: editForm.vanish_enabled,
            vanish_notice_person: editForm.vanish_notice_person,
            description: editForm.description
        });
        if (res.code === 1 || res.success) {
            ElMessage.success('保存成功');
            // 同步更新列表中的该条
            const target = list.value.find(i => i.instance_id === currentItem.value.instance_id);
            if (target) {
                target.instance_name = editForm.instance_name;
                target.instance_status = editForm.enabled;
                target.threshold = editForm.threshold;
                target.time_frame = editForm.time_frame;
            }
            drawerVisible.value = false;
        } else {
            throw new Error(res.msg || '操作失败');
        }
    } catch (e) {
        ElMessage.error('保存失败: ' + e.message);
    } finally {
        saveLoading.value = false;
    }
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

/* 抽屉相关样式 */
.readonly-descriptions {
  margin-bottom: 4px;
}

.edit-form {
  margin-top: 8px;
}

.rules-json-preview {
  margin: 0;
  max-height: 100px;
  overflow-y: auto;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-all;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.field-tip {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}
</style>
