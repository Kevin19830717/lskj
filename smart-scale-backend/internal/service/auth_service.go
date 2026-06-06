package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
)

// AuthResponse 认证响应
type AuthResponse struct {
	Token string           `json:"token"`
	User  model.UserResponse `json:"user"`
}

type AuthService struct {
	userRepo interface {
		FindByPhone(ctx context.Context, phone string) (*model.User, error)
		Create(ctx context.Context, req *model.RegisterRequest) (*model.User, error)
	}
	cfg      *config.JWTConfig
}

func NewAuthService(userRepo interface {
	FindByPhone(ctx context.Context, phone string) (*model.User, error)
	Create(ctx context.Context, req *model.RegisterRequest) (*model.User, error)
}, cfg *config.JWTConfig) *AuthService {
	return &AuthService{userRepo: userRepo, cfg: cfg}
}

// CustomClaims 自定义JWT Claims
type CustomClaims struct {
	UserID   int64  `json:"user_id"`
	Phone    string `json:"phone"`
	Nickname string `json:"nickname"`
	jwt.RegisteredClaims
}

// Register 用户注册
func (s *AuthService) Register(phone, password, nickname string) (*AuthResponse, error) {
	ctx := context.Background()
	// 检查手机号是否已注册
	existing, err := s.userRepo.FindByPhone(ctx, phone)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing user: %w", err)
	}
	if existing != nil {
		return nil, errors.New("phone number already registered")
	}

	// 创建用户
	req := &model.RegisterRequest{
		Phone:    phone,
		Password: password,
		Nickname: nickname,
	}
	user, err := s.userRepo.Create(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// 生成JWT
	token, err := s.GenerateToken(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	logrus.Infof("User registered successfully: phone=%s, id=%d", phone, user.ID)

	return &AuthResponse{
		Token: token,
		User:  user.ToResponse(),
	}, nil
}

// Login 用户登录
func (s *AuthService) Login(phone, password string) (*AuthResponse, error) {
	ctx := context.Background()
	user, err := s.userRepo.FindByPhone(ctx, phone)
	if err != nil {
		return nil, fmt.Errorf("login failed: %w", err)
	}
	if user == nil {
		return nil, errors.New("invalid phone or password")
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid phone or password")
	}

	// 生成JWT
	token, err := s.GenerateToken(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	logrus.Infof("User logged in successfully: phone=%s, id=%d", phone, user.ID)

	return &AuthResponse{
		Token: token,
		User:  user.ToResponse(),
	}, nil
}

// GenerateToken 生成JWT Token
func (s *AuthService) GenerateToken(user *model.User) (string, error) {
	now := time.Now()
	expireAt := now.Add(time.Duration(s.cfg.ExpireHours) * time.Hour)

	claims := CustomClaims{
		UserID:   user.ID,
		Phone:    user.Phone,
		Nickname: user.Nickname,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expireAt),
			Issuer:    "smart-scale-backend",
			Subject:   fmt.Sprintf("%d", user.ID),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString([]byte(s.cfg.Secret))
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return signedToken, nil
}

// ParseToken 解析并验证JWT Token
func (s *AuthService) ParseToken(tokenString string) (*CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.cfg.Secret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*CustomClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

// ValidateToken 验证Token是否有效（中间件用）
func (s *AuthService) ValidateToken(tokenString string) (int64, error) {
	claims, err := s.ParseToken(tokenString)
	if err != nil {
		return 0, err
	}
	return claims.UserID, nil
}

// HashPassword 哈希密码（公开方法）
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPassword 验证密码（公开方法）
func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
