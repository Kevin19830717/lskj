# 智能饮食健康秤 — 项目总览

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      嵌入式设备 (ESP32-P4)                    │
│  摄像头(YOLO11n) + 压力传感器 + LightGBM营养预测 + LCD显示   │
│                         ↕ HTTP                               │
├─────────────────────────────────────────────────────────────┤
│                     云端服务器 (Ubuntu)                       │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐ │
│  │  Go 后端      │   │ Python RAG   │   │ PostgreSQL 16  │ │
│  │  :8080       │◄──┤  服务 :8001  │──►│ + pgvector     │ │
│  │  (API/存储)   │   │ (AI/向量)    │   │                │ │
│  └──────┬───────┘   └──────────────┘   └────────────────┘ │
│         │                                                  │
│  ┌──────▼───────┐          ┌──────────────────────────┐    │
│  │  Nginx :80   │          │  阿里云百炼               │    │
│  │  (反向代理/    │─────────►│  qwen-plus(文本生成)     │    │
│  │   静态文件)   │          │  qwen-vl-flash(多模态)   │    │
│  └──────────────┘          │  text-embedding-v2       │    │
│                             └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
lskj/
├── smart-scale-backend/      # Go 后端服务
│   ├── cmd/server/main.go
│   ├── internal/             # 业务代码
│   ├── pkg/dashscope/        # DashScope API封装
│   ├── frontend/             # 前端页面
│   └── scripts/              # 测试数据生成
├── rag-service/              # Python RAG/AI服务
│   ├── app.py                # FastAPI入口
│   ├── services/             # RAG核心逻辑
│   └── routers/              # API路由
├── final.json                # 31种食材营养数据库
├── Kevin.json                # LightGBM训练数据集
├── docker-compose.yml        # 一键部署
├── nginx/nginx.conf          # Nginx配置
└── README.md                 # 本文件
```

## 快速开始

### 1. 环境要求

- Go >= 1.22
- Python >= 3.10
- PostgreSQL 16 + pgvector
- Nginx

### 2. 使用 Docker Compose（推荐）

```bash
cp .env.example .env
# 编辑 .env，填入阿里云 API Key
docker-compose up -d --build
```

### 3. 手动启动

**后端：**
```bash
cd smart-scale-backend
go mod tidy
source .env
go run cmd/server/main.go
```

**RAG 服务：**
```bash
cd rag-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8001
```

**Nginx：**
```bash
sudo cp nginx/nginx.conf /etc/nginx/
sudo nginx -t && sudo systemctl restart nginx
```

## 核心功能模块

| 模块 | 技术栈 | 说明 |
|------|--------|------|
| 用户认证 | JWT (golang-jwt/v5) | 注册/登录/鉴权 |
| 称重数据上报 | Gin + pgx | 接收嵌入式端数据 |
| 营养摘要 | 定时任务(cron) | 日/周/月/年聚合归档 |
| 向量检索 | pgvector + DashScope embedding | RAG相似度搜索 |
| AI健康建议 | qwen-plus + RAG | 个性化饮食建议 |
| 体检报告解析 | qwen-vl-flash | 多模态OCR提取 |
| 数据分层归档 | cron调度 | 自动聚合历史数据 |

## API 文档

### 认证
- `POST /api/v1/auth/register` — 注册
- `POST /api/v1/auth/login` — 登录（返回JWT）
- `GET /api/v1/user/me` — 当前用户信息

### 用户画像
- `GET/PUT /api/v1/user/profile` — 查看/编辑画像
- `POST /api/v1/user/medical-report` — 上传体检报告

### 称重记录
- `POST /api/v1/weigh-in` — 上报称重数据
- `GET /api/v1/records` — 查询历史记录

### 营养摘要
- `POST /api/v1/summaries/generate?type=weekly` — 手动生成摘要
- `GET /api/v1/summaries?type=weekly&date=...` — 查看摘要

### AI建议 (RAG)
- `POST /api/v1/health-advice/generate` — 生成AI建议
- `GET /api/v1/health-advice/latest?type=weekly` — 最新建议

### 食物库
- `GET /api/v1/foods` — 食物列表
- `GET /api/v1/foods/search?query=` — 搜索食物

### 仪表盘
- `GET /api/v1/dashboard/stats` — 统计概览
- `GET /api/v1/dashboard/recent-meals` — 最近餐食

## 嵌入式通信格式

嵌入式端 → 后端 POST `/api/v1/weigh-in`：

```json
{
  "user_id": "device_id",
  "timestamp": "2026-06-04T19:00:00+08:00",
  "ingredients": ["chicken","carrot","potato"],
  "raw_weights_g": [200.0, 80.5, 150.0],
  "cooking_method": "stir_fry",
  "nutrition": {
    "cooked_weight_g": 389.6,
    "cooked_energy_kcal": 452.3,
    "cooked_protein_g": 40.2,
    "cooked_fat_g": 12.5,
    "cooked_carbohydrate_g": 33.1,
    "cooked_sodium_mg": 1240,
    "cooked_cholesterol_mg": 106,
    "cooked_vitamin_c_mg": 8.4,
    "cooked_calcium_mg": 56,
    "cooked_iron_mg": 3.8,
    "cooked_potassium_mg": 712
  }
}
```

## 数据分层归档策略

```
原始称重记录 (weigh_records)
    │  > 1个月
    ▼
日度汇总 (summary_type='daily')
    │  > 3个月  
    ▼
周度汇总 (summary_type='weekly')
    │  > 1年
    ▼
月度汇总 (summary_type='monthly')
    │  > 3年
    ▼
年度汇总 (summary_type='yearly') — 长期保存
```
