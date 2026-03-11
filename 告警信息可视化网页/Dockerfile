# Build stage
# 使用公司内部镜像源, 避免连不上 Docker Hub
# 使用公司内部镜像源 Node v22 (Vite 7 需要 Node 20.19+ 或 22.12+)
FROM hub-dev.hexin.cn/business-baseimage-frontend/node:v22.12.0 as builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Clean npm cache and install dependencies
# 清理 npm 缓存以避免 ENOENT 错误 (Pack 平台缓存问题)
RUN npm cache clean --force && npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build:docker

# Production stage
# Use the company standard base image as seen in your logs
FROM hub-dev.hexin.cn/baseimages/nginx:v1.16.0

# Copy built artifacts from the builder stage
# usage: COPY --from=<stage> <source> <dest>
COPY --from=builder /app/monitorWeb /usr/share/nginx/html/

# COPY . . (已经在 builder 阶段 copy 过了，这里只需要 copy 产物和配置)

# 复制自定义的 nginx.conf
COPY ./nginx.conf /usr/local/nginx/conf/

# 复制 readiness.sh (老项目文件)
COPY ./readiness.sh /opt/

# Expose port 80
EXPOSE 80

# Nginx base image likely has CMD ["nginx", "-g", "daemon off;"] by default
