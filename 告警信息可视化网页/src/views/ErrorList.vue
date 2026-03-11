
<template>
  <div class="error-list-container">
    <el-card>
      <!-- 搜索栏 -->
      <el-form :inline="true" :model="form" class="demo-form-inline" size="default">
        <!-- <el-form-item label="项目">
          <el-input v-model="form.project" placeholder="输入项目名" clearable />
        </el-form-item> -->
        <el-form-item label="环境">
          <el-select v-model="form.env" placeholder="Select" style="width: 120px">
            <el-option label="开发" value="development" />
            <el-option label="生产" value="production" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" placeholder="全部" clearable style="width: 120px">
            <el-option label="JS错误" value="javascript" />
            <el-option label="资源错误" value="resource" />
            <el-option label="接口错误" value="network-error" />
            <el-option label="CORS" value="cors" />
            <el-option label="Promise" value="promise" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input v-model="form.customer_name" placeholder="客户名称" clearable style="width: 120px" />
        </el-form-item>
        <el-form-item label="AppKey">
          <el-input v-model="form.appkey" placeholder="AppKey" clearable style="width: 120px" />
        </el-form-item>
        <el-form-item label="组件名">
          <el-input v-model="form.service_name" placeholder="组件/服务名" clearable style="width: 120px" />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="form.keyword" placeholder="ErrorMessage / Stack" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" border style="width: 100%" v-loading="loading">
        <el-table-column prop="error_type" label="类型" width="120">
          <template #default="scope">
            <el-tag :type="getErrorTypeTag(scope.row.error_type)">{{ scope.row.error_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error_message" label="错误信息" min-width="300" show-overflow-tooltip />
        <el-table-column prop="updated_at" label="最近发生" width="180">
          <template #default="scope">
            {{ new Date(scope.row.updated_at).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column prop="occurrence_count" label="次数" width="80" align="center" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="showDetail(scope.row)">详情</el-button>
            <el-popconfirm title="确定删除这条错误日志吗?" @confirm="handleDelete(scope.row)">
              <template #reference>
                <el-button link type="danger" size="small" style="margin-left: 5px">删除</el-button>
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

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="错误详情" size="50%">
      <div v-if="currentError">
        <h3>基本信息</h3>
        <el-descriptions border :column="1">
          <el-descriptions-item label="类型">{{ currentError.error_type }}</el-descriptions-item>
          <el-descriptions-item label="信息">{{ currentError.error_message }}</el-descriptions-item>
          
          <el-descriptions-item label="客户名">
              {{ currentError.parsedData?.customer_name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="AppKey">
              {{ currentError.parsedData?.appkey || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="组件名">
              {{ currentError.parsedData?.service_name || '-' }}
          </el-descriptions-item>

          <el-descriptions-item label="时间">{{ new Date(currentError.created_at).toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="文件">{{ currentError.error_file || '-' }}</el-descriptions-item>
          <el-descriptions-item label="位置">行 {{ currentError.error_line || 0 }}, 列 {{ currentError.error_col || 0 }}</el-descriptions-item>
        </el-descriptions>

        <h3>堆栈信息</h3>
        <el-alert
          v-if="currentError.parsedData?.original_stack"
          title="已解析 SourceMap"
          type="success"
          :closable="false"
          style="margin-bottom: 10px;"
        />
        <div class="code-block">
          <pre>{{ currentError.parsedData?.original_stack || currentError.error_stack || '-' }}</pre>
        </div>

        <!-- 用户行为轨迹（面包屑） -->
        <template v-if="currentError.breadcrumbs && currentError.breadcrumbs.length > 0">
          <h3 style="margin-top: 20px;">用户行为轨迹</h3>
          <el-timeline>
            <el-timeline-item
              v-for="(bc, index) in currentError.breadcrumbs"
              :key="index"
              :timestamp="bc.event_time ? new Date(bc.event_time).toLocaleString() : '-'"
              placement="top"
              :type="getBreadcrumbTagType(bc.category)"
            >
              <el-card shadow="never" style="padding: 4px 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <el-tag size="small" :type="getBreadcrumbTagType(bc.category)">
                    {{ bc.category || bc.breadcrumb_type || 'unknown' }}
                  </el-tag>
                  <span style="font-size: 13px;">{{ bc.breadcrumb_message || '-' }}</span>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </template>
        <el-empty
          v-else-if="currentError.breadcrumbs"
          description="未记录用户行为轨迹"
          :image-size="60"
          style="margin-top: 16px;"
        />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';

const form = reactive({
  project: '',
  env: 'production',
  type: '',
  keyword: '',
  customer_name: '',
  appkey: '',
  service_name: ''
});

const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const drawerVisible = ref(false);
const currentError = ref(null);

const getErrorTypeTag = (type) => {
  const map = {
    javascript: 'danger',
    resource: 'warning',
    promise: 'danger',
    'network-error': 'info'
  };
  return map[type] || '';
};

const loadData = async () => {
  loading.value = true;
  try {
    const res = await request.get('/errors/list', {
      params: {
        page: currentPage.value,
        pageSize: pageSize.value,
        ...form
      }
    });
    if (res.success) {
      tableData.value = res.data.list;
      total.value = res.data.total;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  loadData();
};

const resetForm = () => {
  form.type = '';
  form.keyword = '';
  form.customer_name = '';
  form.appkey = '';
  form.service_name = '';
  form.env = 'production';
  handleSearch();
};

const showDetail = async (row) => {
  // 请求详情接口，获取完整数据包括面包屑
  try {
    const res = await request.get(`/errors/${row.id}`);
    if (res.success) {
      const data = res.data;
      // 解析 extra_data
      let parsedData = {};
      const extraData = data.extra_data || data.data;
      if (typeof extraData === 'string') {
        try { parsedData = JSON.parse(extraData); } catch(e) {}
      } else {
        parsedData = extraData || {};
      }
      currentError.value = { ...data, parsedData };
    } else {
      // 请求失败，匹基本列表数据展示
      currentError.value = { ...row, breadcrumbs: [], parsedData: {} };
    }
  } catch (e) {
    console.error('获取错误详情失败:', e);
    currentError.value = { ...row, breadcrumbs: [], parsedData: {} };
  }
  drawerVisible.value = true;
};

/**
 * 根据面包屑类型返回对应的 Element Plus Tag 类型
 */
const getBreadcrumbTagType = (category) => {
  const map = {
    click: 'primary',
    navigation: 'success',
    xhr: 'warning',
    fetch: 'warning',
    console: 'info',
    error: 'danger'
  };
  return map[category] || 'info';
};

onMounted(() => {
  loadData();
});

const handleDelete = async (row) => {
  try {
    const res = await request.post('/errors/delete', { id: row.id });
    if (res.success || (res.code === 1)) {
      ElMessage.success('删除成功');
      loadData();
    } else {
      ElMessage.error(res.msg || '删除失败');
    }
  } catch (e) {
    console.error(e);
    ElMessage.error('删除请求失败');
  }
};
</script>

<style scoped>
.error-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 20px;
}

:deep(.el-card) {
  display: flex;
  flex-direction: column;
}

/* Make list card take remaining space */
:deep(.el-card):nth-child(2) {
  flex: 1;
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

.pagination-container {
  margin-top: 15px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.code-block {
  background: #f4f4f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: monospace;
  font-size: 12px;
  margin-top: 10px;
}
</style>
