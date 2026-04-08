<template>
  <div class="sourcemap-manager">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>SourceMap 管理</h2>
      <p class="page-desc">管理上传至 OSS 的 SourceMap 文件，用于生产环境错误堆栈还原</p>
    </div>

    <!-- 工具栏 -->
    <el-card class="toolbar-card" shadow="never">
      <div class="toolbar">
        <!-- appkey 选择 -->
        <el-select
          v-model="selectedAppkey"
          placeholder="选择 Appkey"
          style="width: 280px"
          filterable
          clearable
          @change="onAppkeyChange"
        >
          <el-option
            v-for="item in appkeyList"
            :key="item.appkey"
            :label="`${item.service_name || item.appkey} (${item.appkey})`"
            :value="item.appkey"
          />
        </el-select>

        <!-- 上传按钮 -->
        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="onFileSelect"
          accept=".map"
          multiple
        >
          <el-button
            type="primary"
            :icon="Upload"
            :disabled="!selectedAppkey"
          >
            上传 .map 文件
          </el-button>
        </el-upload>

        <el-button
          :icon="Refresh"
          :loading="loading"
          :disabled="!selectedAppkey"
          @click="fetchList"
        >
          刷新
        </el-button>
      </div>
    </el-card>

    <!-- 上传队列进度 -->
    <el-card v-if="uploadQueue.length > 0" class="upload-queue-card" shadow="never">
      <div class="queue-header">
        <span>上传队列（{{ uploadQueue.length }} 个文件）</span>
        <el-button link type="danger" @click="clearQueue">清空</el-button>
      </div>
      <div class="queue-list">
        <div v-for="item in uploadQueue" :key="item.uid" class="queue-item">
          <el-icon :class="statusIconClass(item.status)">
            <component :is="statusIcon(item.status)" />
          </el-icon>
          <span class="queue-name">{{ item.name }}</span>
          <span class="queue-size">{{ formatSize(item.size) }}</span>
          <el-tag :type="statusTagType(item.status)" size="small">{{ statusText(item.status) }}</el-tag>
        </div>
      </div>
      <div class="queue-actions">
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="uploadQueue.every(i => i.status === 'done' || i.status === 'error')"
          @click="doUpload"
        >
          开始上传
        </el-button>
      </div>
    </el-card>

    <!-- 文件列表 -->
    <el-card class="list-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>文件列表</span>
          <el-tag v-if="selectedAppkey" type="info" size="small">{{ selectedAppkey }}</el-tag>
          <span v-else class="no-appkey-hint">请先选择 Appkey</span>
        </div>
      </template>

      <el-table
        v-loading="loading"
        :data="fileList"
        empty-text="暂无 SourceMap 文件"
        style="width: 100%"
      >
        <el-table-column label="文件名" prop="name" min-width="280">
          <template #default="{ row }">
            <el-icon style="color: #909399; margin-right: 6px"><Document /></el-icon>
            <span>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="大小" prop="size" width="120">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="上传时间" prop="lastModified" width="200">
          <template #default="{ row }">
            {{ formatTime(row.lastModified) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-popconfirm
              title="确认删除该文件？"
              confirm-button-text="删除"
              confirm-button-type="danger"
              cancel-button-text="取消"
              @confirm="deleteFile(row)"
            >
              <template #reference>
                <el-button link type="danger" :icon="Delete">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Refresh, Delete, Document, SuccessFilled, CircleCloseFilled, Loading } from '@element-plus/icons-vue';
import request from '../api/request.js';

// ─── 状态 ─────────────────────────────────────────────────
const selectedAppkey = ref('');
const appkeyList     = ref([]);
const fileList       = ref([]);
const loading        = ref(false);
const uploading      = ref(false);
const uploadQueue    = ref([]);
const uploadRef      = ref(null);

// ─── 初始化 ────────────────────────────────────────────────
onMounted(async () => {
  await fetchAppkeys();
});

// ─── 获取 Appkey 列表 ──────────────────────────────────
async function fetchAppkeys() {
  try {
    const res = await request.get('/appkey/list', {
      params: { page: 1, pageSize: 100 },
    });
    // appkey/list returns { success, data: { data: [...], total } }
    let list = [];
    if (res.data && Array.isArray(res.data.data)) {
      list = res.data.data;
    } else if (Array.isArray(res.data)) {
      list = res.data;
    } else if (Array.isArray(res)) {
      list = res;
    }
    // 去重
    const seen = new Set();
    appkeyList.value = list.filter(item => {
      const key = item.appkey;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (e) {
    console.warn('[SourceMapManager] 获取 Appkey 列表失败:', e.message);
  }
}

// ─── 切换 Appkey ───────────────────────────────────────────
function onAppkeyChange(val) {
  fileList.value = [];
  if (val) fetchList();
}

// ─── 获取文件列表 ──────────────────────────────────────────
async function fetchList() {
  if (!selectedAppkey.value) return;
  loading.value = true;
  try {
    const res = await request.get('/sourcemap/list', {
      params: { appkey: selectedAppkey.value },
    });
    fileList.value = res.data || [];
  } catch (e) {
    ElMessage.error('获取文件列表失败: ' + e.message);
  } finally {
    loading.value = false;
  }
}

// ─── 文件选择回调 ──────────────────────────────────────────
function onFileSelect(file) {
  // 避免重复添加
  if (uploadQueue.value.find(i => i.uid === file.uid)) return;
  uploadQueue.value.push({
    uid:    file.uid,
    name:   file.name,
    size:   file.raw?.size || 0,
    raw:    file.raw,
    status: 'pending', // pending | uploading | done | error
  });
}

function clearQueue() {
  uploadQueue.value = [];
}

// ─── 执行上传 ──────────────────────────────────────────────
async function doUpload() {
  if (!selectedAppkey.value) {
    ElMessage.warning('请先选择 Appkey');
    return;
  }

  uploading.value = true;
  const pending = uploadQueue.value.filter(i => i.status === 'pending');

  for (const item of pending) {
    item.status = 'uploading';
    try {
      const formData = new FormData();
      formData.append('appkey', selectedAppkey.value);
      formData.append('file', item.raw, item.name);

      await request.post('/sourcemap/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      item.status = 'done';
    } catch (e) {
      item.status = 'error';
      ElMessage.error(`${item.name} 上传失败: ${e.message}`);
    }
  }

  uploading.value = false;

  const doneCount = pending.filter(i => i.status === 'done').length;
  if (doneCount > 0) {
    ElMessage.success(`${doneCount} 个文件上传成功`);
    await fetchList();
  }
}

// ─── 删除文件 ──────────────────────────────────────────────
async function deleteFile(row) {
  try {
    await request.post('/sourcemap/delete', {
      appkey:   selectedAppkey.value,
      fileName: row.name,
    });
    ElMessage.success('删除成功');
    await fetchList();
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message);
  }
}

// ─── 工具函数 ──────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(val) {
  if (!val) return '-';
  return new Date(val).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function statusText(status) {
  return { pending: '待上传', uploading: '上传中', done: '已完成', error: '失败' }[status] || status;
}
function statusTagType(status) {
  return { pending: 'info', uploading: 'warning', done: 'success', error: 'danger' }[status] || '';
}
function statusIconClass(status) {
  return { done: 'success-icon', error: 'error-icon', uploading: 'loading-icon' }[status] || '';
}
function statusIcon(status) {
  if (status === 'done') return SuccessFilled;
  if (status === 'error') return CircleCloseFilled;
  return Loading;
}
</script>

<style scoped>
.sourcemap-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow-y: auto;
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

.upload-queue-card {
  border: 1px dashed #a0cfff;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 500;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.queue-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-size {
  font-size: 12px;
  color: #909399;
  min-width: 60px;
  text-align: right;
}

.queue-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.success-icon { color: #67c23a; }
.error-icon   { color: #f56c6c; }
.loading-icon { color: #e6a23c; }

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.no-appkey-hint {
  font-size: 13px;
  color: #c0c4cc;
}

.list-card {
  flex: 1;
}
</style>
