#!/bin/bash
# 智能饮食健康秤 — 一键停止脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

echo "停止服务..."

pkill -f "smart-scale-server" 2>/dev/null && echo "  ✅ Go 后端已停止" || echo "  Go 后端未运行"
pkill -f "uvicorn app:app" 2>/dev/null && echo "  ✅ RAG 服务已停止" || echo "  RAG 服务未运行"

if [ -f "$LOG_DIR/backend.pid" ]; then
    kill $(cat "$LOG_DIR/backend.pid") 2>/dev/null || true
    rm -f "$LOG_DIR/backend.pid"
fi
if [ -f "$LOG_DIR/rag.pid" ]; then
    kill $(cat "$LOG_DIR/rag.pid") 2>/dev/null || true
    rm -f "$LOG_DIR/rag.pid"
fi

echo "所有服务已停止"
