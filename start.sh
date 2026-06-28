#!/bin/bash
# ============================================================
# 智能饮食健康秤 — 一键启动脚本
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/smart-scale-backend"
RAG_DIR="$SCRIPT_DIR/rag-service"
LOG_DIR="$SCRIPT_DIR/logs"

echo "============================================"
echo "  智能饮食健康秤 一键启动"
echo "  公网IP: 106.53.198.194"
echo "============================================"

# ---- 0. 创建日志目录 ----
mkdir -p "$LOG_DIR"
mkdir -p "$BACKEND_DIR/uploads"

# ---- 1. 杀掉旧进程（如果有）----
echo "[1/6] 清理旧进程..."
pkill -f "smart-scale-server" 2>/dev/null || true
pkill -f "uvicorn app:app" 2>/dev/null || true
sleep 1

# ---- 2. 环境变量 ----
echo "[2/6] 加载环境变量..."
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=321738392
export DB_NAME=smart_scale
export DB_SSLMODE=disable
export SERVER_PORT=8080
export GIN_MODE=release
export JWT_SECRET=smart-diet-jwt-secret-key-change-me-in-production
export DASHSCOPE_API_KEY=sk-07c88e8d2fe8470c934c19682c403467
export UPLOAD_PATH=$BACKEND_DIR/uploads
export UPLOAD_MAX_SIZE_MB=10

# RAG 服务环境变量
export DATABASE_URL=postgresql://postgres:321738392@localhost:5432/smart_scale
export RAG_SERVER_PORT=8001
export TEXT_MODEL=qwen-plus
export VL_MODEL=qwen-vl-flash
export EMBEDDING_MODEL=text-embedding-v2
export SIMILARITY_THRESHOLD=0.3
export TOP_K_DEFAULT=5

# ---- 3. 数据库初始化（仅建表，不删数据）----
echo "[3/6] 初始化数据库..."
cd "$BACKEND_DIR"
PGPASSWORD=321738392 psql -h localhost -U postgres -d smart_scale -c "SELECT 1" >/dev/null 2>&1 || {
    echo "创建数据库 smart_scale..."
    PGPASSWORD=321738392 psql -h localhost -U postgres -c "CREATE DATABASE smart_scale;" 2>/dev/null || true
}
# 安装 pgvector 扩展（如果还没有）
PGPASSWORD=321738392 psql -h localhost -U postgres -d smart_scale -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
# 执行建表 SQL
if [ -f migrations/001_init.sql ]; then
    PGPASSWORD=321738392 psql -h localhost -U postgres -d smart_scale -f migrations/001_init.sql 2>/dev/null && echo "  建表完成" || echo "  表可能已存在，跳过"
fi

# ---- 4. 启动 Go 后端 (端口 8080) ----
echo "[4/6] 编译并启动 Go 后端 (:8080)..."
cd "$BACKEND_DIR"
export GOPROXY=https://goproxy.cn,direct
go mod tidy 2>&1 | tail -5 || echo "  go mod tidy skipped"
go build -o smart-scale-server cmd/server/main.go 2>&1 | tail -5 || { echo "  ❌ Go 编译失败"; exit 1; }
nohup ./smart-scale-server > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "  Go 后端 PID: $BACKEND_PID"

# ---- 5. 启动 Python RAG 服务 (端口 8001) ----
echo "[5/6] 启动 Python RAG 服务 (:8001)..."
cd "$RAG_DIR"

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "  创建 Python 虚拟环境..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt 2>&1 | tail -3 || echo "  pip install skipped"

nohup uvicorn app:app --host 0.0.0.0 --port 8001 > "$LOG_DIR/rag.log" 2>&1 &
RAG_PID=$!
echo "  RAG 服务 PID: $RAG_PID"
deactivate

# ---- 6. 配置 Nginx 反向代理 (端口 80) ----
echo "[6/6] 配置 Nginx 反向代理 (:80)..."

cat > /tmp/smart-scale.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    # 前端静态文件
    root /home/ubuntu/lskj/smart-scale-backend/frontend;
    index index.html;

    # API 反向代理 -> Go后端 :8080
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 10M;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        # SSE 支持：禁用缓冲
        proxy_buffering off;
        proxy_cache off;
        proxy_http_version 1.1;
        chunked_transfer_encoding on;
    }

    # RAG API 反向代理 -> Python :8001
    location /rag/ {
        rewrite ^/rag/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
        proxy_buffering off;
        proxy_http_version 1.1;
    }

    # 前端路由 fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
    }
}
NGINX_EOF

sudo cp /tmp/smart-scale.conf /etc/nginx/sites-available/smart-scale.conf
sudo ln -sf /etc/nginx/sites-available/smart-scale.conf /etc/nginx/sites-enabled/
# 移除默认配置避免冲突
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t 2>/dev/null && sudo systemctl reload nginx && echo "  Nginx 已配置" || echo "  Nginx 配置失败（请检查日志）"

# ---- 等待服务启动 ----
echo ""
echo "等待服务启动..."
sleep 3

# ---- 结果检查 ----
echo ""
echo "============================================"
echo "  启动结果"
echo "============================================"

if kill -0 $BACKEND_PID 2>/dev/null; then
    echo "  ✅ Go 后端运行中  → http://106.53.198.194:8080/health"
else
    echo "  ❌ Go 后端启动失败，查看日志: cat $LOG_DIR/backend.log"
fi

if kill -0 $RAG_PID 2>/dev/null; then
    echo "  ✅ RAG 服务运行中  → http://106.53.198.194:8001/docs"
else
    echo "  ❌ RAG 服务启动失败，查看日志: cat $LOG_DIR/rag.log"
fi

echo ""
echo "  🌐 前端页面      → http://106.53.198.194/"
echo "  📡 API 接口      → http://106.53.198.194:8080/health"
echo "  🔬 RAG 文档      → http://106.53.198.194:8001/docs"
echo ""
echo "  日志目录: $LOG_DIR/"
echo "  停止服务: bash $SCRIPT_DIR/stop.sh"
echo "============================================"

# 保存 PID 以便 stop.sh 使用
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$RAG_PID" > "$LOG_DIR/rag.pid"
