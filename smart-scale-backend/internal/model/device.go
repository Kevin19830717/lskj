package model

import "time"

// 设备状态
const (
	DeviceStatusInactive = "inactive" // 未激活（出厂未绑定）
	DeviceStatusActive   = "active"   // 已激活（已绑定用户）
	DeviceStatusRevoked  = "revoked"  // 已吊销
)

// Device 嵌入式秤设备
type Device struct {
	ID          int64      `json:"id" db:"id"`
	DeviceID    string     `json:"device_id" db:"device_id"`     // 出厂序列号
	SecretHash  string     `json:"-" db:"secret_hash"`           // 密钥哈希，不外泄
	Name        string     `json:"name,omitempty" db:"name"`     // 备注
	Status      string     `json:"status" db:"status"`           // inactive/active/revoked
	BoundUserID *int       `json:"bound_user_id,omitempty" db:"bound_user_id"`
	ActivatedAt *time.Time `json:"activated_at,omitempty" db:"activated_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

// DeviceResponse 设备响应（不含密钥哈希）
type DeviceResponse struct {
	ID          int64      `json:"id"`
	DeviceID    string     `json:"device_id"`
	Name        string     `json:"name,omitempty"`
	Status      string     `json:"status"`
	BoundUserID *int       `json:"bound_user_id,omitempty"`
	ActivatedAt *time.Time `json:"activated_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ToResponse 转换为安全响应
func (d *Device) ToResponse() DeviceResponse {
	return DeviceResponse{
		ID:          d.ID,
		DeviceID:    d.DeviceID,
		Name:        d.Name,
		Status:      d.Status,
		BoundUserID: d.BoundUserID,
		ActivatedAt: d.ActivatedAt,
		CreatedAt:   d.CreatedAt,
	}
}

// ProvisionDevicesRequest 批量预登记设备（后台）
type ProvisionDevicesRequest struct {
	Count  int    `json:"count" binding:"required,min=1,max=1000"`
	Prefix string `json:"prefix,omitempty"` // device_id 前缀，默认 SS
	Name   string `json:"name,omitempty"`   // 批次备注名
}

// ProvisionedDevice 单个预登记结果（含明文密钥，仅此一次返回，需立即烧录）
type ProvisionedDevice struct {
	DeviceID string `json:"device_id"`
	Secret   string `json:"secret"` // 明文密钥，后端只存哈希，无法再次获取
}

// BindDeviceRequest 绑定/解绑设备请求
type BindDeviceRequest struct {
	DeviceID string `json:"device_id" binding:"required"`
	Name     string `json:"name,omitempty"` // 绑定时可选的备注名
}
