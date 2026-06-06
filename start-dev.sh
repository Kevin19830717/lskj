#!/bin/bash
# ============================================================
# 智能饮食健康秤 — 开发模式启动脚本
# 前台运行，所有请求日志打印到终端，Ctrl+C 结束
# 用法: bash start-dev.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/smart-scale-backend"
RAG_DIR="$SCRIPT_DIR/rag-service"
LOG_DIR="$SCRIPT_DIR/logs"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PIDS=()

cleanup() {
    echo ""
    echo -e "${YELLOW}正在停止所有服务...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null && echo -e "  已停止 PID: $pid" || true
    done
    wait 2>/dev/null
    echo -e "${GREEN}所有服务已停止，再见！${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

mkdir -p "$LOG_DIR"
mkdir -p "$BACKEND_DIR/uploads"

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}  智能饮食健康秤 — 开发模式${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "  ${CYAN}按 Ctrl+C 停止所有服务${NC}"
echo ""

# ---- 环境变量 ----
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=321738392
export DB_NAME=smart_scale
export DB_SSLMODE=disable
export SERVER_PORT=8080
export GIN_MODE=debug          # debug 模式显示请求日志
export JWT_SECRET=smart-diet-jwt-secret-key-change-me-in-production
export DASHSCOPE_API_KEY=sk-07c88e8d2fe8470c934c19682c403467
export UPLOAD_PATH=$BACKEND_DIR/uploads
export UPLOAD_MAX_SIZE_MB=10

export DATABASE_URL=postgresql://postgres:321738392@localhost:5432/smart_scale
export RAG_SERVER_PORT=8001
export TEXT_MODEL=qwen-plus
export VL_MODEL=qwen-vl-flash
export EMBEDDING_MODEL=text-embedding-v2
export SIMILARITY_THRESHOLD=0.3
export TOP_K_DEFAULT=5

# ---- 杀掉旧进程 ----
echo -e "${YELLOW}[1/5] 清理旧进程...${NC}"
pkill -f "smart-scale-server" 2>/dev/null || true
pkill -f "uvicorn app:app" 2>/dev/null || true
sleep 1

# ---- 数据库初始化 ----
echo -e "${YELLOW}[2/5] 检查数据库...${NC}"
PGPASSWORD=321738392 psql -h localhost -U postgres -d smart_scale -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
if [ -f "$BACKEND_DIR/migrations/001_init.sql" ]; then
    PGPASSWORD=321738392 psql -h localhost -U postgres -d smart_scale -f "$BACKEND_DIR/migrations/001_init.sql" 2>/dev/null && echo -e "  ${GREEN}建表完成${NC}" || echo -e "  ${YELLOW}表可能已存在${NC}"
fi

# ---- 编译 Go 后端 ----
echo -e "${YELLOW}[3/5] 编译 Go 后端...${NC}"
cd "$BACKEND_DIR"
export GOPROXY=https://goproxy.cn,direct
go build -o smart-scale-server cmd/server/main.go 2>&1 | tail -3
echo -e "  ${GREEN}编译完成${NC}"

# ---- 配置 Nginx (如果还没配好) ----
echo -e "${YELLOW}[4/5] 检查 Nginx...${NC}"
if [ ! -f /etc/nginx/sites-enabled/smart-scale.conf ]; then
    cat > /tmp/smart-scale.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name _;
    root /home/ubuntu/lskj/smart-scale-backend/frontend;
    index index.html;
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 10M;
        proxy_read_timeout 60s;
    }
    location /rag/ {
        rewrite ^/rag/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
    }
}
NGINX_EOF
    sudo cp /tmp/smart-scale.conf /etc/nginx/sites-available/smart-scale.conf
    sudo ln -sf /etc/nginx/sites-available/smart-scale.conf /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx
    echo -e "  ${GREEN}Nginx 已配置${NC}"
else
    echo -e "  ${GREEN}Nginx 已就绪${NC}"
fi

# ---- 启动 Go 后端 (前台) ----
echo -e "${GREEN}[5/5] 启动服务 (前台模式)...${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Go 后端:   http://localhost:8080${NC}"
echo -e "${GREEN}  RAG 服务:  http://localhost:8001${NC}"
echo -e "${GREEN}  前端页面:  http://106.53.198.194${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  请求日志如下:${NC}"
echo ""

# 启动 Go 后端 (前台，日志直接打印)
cd "$BACKEND_DIR"
./smart-scale-server &
PIDS+=($!)
echo -e "  ${GREEN}[Go 后端] PID: ${PIDS[0]}${NC}"

sleep 1

# 启动 Python RAG (前台，uvicorn 自带请求日志)
cd "$RAG_DIR"
if [ -d "venv" ]; then
    source venv/bin/activate
fi
uvicorn app:app --host 0.0.0.0 --port 8001 &
PIDS+=($!)
echo -e "  ${GREEN}[RAG 服务] PID: ${PIDS[1]}${NC}"

echo ""
echo -e "${CYAN}所有服务已启动，按 Ctrl+C 停止...${NC}"
echo ""

# 等待任意子进程退出
wait
