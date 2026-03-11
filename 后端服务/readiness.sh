#!/bin/bash
# 判断容器是否已经ready的脚本，目前只判断端口是否正常开启，未做业务逻辑相关的检查
# 该脚本需要放到docker的/opt/readiness这个路径
port="${PORT:-3001}"
httpCode=$(curl -I -m 10 -o /dev/null -s -w %{http_code} http://localhost:$port/health)
if [ "$httpCode" = 200 ]; then
    exit 0;
else
    exit -1;
fi
