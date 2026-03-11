@echo off
chcp 65001 >nul
echo ==========================================
echo 前端演示页面 - 文件拷贝脚本
echo ==========================================
echo.

echo [1/1] 拷贝 SDK 文件...
copy /Y "监控sdk源码\dist\monitor.min.js" "前端演示页面\" >nul
echo ✓ monitor.min.js

echo.
echo ==========================================
echo ✅ 前端文件拷贝完成！
echo ==========================================
echo.
echo 下一步：
echo 双击打开 "前端演示页面\index.html" 进行测试
echo.
pause
