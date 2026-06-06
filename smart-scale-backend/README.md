# 🥗 Smart Scale Backend - 智能饮食健康秤

端侧智能饮食管理系统后端服务，基于 ESP32-P4 嵌入式设备 + Go 后端 + DashScope AI 的完整解决方案。

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| **食材识别与营养计算** | ESP32-P4 端侧识别食材 → HTTP上报 → 自动计算烹饪后营养值 |
| **营养分析摘要** | 支持日报/周报/月报/年报，自动分层归档 |
| **AI 健康建议** | RAG 架构：摘要向量化 → 相似检索 Top-K → 注入 Prompt → qwen-plus 生成 |
| **用户画像管理** | 基础信息、健康目标、过敏史、体检报告上传 |
| **仪表盘可视化** | Chart.js 热量趋势图、营养素分布饼图、常吃食物排行 |
| **定时任务** | robfig/cron: 每日归档 + 每周一 RAG 建议 |

## 🏗️ 技术栈

```
后端框架: Gin (Go Web Framework)
数据库: PostgreSQL 16 + pgvector 0.7.4 (向量相似度搜索)
认证: JWT (golang-jwt/jwt/v5) + bcrypt 密码加密
配置: Viper (支持 YAML + 环境变量覆盖)
日志: Logrus
定时任务: robfig/cron/v3
AI能力: 阿里云 DashScope (qwen-plus / text-embedding-v2 / qwen-vl-flash)
前端: HTML5 + CSS3 + Chart.js (纯静态页面，无需构建工具)
部署: Docker Compose + Nginx 反向代理
```

## 📁 项目结构

```
smart-scale-backend/
├── cmd/server/main.go          # 入口：加载配置→初始化DB→依赖注入→启动HTTP+Cron→优雅关闭
├── configs/config.yaml         # Viper 配置文件（含环境变量占位符）
├── migrations/001_init.sql     # 全部 DDL：8张表 + pgvector 扩展 + 触发器
├── internal/
│   ├── config/                 # 配置加载模块
│   ├── model/                  # 数据模型 (user, meal, food, nutrition, health_advice)
│   ├── database/               # pgx 连接池管理
│   ├── repository/             # 数据访问层 (6个Repo)
│   ├── service/                # 业务逻辑层 (7个Service: auth/user/meal/food/summary/RAG/embedding)
│   ├── handler/                # HTTP 处理器 (7个Handler)
│   ├── middleware/              # CORS + JWT Auth + Logger
│   ├── cron/                   # 定时任务调度器 (每日归档 + 每周RAG建议)
│   └── router/                 # 路由注册 (RESTful API)
├── pkg/dashscope/client.go     # DashScope API 封装 (文本/多模态/Embedding)
├── frontend/                   # 前端静态页面 (登录/仪表盘/个人中心/历史记录/营养报告/食物库)
└── scripts/generate_test_data.go # 测试数据生成 (3用户×7年)
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 已安装环境（服务器上）
# - PostgreSQL 16 + pgvector 0.7.4
# - Go >= 1.22
# - Nginx (可选)

# 克隆项目
cd /home/ubuntu/lskj/smart-scale-backend
```

### 2. 数据库初始化

```bash
# 方式A: 直接执行SQL
psql -U postgres -d smart_scale -f migrations/001_init.sql

# 方式B: 使用 Makefile
make migrate
```

### 3. 导入食物数据

```bash
go run scripts/generate_test_data.go -foods ../final.json
```

### 4. 启动服务

```bash
# 开发模式
make run

# 或者直接运行
go run cmd/server/main.go

# 生产模式 (Docker)
docker-compose up -d
```

### 5. 生成测试数据（可选）

```bash
go run scripts/generate_test_data.go -test-data
```

## 🔌 API 接口文档

### 认证接口 (`/api/v1/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | 注册 (phone, password, nickname) |
| POST | `/auth/login` | 登录返回JWT |

### 用户接口 (`/api/v1/user`) — 需要JWT

| Method | Path | Description |
|--------|------|-------------|
| GET | `/user/me` | 当前用户信息 |
| GET | `/user/profile` | 获取健康画像 |
| PUT | `/user/profile` | 更新画像 |
| POST | `/user/medical-report` | 上传体检报告 |
| GET | `/user/stats` | 统计信息 |

### 称重数据 (`/api/v1/weigh-in`) — 嵌入式端调用

**上报格式 (POST JSON):**
```json
{
  "ingredients": ["chicken", "carrot"],
  "raw_weights_g": [200, 80],
  "cooking_method": "stir_fry"
}
```

烹饪方式编码: `boil`(煮), `braise`(炖), `deep_fry`(炸), `pan_fry`(煎), `roast`(烤), `steam`(蒸), `stir_fry`(炒)

**响应示例:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 1,
    "ingredients": ["chicken", "carrot"],
    "cooked_energy_kcal": 342.56,
    "cooked_protein_g": 42.3,
    ...
  }
}
```

### 营养摘要 (`/api/v1/summaries`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/summaries/generate?type=weekly` | 手动生成周报 |
| GET | `/summaries?type=weekly&limit=20` | 查看历史摘要列表 |

### AI健康建议 (`/api/v1/health-advice`) — RAG架构

| Method | Path | Description |
|--------|------|-------------|
| POST | `/health-advice/generate?type=weekly` | 异步生成RAG建议 |
| GET | `/health-advice/latest?type=weekly` | 获取最新建议 |

**RAG 流程:**
```
最新摘要 → 向量化(query embedding) → pgvector检索Top5相似历史
  ↓
构建Prompt(注入上下文+相似案例) → DashScope qwen-plus生成建议
  ↓
保存到 health_advice_records 表
```

### 仪表盘 (`/api/v1/dashboard`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/stats` | 统计概览(7天热量趋势等) |
| GET | `/dashboard/recent-meals?limit=10` | 最近餐食 |

## 🎨 前端页面

访问 `http://your-server:8080/frontend/index.html` 或通过 Nginx 直接访问根路径：

| 页面 | 功能 |
|------|------|
| `index.html` | 登录/注册 |
| `dashboard.html` | 仪表盘（统计卡片 + Chart.js图表 + AI建议） |
| `profile.html` | 个人资料编辑 + 体检报告上传 |
| `records.html` | 称重历史记录表格（分页+筛选） |
| `reports.html` | 营养分析报告列表（日报/周报/月报/年报） |
| `foods.html` | 食物库浏览与搜索 |

前端特点：
- Chart.js 展示热量趋势折线图 + 营养素分布环形图
- 数值为0的营养项不显示（条件渲染）
- 响应式设计，适配移动端
- 无需Node.js构建，直接打开HTML即可使用

## ⏰ 定时任务

```yaml
cron:
  weekly_advice: "0 8 * * 1"   # 每周一 08:00 生成周报+RAG建议
  daily_archive: "0 2 * * *"   # 每天 02:00 归档daily summary
```

### 分层归档逻辑

```
原始记录 (>1个月) ──→ Daily Summary
Daily Summary (>3个月) ──→ Weekly Summary  
Weekly Summary (>1年) ──→ Monthly Summary
Monthly Summary (>3年) ──→ Yearly Summary
```

## 🧪 测试数据

运行测试数据生成脚本：

```bash
# 导入31种食材
go run scripts/generate_test_data.go -foods ../final.json

# 生成3个用户的7年模拟数据
go run scripts/generate_test_data.go -test-data
```

生成的测试数据：
- **3个用户**: 张三(减脂)、李四(保持)、王五(健康维护)
- **时间跨度**: 7年前至今
- **每用户**: 约 5000+ 条称重记录（每天2-4餐）
- **覆盖全部31种食材** 和 **7种烹饪方式**

## 🔒 安全说明

- 密码: bcrypt 加密存储
- JWT: 24小时有效期，HMAC-SHA256签名
- SQL: 全部参数化查询防注入
- CORS: 白名单控制（默认开发模式允许所有来源）
- 文件上传: 类型+大小双重限制

## 📝 License

MIT License

---

**Smart Scale Backend v1.0** | Powered by Go + PostgreSQL + DashScope AI
