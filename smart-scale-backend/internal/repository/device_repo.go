package repository

import (
	"context"
	"fmt"

	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type DeviceRepository struct{}

func NewDeviceRepository() *DeviceRepository { return &DeviceRepository{} }

const deviceColumns = `id, device_id, secret_hash, name, status, bound_user_id, activated_at, created_at, updated_at`

func scanDevice(row pgx.Row, d *model.Device) error {
	return row.Scan(
		&d.ID, &d.DeviceID, &d.SecretHash, &d.Name, &d.Status,
		&d.BoundUserID, &d.ActivatedAt, &d.CreatedAt, &d.UpdatedAt,
	)
}

// Create 新建设备（出厂预登记，状态 inactive）
func (r *DeviceRepository) Create(ctx context.Context, deviceID, secretHash, name string) (*model.Device, error) {
	var d model.Device
	query := `INSERT INTO devices (device_id, secret_hash, name, status, created_at, updated_at)
	          VALUES ($1, $2, $3, 'inactive', NOW(), NOW())
	          RETURNING ` + deviceColumns
	if err := scanDevice(database.Pool.QueryRow(ctx, query, deviceID, secretHash, name), &d); err != nil {
		return nil, fmt.Errorf("failed to create device: %w", err)
	}
	return &d, nil
}

// FindByDeviceID 按序列号查询设备
func (r *DeviceRepository) FindByDeviceID(ctx context.Context, deviceID string) (*model.Device, error) {
	var d model.Device
	query := `SELECT ` + deviceColumns + ` FROM devices WHERE device_id = $1`
	err := scanDevice(database.Pool.QueryRow(ctx, query, deviceID), &d)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find device: %w", err)
	}
	return &d, nil
}

// Bind 绑定设备到用户（原子操作：仅 inactive 且未绑定可成功）
func (r *DeviceRepository) Bind(ctx context.Context, deviceID string, userID int, name string) error {
	query := `UPDATE devices
	          SET status = 'active', bound_user_id = $1,
	              name = COALESCE(NULLIF($2, ''), name),
	              activated_at = NOW(), updated_at = NOW()
	          WHERE device_id = $3 AND status = 'inactive' AND bound_user_id IS NULL`
	result, err := database.Pool.Exec(ctx, query, userID, name, deviceID)
	if err != nil {
		return fmt.Errorf("failed to bind device: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("设备不存在或已被激活/绑定")
	}
	return nil
}

// Unbind 解绑设备（仅绑定者可解绑，回到 inactive）
func (r *DeviceRepository) Unbind(ctx context.Context, deviceID string, userID int) error {
	query := `UPDATE devices
	          SET status = 'inactive', bound_user_id = NULL, activated_at = NULL, updated_at = NOW()
	          WHERE device_id = $1 AND bound_user_id = $2`
	result, err := database.Pool.Exec(ctx, query, deviceID, userID)
	if err != nil {
		return fmt.Errorf("failed to unbind device: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("设备不存在或不属于当前用户")
	}
	return nil
}

// ListByUser 列出用户绑定的设备
func (r *DeviceRepository) ListByUser(ctx context.Context, userID int) ([]*model.Device, error) {
	query := `SELECT ` + deviceColumns + ` FROM devices WHERE bound_user_id = $1 ORDER BY created_at DESC`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}
	defer rows.Close()

	var devices []*model.Device
	for rows.Next() {
		var d model.Device
		if err := scanDevice(rows, &d); err != nil {
			continue
		}
		devices = append(devices, &d)
	}
	return devices, nil
}

// Revoke 吊销设备（后台）
func (r *DeviceRepository) Revoke(ctx context.Context, deviceID string) error {
	query := `UPDATE devices SET status = 'revoked', updated_at = NOW() WHERE device_id = $1`
	result, err := database.Pool.Exec(ctx, query, deviceID)
	if err != nil {
		return fmt.Errorf("failed to revoke device: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("设备不存在")
	}
	return nil
}
