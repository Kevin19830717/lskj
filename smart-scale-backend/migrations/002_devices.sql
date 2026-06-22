-- ============================================================
-- 8. devices 表 - 嵌入式秤设备表（设备认证 + 用户绑定）
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
    id              BIGSERIAL       PRIMARY KEY,
    device_id       VARCHAR(64)     UNIQUE NOT NULL,           -- 出厂序列号，烧录到秤并印成二维码
    secret_hash     VARCHAR(255)    NOT NULL,                  -- device_secret 的 bcrypt 哈希
    name            VARCHAR(100),                               -- 设备备注名
    status          VARCHAR(20)     NOT NULL DEFAULT 'inactive'
                    CHECK (status IN ('inactive','active','revoked')), -- 未激活/已激活/已吊销
    bound_user_id   INT             REFERENCES users(id) ON DELETE SET NULL, -- 绑定的用户(单用户)
    activated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_bound_user ON devices(bound_user_id);

-- 自动更新 updated_at
DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
