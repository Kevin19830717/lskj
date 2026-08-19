#!/bin/bash
# ============================================================
# 阿里云 API 全量测试脚本（逐个执行，记录耗时）
# ============================================================
set -e

BASE="http://localhost:8080"
RAG="http://localhost:8001"
LOG="/home/ubuntu/lskj/logs/api_test_$(date +%Y%m%d_%H%M%S).log"

log() { echo "$@" | tee -a "$LOG"; }

log "============================================"
log "  阿里云 AI API 全量测试"
log "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
log "  模型: qwen3.7-flash-2026-07-15 + qwen3.7-text-embedding"
log "============================================"
log ""

# 获取 token
TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
log "Token: ${TOKEN:0:20}..."
log ""

IMG="/home/ubuntu/lskj/nutrition_lgbm_complete/Stephen/prediction_scatter.png"

run() {
  local name="$1"; shift
  log ">>> [$name]"
  log "    POST $1"
  local url="$1"; shift

  local start=$(date +%s%3N)
  local resp=$(curl -s -w "\nHTTP:%{http_code}" -X POST "$url" "$@" 2>&1)
  local end=$(date +%s%3N)
  local elapsed=$((end - start))
  local elapsed_s=$(echo "scale=1; $elapsed/1000" | bc)

  local http_code=$(echo "$resp" | grep -oP 'HTTP:\K\d+')
  local body=$(echo "$resp" | sed '/^HTTP:/d')

  if [ "$http_code" = "200" ]; then
    local summary=$(echo "$body" | python3 -c "
import sys,json
d=json.load(sys.stdin)
c=d.get('code','?')
data=d.get('data',{})
parts=[f'code={c}']
for k in ['model_used','foods','retrieved_count','stored_count','results']:
    if k in data:
        v=data[k]
        if isinstance(v,list): parts.append(f'{k}={len(v)}')
        else: parts.append(f'{k}={v}')
if 'advice_content' in data: parts.append(f'advice={str(data[\"advice_content\"])[:80]}')
if 'reply' in data: parts.append(f'reply={str(data[\"reply\"])[:80]}')
if 'token_usage' in data: parts.append(f'tokens={data[\"token_usage\"]}')
if 'total_tokens_used' in data: parts.append(f'tokens={data[\"total_tokens_used\"]}')
print(' | '.join(parts))
" 2>/dev/null)
    log "    HTTP:200 | ${elapsed}ms (${elapsed_s}s) | $summary"
  elif [ "$http_code" = "202" ]; then
    local msg=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','')[:60])" 2>/dev/null)
    log "    HTTP:202 | ${elapsed}ms | 异步后台执行 | $msg"
  else
    log "    HTTP:$http_code | ${elapsed}ms | ${body:0:200}"
  fi
  log ""
}

# ============================================================
run "1.正餐识别(视觉-3.5s)" \
  "$BASE/api/v1/weigh-in/cooked-recognition?user_id=20" \
  -F "image=@$IMG" -F "weight_g=300"

run "2.拍照识别(视觉-2.5s)" \
  "$BASE/api/v1/weigh-in/photo" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$IMG" -F "mode=cooked"

run "3.文本向量化(embedding-0.5s)" \
  "$RAG/api/v1/rag/embedding" \
  -H "Content-Type: application/json" \
  -d '{"texts":["用户今天吃了宫保鸡丁和米饭总热量约800千卡"],"user_id":5,"source_type":"diet_summary","source_date":"2026-08-04"}'

run "4.相似检索(retrieve-0.3s)" \
  "$RAG/api/v1/rag/retrieve" \
  -H "Content-Type: application/json" \
  -d '{"query_text":"减脂饮食建议","user_id":5,"top_k":3}'

run "5.AI对话-快速(文本-5s)" \
  "$RAG/api/v1/rag/chat" \
  -H "Content-Type: application/json" \
  -d '{"user_id":5,"message":"我今天吃了炸鸡健康吗简短回答","mode":"fast","history":[]}'

run "6.AI对话-专家(文本-13s)" \
  "$RAG/api/v1/rag/chat" \
  -H "Content-Type: application/json" \
  -d '{"user_id":5,"message":"帮我简单分析最近的饮食情况","mode":"expert","history":[]}'

run "7.RAG建议生成(文本-5s)" \
  "$RAG/api/v1/rag/generate-advice" \
  -H "Content-Type: application/json" \
  -d '{"user_id":5,"current_summary":{"period":"本周","avg_daily_calories":2100,"avg_protein_g":75,"avg_fat_g":60,"avg_carbs_g":280,"top_foods":["米饭","鸡肉","白菜"],"cooking_methods_used":["stir_fry","steam"]},"user_profile":{"age":28,"gender":"male","height_cm":175,"weight_kg":72,"health_goal":"lose_weight"},"advice_type":"weekly"}'

run "8.营养素预测(本地模型-0.03s)" \
  "$RAG/predict-nutrients" \
  -H "Content-Type: application/json" \
  -d '{"ingredients":["鸡肉","米饭"],"weights":[200,150],"cooking_method":"stir_fry"}'

run "9.RAG健康建议-Go(异步-202)" \
  "$BASE/api/v1/health-advice/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id":5,"advice_type":"weekly"}'

log "============================================"
log "  全部测试完成！日志: $LOG"
log "============================================"
