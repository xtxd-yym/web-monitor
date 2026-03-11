
<template>
  <div class="home">
    <div class="nav-container">
      <h1 class="page-title">告警监控系统</h1>
      <div class="nav-grid">
        <div class="nav-card" @click="navigateTo('/console/alarm')">
          <div class="card-icon alarm-icon">
            <el-icon><Warning /></el-icon>
          </div>
          <h3>告警监控</h3>
          <p>查看和管理系统告警信息</p>
        </div>
        
        <div class="nav-card" @click="navigateTo('/console/index')">
          <div class="card-icon index-icon">
            <el-icon><DataLine /></el-icon>
          </div>
          <h3>指标监控</h3>
          <p>监控和分析系统指标数据</p>
        </div>
        
        <div class="nav-card" @click="navigateTo('/console/instance')">
          <div class="card-icon instance-icon">
            <el-icon><Monitor /></el-icon>
          </div>
          <h3>实例监控</h3>
          <p>管理系统实例运行状态</p>
        </div>
        
        <div class="nav-card" @click="navigateTo('/console/data')">
          <div class="card-icon data-icon">
            <el-icon><Edit /></el-icon>
          </div>
          <h3>数据管理</h3>
          <p>增删改数据操作管理</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const navigateTo = (path) => {
  router.push(path);
};
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.nav-container {
  max-width: 1200px;
  width: 100%;
}

.page-title {
  text-align: center;
  color: #303133;
  margin-bottom: 60px;
  font-size: 36px;
  font-weight: 300;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 30px;
  padding: 0 20px;
}

@media (min-width: 768px) {
  .nav-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1200px) {
  .nav-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.nav-card {
  background: white;
  border-radius: 12px;
  padding: 40px 30px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  height: 100%; /* Ensure same height */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.nav-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.card-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: white;
}

.alarm-icon { background: linear-gradient(135deg, #ff6b6b, #ee5a52); }
.index-icon { background: linear-gradient(135deg, #4ecdc4, #44a08d); }
.instance-icon { background: linear-gradient(135deg, #667eea, #764ba2); }
.data-icon { background: linear-gradient(135deg, #f093fb, #f5576c); }

h3 {
  color: #303133;
  margin: 0 0 10px 0;
  font-size: 24px;
  font-weight: 500;
}

p {
  color: #909399;
  margin: 0;
  font-size: 16px;
}
</style>
