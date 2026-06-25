package repository

import (
	"context"
	"fmt"
	"time"

	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
)

type UserRepository struct{}

func NewUserRepository() *UserRepository {
	return &UserRepository{}
}

// Create 创建新用户
func (r *UserRepository) Create(ctx context.Context, req *model.RegisterRequest) (*model.User, error) {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	var user model.User
	query := `INSERT INTO users (phone, password_hash, nickname, created_at, updated_at) 
	          VALUES ($1, $2, $3, NOW(), NOW()) 
	          RETURNING id, phone, password_hash, nickname, avatar_url, created_at, updated_at`

	err = database.Pool.QueryRow(ctx, query, req.Phone, string(hashedPassword), req.Nickname).Scan(
		&user.ID, &user.Phone, &user.PasswordHash, &user.Nickname,
		&user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}
	return &user, nil
}

// FindByPhone 通过手机号查找用户
func (r *UserRepository) FindByPhone(ctx context.Context, phone string) (*model.User, error) {
	var user model.User
	query := `SELECT id, phone, password_hash, nickname, avatar_url, created_at, updated_at 
	          FROM users WHERE phone = $1`

	err := database.Pool.QueryRow(ctx, query, phone).Scan(
		&user.ID, &user.Phone, &user.PasswordHash, &user.Nickname,
		&user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find user by phone: %w", err)
	}
	return &user, nil
}

// FindByID 通过ID查找用户
func (r *UserRepository) FindByID(ctx context.Context, userID int64) (*model.User, error) {
	var user model.User
	query := `SELECT id, phone, password_hash, nickname, avatar_url, created_at, updated_at 
	          FROM users WHERE id = $1`

	err := database.Pool.QueryRow(ctx, query, userID).Scan(
		&user.ID, &user.Phone, &user.PasswordHash, &user.Nickname,
		&user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find user by ID: %w", err)
	}
	return &user, nil
}

// UpdateAvatar 更新用户头像（空字符串设为 NULL，恢复默认头像）
func (r *UserRepository) UpdateAvatar(ctx context.Context, userID int64, avatarURL string) error {
	var avatarParam interface{}
	if avatarURL == "" {
		avatarParam = nil
	} else {
		avatarParam = avatarURL
	}
	query := `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`
	result, err := database.Pool.Exec(ctx, query, avatarParam, userID)
	if err != nil {
		return fmt.Errorf("failed to update avatar: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// ListUsers 分页列出用户（管理用）
func (r *UserRepository) ListUsers(ctx context.Context, offset, limit int) ([]*model.User, int64, error) {
	var total int64
	countQuery := `SELECT COUNT(*) FROM users`
	err := database.Pool.QueryRow(ctx, countQuery).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count users: %w", err)
	}

	query := `SELECT id, phone, password_hash, nickname, avatar_url, created_at, updated_at 
	          FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`
	rows, err := database.Pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Phone, &u.PasswordHash, &u.Nickname, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt); err != nil {
			logrus.WithError(err).Error("failed to scan user row")
			continue
		}
		users = append(users, &u)
	}

	return users, total, nil
}

// UpdateNickname 更新昵称
func (r *UserRepository) UpdateNickname(ctx context.Context, userID int64, nickname string) error {
	query := `UPDATE users SET nickname = $1, updated_at = NOW() WHERE id = $2`
	result, err := database.Pool.Exec(ctx, query, nickname, userID)
	if err != nil {
		return fmt.Errorf("failed to update nickname: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	logrus.Infof("User %d nickname updated to '%s'", userID, nickname)
	return nil
}

// DeleteUser 删除用户（软删除/硬删除）
func (r *UserRepository) DeleteUser(ctx context.Context, userID int64) error {
	query := `DELETE FROM users WHERE id = $1`
	result, err := database.Pool.Exec(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	logrus.Infof("User %d deleted", userID)
	return nil
}

// GetLastLoginTime 获取最后登录时间（通过最新记录推断）
func (r *UserRepository) GetLastActivity(ctx context.Context, userID int) (time.Time, error) {
	var lastTime time.Time
	query := `SELECT MAX(created_at) FROM weigh_records WHERE user_id = $1`
	err := database.Pool.QueryRow(ctx, query, userID).Scan(&lastTime)
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to get last activity: %w", err)
	}
	return lastTime, nil
}

// CountTotal 统计总用户数
func (r *UserRepository) CountTotal(ctx context.Context) (int64, error) {
	var count int64
	err := database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}
	return count, nil
}
