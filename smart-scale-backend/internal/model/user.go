package model

import "time"

// User 用户模型
type User struct {
	ID           int64      `json:"id" db:"id"`
	Phone        string     `json:"phone" db:"phone"`
	PasswordHash string     `json:"-" db:"password_hash"`
	Nickname     string     `json:"nickname" db:"nickname"`
	AvatarURL    *string    `json:"avatar_url,omitempty" db:"avatar_url"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at" db:"updated_at"`
}

// RegisterRequest 注册请求
type RegisterRequest struct {
	Phone       string `json:"phone" binding:"required,min=11,max=11"`
	Password    string `json:"password" binding:"required,min=6,max=64"`
	Nickname    string `json:"nickname" binding:"required,min=1,max=50"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Phone    string `json:"phone" binding:"required,min=11,max=11"`
	Password string `json:"password" binding:"required,min=6,max=64"`
}

// AuthResponse 认证响应（含JWT）
type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// UserResponse 用户信息响应（隐藏敏感字段）
type UserResponse struct {
	ID        int64     `json:"id"`
	Phone     string    `json:"phone"`
	Nickname  string    `json:"nickname"`
	AvatarURL string    `json:"avatar_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// ToResponse 转换为安全响应格式
func (u *User) ToResponse() UserResponse {
	avatar := ""
	if u.AvatarURL != nil {
		avatar = *u.AvatarURL
	}
	return UserResponse{
		ID:        u.ID,
		Phone:     u.Phone,
		Nickname:  u.Nickname,
		AvatarURL: avatar,
		CreatedAt: u.CreatedAt,
	}
}
