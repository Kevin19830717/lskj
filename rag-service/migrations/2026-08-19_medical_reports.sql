-- 体检报告持久化存储
CREATE TABLE IF NOT EXISTS medical_reports (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_date DATE,
    indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    quick_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    model_used VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medical_reports_user ON medical_reports(user_id, created_at DESC);
