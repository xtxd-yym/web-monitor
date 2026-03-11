import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 部署在 /monitorWeb/ 子路径下，必须设置 base
  base: '/monitorWeb/',
  build: {
    // 将构建出的文件夹名称改为 'my-output-folder'
    outDir: 'monitorWeb',
    // 建议同时关注 emptyOutDir 选项
    // 如果 outDir 在 root 目录之外，Vite 会警告，需手动设置此项为 true
    // emptyOutDir: true, 
  },
  // 本地开发代理转发
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:9998',
        changeOrigin: true,
        // 如果后端接口本身就包含 /api 前缀，则不需要 rewrite
        // rewrite: (path) => path.replace(/^\/api/, ''), 
      }
    }
  }
})
