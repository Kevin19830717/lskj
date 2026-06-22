-- ============================================================
-- 003 - AI 对话状态表（存储 previous_response_id 实现多轮记忆）
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_conversation_state (
    user_id             INT             PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_response_id    VARCHAR(100),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);
