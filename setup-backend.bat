@echo off
chcp 65001 >nul
echo ==========================================
echo 云监控后端服务 - 文件拷贝脚本
echo ==========================================
echo.

echo [1/5] 创建目录结构...
mkdir "后端服务\src" 2>nul
mkdir "后端服务\src\config" 2>nul
mkdir "后端服务\src\db" 2>nul
mkdir "后端服务\src\db\models" 2>nul
mkdir "后端服务\src\routes" 2>nul
mkdir "后端服务\src\services" 2>nul
echo ✓ 目录创建完成

echo.
echo [2/5] 拷贝后端核心文件...
copy /Y "前端告警系统v1.0\src\app.js" "后端服务\src\" >nul
echo ✓ app.js

echo.
echo [3/5] 拷贝配置和数据库文件...
copy /Y "前端告警系统v1.0\src\config\server.js" "后端服务\src\config\" >nul
copy /Y "前端告警系统v1.0\src\db\init.js" "后端服务\src\db\" >nul
copy /Y "前端告警系统v1.0\src\db\schema.sql" "后端服务\src\db\" >nul
copy /Y "前端告警系统v1.0\src\db\models\error.js" "后端服务\src\db\models\" >nul
copy /Y "前端告警系统v1.0\src\db\models\config.js" "后端服务\src\db\models\" >nul
copy /Y "前端告警系统v1.0\src\db\models\breadcrumb.js" "后端服务\src\db\models\" >nul
echo ✓ 配置和数据库文件

echo.
echo [4/5] 拷贝路由和服务文件...
copy /Y "前端告警系统v1.0\src\routes\errors.js" "后端服务\src\routes\" >nul
copy /Y "前端告警系统v1.0\src\routes\config.js" "后端服务\src\routes\" >nul
copy /Y "前端告警系统v1.0\src\routes\sourcemap.js" "后端服务\src\routes\" >nul
copy /Y "前端告警系统v1.0\src\services\sourcemap.js" "后端服务\src\services\" >nul
echo ✓ 路由和服务文件

echo.
echo [5/5] 拷贝脚本和文档...
xcopy /E /I /Y "前端告警系统v1.0\scripts" "后端服务\scripts" >nul
copy /Y "前端告警系统v1.0\API.md" "后端服务\" >nul
copy /Y "前端告警系统v1.0\DEPLOY.md" "后端服务\" >nul
copy /Y "前端告警系统v1.0\QUICK_START.md" "后端服务\" >nul
echo ✓ 脚本和文档

echo.
echo ==========================================
echo ✅ 后端文件拷贝完成！
echo ==========================================
echo.
echo 下一步：
echo 1. cd 后端服务
echo 2. npm install
echo 3. npm run setup
echo 4. npm start
echo.
pause
