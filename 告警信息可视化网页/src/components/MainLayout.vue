
<template>
  <el-container class="layout-container">
    <el-aside width="220px">
      <div class="logo">
        <el-icon><Monitor /></el-icon>
        <span>云监控后台</span>
      </div>
      <el-menu
        active-text-color="#409eff"
        background-color="#fff"
        class="el-menu-vertical"
        :default-active="activePath"
        text-color="#606266"
        router
      >
        <div class="menu-header">导航菜单</div>
        <el-menu-item index="/console/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>监控概览</span>
        </el-menu-item>
        <el-menu-item index="/console/alarm">
          <el-icon><Warning /></el-icon>
          <span>告警记录</span>
        </el-menu-item>
        <el-menu-item index="/console/error">
          <el-icon><Document /></el-icon>
          <span>错误日志</span>
        </el-menu-item>
        <el-menu-item index="/console/index">
          <el-icon><DataLine /></el-icon>
          <span>指标监控</span>
        </el-menu-item>
        <el-menu-item index="/console/instance">
          <el-icon><Monitor /></el-icon>
          <span>实例监控</span>
        </el-menu-item>
        <el-menu-item index="/console/data">
          <el-icon><Edit /></el-icon>
          <span>数据管理</span>
        </el-menu-item>
        <el-menu-item index="/console/config">
          <el-icon><Setting /></el-icon>
          <span>配置管理</span>
        </el-menu-item>
        <el-menu-item index="/console/sourcemap">
          <el-icon><Files /></el-icon>
          <span>SourceMap管理</span>
        </el-menu-item>
        <el-menu-item index="/console/appkey">
          <el-icon><Key /></el-icon>
          <span>AppKey管理</span>
        </el-menu-item>
        <el-menu-item index="/">
           <el-icon><HomeFilled /></el-icon>
           <span>返回首页</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header>
        <div class="header-left">
          <span>{{ currentTitle }}</span>
        </div>
      </el-header>
      <el-main>
        <router-view></router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const activePath = computed(() => route.path);
const currentTitle = computed(() => route.meta.title || '控制台');
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.el-aside {
  background-color: #fff;
  border-right: 1px solid #e4e7ed;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  background-color: #fff;
  color: #303133;
  gap: 10px;
  border-bottom: 1px solid #e4e7ed;
}

.menu-header {
  padding: 20px;
  color: #909399;
  font-size: 14px;
}

.el-menu {
  border-right: none;
}

.el-header {
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  padding: 0 20px;
  height: 60px;
}

.header-left {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.el-main {
  background-color: #f5f7fa;
  padding: 20px;
  overflow-y: auto; /* Allow vertical scrolling for long pages like Dashboard */
  overflow-x: hidden;
}
</style>
