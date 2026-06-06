# 智能饮食健康秤 - RAG 服务

基于 **RAG（检索增强生成）** 的个性化饮食健康建议服务。

## 架构概览

```
Go Backend (port 8080)
    │  HTTP REST API
    ▼
Python RAG Service (port 8001)   ← 本项目
    │
    ├── DashScope API (阿里云百炼)
    │   ├── text-embedding-v2      → 文本向量化
    │   ├── qwen-plus              → 文本生成(健康建议)
    │   └── qwen-vl-flash          → 多模态(体检报告解析)
    │
    └── PostgreSQL + pgvector
        └── user_health_embeddings  → 向量存储与相似度检索
```

## 快速开始

### 1. 安装依赖

```bash
cd /home/ubuntu/lskj/rag-service
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入实际的 API Key 和数据库连接信息
```

### 3. 启动服务

```bash
python app.py
# 或使用 uvicorn
uvicorn app:app --host 0.0.0.0 --port 8001
```

服务启动后访问 `http://localhost:8001/docs` 查看 Swagger API 文档。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/rag/embedding` | 文本向量化并存入向量库 |
| POST | `/api/v1/rag/retrieve` | 向量相似度检索 Top-K |
| POST | `/api/v1/rag/generate-advice` | 完整 RAG 流水线生成健康建议 |
| POST | `/api/v1/rag/parse-medical-report` | 解析体检报告图片 |
| GET | `/api/v1/rag/health` | 服务健康检查 |

## 核心流程：生成健康建议 (generate-advice)

```
用户饮食数据(current_summary)
        │
        ▼ Step 1: 构建查询文本
  自然语言描述 "日均热量2100kcal, 蛋白质65g..."
        │
        ▼ Step 2: 向量化
  DashScope text-embedding-v2 → [1536维向量]
        │
        ▼ Step 3: 向量检索
  pgvector cosine similarity → Top 5 相似历史记录
        │
        ▼ Step 4: 构建 Prompt
  System Prompt(营养师角色) + User Prompt(当前数据+历史参考)
        │
        ▼ Step 5: LLM 生成
  DashScope qwen-plus → ~100字个性化建议
        │
        ▼ 返回结果
  { advice_content, context, token_usage, ... }
```

## 项目结构

```
rag-service/
├── app.py                    # FastAPI 入口
├── config.py                 # 配置管理 (pydantic-settings)
├── routers/
│   └── rag.py                # API 路由定义
├── services/
│   ├── embedding_service.py  # DashScope Embedding API 调用
│   ├── retrieval_service.py  # pgvector 余弦相似度检索
│   ├── generation_service.py # DashScope Text/Multimodal 生成
│   └── rag_pipeline.py       # 完整 RAG 流水线串联
├── models/
│   └── schemas.py            # Pydantic 请求/响应模型
├── database/
│   └── connection.py         # asyncpg 连接池管理
├── prompts/
│   ├── system_prompt.py      # 角色设定系统提示词
│   └── advice_templates.py   # 建议 prompt 模板构建
├── requirements.txt          # Python 依赖
└── .env                      # 环境变量配置
```

## 数据库表结构

`user_health_embeddings` 表:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户ID |
| embedding | VECTOR(1536) | 1536维向量 |
| source_text | TEXT | 原始文本 |
| source_type | VARCHAR(50) | 来源类型 |
| source_date | DATE | 数据日期 |
| metadata | JSONB | 扩展元数据 |
| created_at | TIMESTAMPTZ | 创建时间 |

## 技术栈

- **Web 框架**: FastAPI 0.115 + Uvicorn
- **数据库驱动**: asyncpg 0.29 + asyncpg-pgvector 0.2
- **HTTP 客户端**: httpx 0.27 (async)
- **AI 模型**: 阿里云百炼 DashScope
  - text-embedding-v2 (1536维)
  - qwen-plus (文本生成)
  - qwen-vl-flash (多模态视觉理解)
- **数据验证**: Pydantic v2
