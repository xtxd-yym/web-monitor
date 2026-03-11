# 使用公司的 Node.js 22 基础镜像 (和前端保持一致)
FROM hub-dev.hexin.cn/business-baseimage-frontend/node:v22.12.0

# 设置工作目录
# 第一阶段：构建环境 (使用 CICD 专用镜像)
FROM hub-dev.hexin.cn/cicd-baseimage-frontend/node:v22.12.0 AS builder

WORKDIR /app

# 配置内网源
RUN npm config set registry http://repositories.myhexin.com:8081/repository/npm-public/

# 复制 package.json
COPY package.json ./

# 删除 package-lock.json (防止 npmmirror 解析失败)
RUN rm -f package-lock.json

# 安装依赖
# 1. 移动 sqlite3 到可选依赖后，即使编译失败 (因为缺头文件/网络不通) 也会继续
# 2. 我们不需要 yum/apt 了，因为我们接受 sqlite3 安装失败 (生产改用 mysql)
RUN npm install --production

# 复制源码
COPY . .

# ----------------------------------------------------

# 第二阶段：运行环境 (公司提供的精简镜像)
FROM hub-dev.hexin.cn/business-baseimage-frontend/node:v22.12.0

WORKDIR /app

# 从构建阶段复制 node_modules (可能不含 sqlite3) 和代码
COPY --from=builder /app ./

# 复制 readiness.sh
COPY ./readiness.sh /opt/
RUN chmod +x /opt/readiness.sh

# 环境变量
ENV PORT=9998
ENV NODE_ENV=production
# 改为 MySQL 模式！因为在内网无法编译 sqlite3
ENV DB_TYPE=mysql
ENV DB_PATH=/app/data/monitor.db
ENV SOURCEMAP_DIR=/app/data/sourcemaps

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 9998
CMD ["npm", "start"]
