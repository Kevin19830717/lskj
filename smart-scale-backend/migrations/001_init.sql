-- ============================================================
-- Smart Scale Backend - Database Schema Initialization
-- ============================================================

-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. users 表 - 用户账户信息
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL       PRIMARY KEY,
    phone           VARCHAR(20)     UNIQUE NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    nickname        VARCHAR(50),
    avatar_url      VARCHAR(500),
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);

-- ============================================================
-- 2. user_profiles 表 - 用户健康画像
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id         INT             PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    gender          VARCHAR(10)     CHECK (gender IN ('male', 'female', 'other')),
    age             INT             CHECK (age > 0 AND age < 150),
    height_cm       NUMERIC(5,2)    CHECK (height_cm > 0),
    weight_kg       NUMERIC(5,2)    CHECK (weight_kg > 0),
    health_goal     VARCHAR(30)     CHECK (health_goal IN ('lose_weight', 'gain_weight', 'maintain', 'muscle_gain', 'health_maintenance')),
    allergies       JSONB           DEFAULT '[]',
    medical_reports JSONB           DEFAULT '{}',
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ============================================================
-- 3. foods 表 - 食材营养数据库（从final.json导入）
-- ============================================================
CREATE TABLE IF NOT EXISTS foods (
    id                  BIGSERIAL       PRIMARY KEY,
    name                VARCHAR(50)     NOT NULL,           -- 中文名
    name_en             VARCHAR(50)     UNIQUE NOT NULL,    -- 英文名标识
    category            VARCHAR(30),                        -- 分类
    edible_ratio        NUMERIC(4,3),                       -- 可食部比例
    energy_kcal         NUMERIC(8,2),                       -- 能量(kcal)
    protein_g           NUMERIC(8,2),                       -- 蛋白质(g)
    fat_g               NUMERIC(8,2),                       -- 脂肪(g)
    carbohydrate_g      NUMERIC(8,2),                       -- 碳水化合物(g)
    sodium_mg           NUMERIC(8,2),                       -- 钠(mg)
    cholesterol_mg      NUMERIC(8,2),                       -- 胆固醇(mg)
    vitamin_c_mg        NUMERIC(8,2),                       -- 维生素C(mg)
    calcium_mg          NUMERIC(8,2),                       -- 钙(mg)
    iron_mg             NUMERIC(8,2),                       -- 铁(mg)
    potassium_mg        NUMERIC(8,2),                       -- 钾(mg)
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_foods_name_en ON foods(name_en);
CREATE INDEX idx_foods_category ON foods(category);
CREATE INDEX idx_foods_name ON foods(name USING gin(to_tsvector('simple', name)));

-- ============================================================
-- 4. weigh_records 表 - 称重记录（分区表，按created_at范围分区）
-- ============================================================
CREATE TABLE IF NOT EXISTS weigh_records (
    id                      BIGSERIAL,
    user_id                 INT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ingredients             JSONB           NOT NULL DEFAULT '[]',   -- ["chicken","carrot"]
    raw_weights_g           JSONB           NOT NULL DEFAULT '[]',   -- [200,80]
    cooking_method          VARCHAR(20)     CHECK (cooking_method IN ('boil','braise','deep_fry','pan_fry','roast','steam','stir_fry')),
    cooked_weight_g         NUMERIC(10,2),
    cooked_energy_kcal      NUMERIC(12,4),
    cooked_protein_g        NUMERIC(12,4),
    cooked_fat_g            NUMERIC(12,4),
    cooked_carbohydrate_g   NUMERIC(12,4),
    cooked_sodium_mg        NUMERIC(12,4),
    cooked_cholesterol_mg   NUMERIC(12,4),
    cooked_vitamin_c_mg     NUMERIC(12,4),
    cooked_calcium_mg       NUMERIC(12,4),
    cooked_iron_mg          NUMERIC(12,4),
    cooked_potassium_mg     NUMERIC(12,4),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 创建默认分区
CREATE TABLE IF NOT EXISTS weigh_records_default PARTITION OF weigh_records DEFAULT;

-- 索引
CREATE INDEX idx_weigh_records_user_created ON weigh_records(user_id, created_at DESC);

-- ============================================================
-- 5. user_analysis_summaries 表 - 营养分析摘要
-- ============================================================
CREATE TABLE IF NOT EXISTS user_analysis_summaries (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         INT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary_date    DATE            NOT NULL,
    summary_type    VARCHAR(10)     NOT NULL CHECK (summary_type IN ('daily','weekly','monthly','yearly')),
    source          VARCHAR(10)     NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
    insights        JSONB           DEFAULT '{}',
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE(user_id, summary_date, summary_type, source)
);

CREATE INDEX idx_summaries_user_date ON user_analysis_summaries(user_id, summary_date DESC, summary_type);

-- ============================================================
-- 6. health_advice_records 表 - 健康建议记录
-- ============================================================
CREATE TABLE IF NOT EXISTS health_advice_records (
    id                  BIGSERIAL       PRIMARY KEY,
    user_id             INT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date     DATE            NOT NULL,
    advice_content      TEXT,
    advice_type         VARCHAR(15)     NOT NULL CHECK (advice_type IN ('weekly','monthly','long_term')),
    generated_at        TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_advice_records_user_type ON health_advice_records(user_id, advice_type, generated_at DESC);

-- ============================================================
-- 7. user_health_embeddings 表 - 健康数据向量嵌入（pgvector）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_health_embeddings (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         INT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type     VARCHAR(15)     NOT NULL CHECK (source_type IN ('daily_summary','weekly_summary','monthly_summary','yearly_summary','weigh_record','medical_report')),
    source_date     DATE            NOT NULL,
    content_text    TEXT            NOT NULL,
    embedding       VECTOR(1536),
    metadata        JSONB           DEFAULT '{}',
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- IVFFlat 索引用于向量相似度搜索
CREATE INDEX idx_embeddings_ivfflat ON user_health_embeddings USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
-- 辅助索引
CREATE INDEX idx_embeddings_user_date ON user_health_embeddings(user_id, source_date DESC);

-- ============================================================
-- 自动更新 updated_at 触发器函数
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表应用触发器
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_foods_updated_at ON foods;
CREATE TRIGGER update_foods_updated_at BEFORE UPDATE ON foods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
