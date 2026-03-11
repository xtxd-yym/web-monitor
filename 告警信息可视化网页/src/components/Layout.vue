
<template>
  <el-container class="layout-container">
    <el-aside width="220px">
      <div class="logo">
        <el-icon><Monitor /></el-icon>
        <span>云监控后台</span>
      </div>
      <el-menu
        active-text-color="#ffd04b"
        background-color="#304156"
        class="el-menu-vertical"
        default-active="/dashboard"
        text-color="#fff"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>监控概览</span>
        </el-menu-item>
        <el-menu-item index="/errors">
          <el-icon><List /></el-icon>
          <span>错误列表</span>
        </el-menu-item>
        <el-menu-item index="/config">
          <el-icon><Setting /></el-icon>
          <span>配置管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header>
        <div class="header-left">
          <span>管理控制台</span>
        </div>
      </el-header>
      <el-main>
        <router-view></router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout-container {
  height: 100vh;
}

.el-aside {
  background-color: #304156;
  color: #fff;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  background-color: #2b3a4d;
  color: #fff;
  gap: 10px;
}

.el-menu {
  border-right: none;
}

.el-header {
  background-color: #fff;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.el-main {
  background-color: #f0f2f5;
  padding: 20px;
}
</style>
