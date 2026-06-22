package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/repository"

	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
)

type DeviceService struct {
	repo *repository.DeviceRepository
}

func NewDeviceService(repo *repository.DeviceRepository) *DeviceService {
	return &DeviceService{repo: repo}
}

// Provision 批量预登记设备，返回每个设备的明文密钥（仅此一次）
func (s *DeviceService) Provision(ctx context.Context, count int, prefix, name string) ([]model.ProvisionedDevice, error) {
	if prefix == "" {
		prefix = "SS"
	}
	prefix = strings.ToUpper(prefix)

	result := make([]model.ProvisionedDevice, 0, count)
	for i := 0; i < count; i++ {
		deviceID, err := generateDeviceID(prefix)
		if err != nil {
			return nil, fmt.Errorf("failed to generate device id: %w", err)
		}
		secret, err := generateSecret()
		if err != nil {
			return nil, fmt.Errorf("failed to generate secret: %w", err)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(secret), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("failed to hash secret: %w", err)
		}
		if _, err := s.repo.Create(ctx, deviceID, string(hash), name); err != nil {
			return nil, fmt.Errorf("failed to create device %s: %w", deviceID, err)
		}
		result = append(result, model.ProvisionedDevice{DeviceID: deviceID, Secret: secret})
		logrus.Infof("Device provisioned: %s", deviceID)
	}
	return result, nil
}

// Bind 用户扫码绑定设备
func (s *DeviceService) Bind(ctx context.Context, userID int, deviceID, name string) (*model.Device, error) {
	dev, err := s.repo.FindByDeviceID(ctx, deviceID)
	if err != nil {
		return nil, err
	}
	if dev == nil {
		return nil, fmt.Errorf("设备不存在，请检查序列号")
	}
	if dev.Status == model.DeviceStatusRevoked {
		return nil, fmt.Errorf("设备已被吊销，请联系客服")
	}
	if dev.Status == model.DeviceStatusActive {
		return nil, fmt.Errorf("设备已被其他账号绑定")
	}
	if err := s.repo.Bind(ctx, deviceID, userID, name); err != nil {
		return nil, err
	}
	dev, _ = s.repo.FindByDeviceID(ctx, deviceID)
	logrus.Infof("Device %s bound to user %d", deviceID, userID)
	return dev, nil
}

// Unbind 用户解绑设备
func (s *DeviceService) Unbind(ctx context.Context, userID int, deviceID string) error {
	return s.repo.Unbind(ctx, deviceID, userID)
}

// ListByUser 列出用户绑定的设备
func (s *DeviceService) ListByUser(ctx context.Context, userID int) ([]*model.Device, error) {
	return s.repo.ListByUser(ctx, userID)
}

// Authenticate 设备认证：校验 device_id + secret，返回设备（含绑定用户）
func (s *DeviceService) Authenticate(ctx context.Context, deviceID, secret string) (*model.Device, error) {
	dev, err := s.repo.FindByDeviceID(ctx, deviceID)
	if err != nil {
		return nil, err
	}
	if dev == nil {
		return nil, fmt.Errorf("设备不存在")
	}
	if bcrypt.CompareHashAndPassword([]byte(dev.SecretHash), []byte(secret)) != nil {
		return nil, fmt.Errorf("设备密钥无效")
	}
	if dev.Status == model.DeviceStatusRevoked {
		return nil, fmt.Errorf("设备已被吊销")
	}
	if dev.Status != model.DeviceStatusActive {
		return nil, fmt.Errorf("设备尚未激活")
	}
	if dev.BoundUserID == nil {
		return nil, fmt.Errorf("设备尚未绑定用户")
	}
	return dev, nil
}

// Revoke 吊销设备（后台）
func (s *DeviceService) Revoke(ctx context.Context, deviceID string) error {
	return s.repo.Revoke(ctx, deviceID)
}

// generateDeviceID 生成设备序列号: 前缀 + YYMM + 10位随机hex，如 SS2506A3F1B9C8D2
func generateDeviceID(prefix string) (string, error) {
	b := make([]byte, 5) // 10 hex chars
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	ts := time.Now().Format("0601") // YYMM
	return fmt.Sprintf("%s%s%s", prefix, ts, strings.ToUpper(hex.EncodeToString(b))), nil
}

// generateSecret 生成 64 位十六进制密钥（32 字节随机数）
func generateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
