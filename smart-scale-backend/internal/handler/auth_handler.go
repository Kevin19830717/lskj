package handler

import (
	"net/http"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register 用户注册
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req model.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	resp, err := h.authService.Register(req.Phone, req.Password, req.Nickname)
	if err != nil {
		c.JSON(http.StatusConflict, model.ErrorResp(409, err.Error()))
		return
	}
	c.JSON(http.StatusOK, model.Success(resp))
}

// Login 用户登录
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	resp, err := h.authService.Login(req.Phone, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, model.ErrorResp(401, err.Error()))
		return
	}
	c.JSON(http.StatusOK, model.Success(resp))
}

// GetCurrentUser 获取当前登录用户信息
// GET /api/v1/user/me
func (h *AuthHandler) GetCurrentUser(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, model.ErrorResp(401, "Not authenticated"))
		return
	}

	userService := c.MustGet("user_service").(*service.UserService)
	ctx := c.Request.Context()
	profile, err := userService.GetProfile(ctx, int(userID.(int64)))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get user info"))
		return
	}

	c.JSON(http.StatusOK, model.Success(profile))
}
