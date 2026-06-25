package handler

import (
	"net/http"
	"path/filepath"
	"strconv"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userService *service.UserService
	authService *service.AuthService
}

func NewUserHandler(userService *service.UserService, authService *service.AuthService) *UserHandler {
	return &UserHandler{userService: userService, authService: authService}
}

// GetProfile 获取用户画像
// GET /api/v1/user/profile
func (h *UserHandler) GetProfile(c *gin.Context) {
	userID := c.GetInt64("user_id")
	ctx := c.Request.Context()

	profile, err := h.userService.GetProfile(ctx, int(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get profile"))
		return
	}
	c.JSON(http.StatusOK, model.Success(profile))
}

// UpdateProfile 更新用户画像
// PUT /api/v1/user/profile
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req model.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	err := h.userService.UpdateProfile(c.Request.Context(), int(userID), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to update profile: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, model.SuccessWithMessage("Profile updated successfully", nil))
}

// UploadMedicalReport 上传体检报告
// POST /api/v1/user/medical-report
func (h *UserHandler) UploadMedicalReport(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req model.MedicalReportUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	err := h.userService.UploadMedicalReport(c.Request.Context(), int(userID), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to upload medical report: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, model.SuccessWithMessage("Medical report uploaded successfully", req.ReportType))
}

// GetUserStats 获取用户统计信息
// GET /api/v1/user/stats
func (h *UserHandler) GetUserStats(c *gin.Context) {
	userID := c.GetInt64("user_id")
	stats, err := h.userService.GetUserStats(c.Request.Context(), int(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get stats"))
		return
	}
	c.JSON(http.StatusOK, model.Success(stats))
}

// GetHealthScore 获取健康评分
// GET /api/v1/user/health-score
func (h *UserHandler) GetHealthScore(c *gin.Context) {
	userID := c.GetInt64("user_id")
	score, err := h.userService.GetHealthScore(c.Request.Context(), int(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to calculate health score"))
		return
	}
	c.JSON(http.StatusOK, model.Success(map[string]int{"health_score": score}))
}

// UpdateAvatar 更新头像（文件上传）
// POST /api/v1/user/avatar
func (h *UserHandler) UpdateAvatar(c *gin.Context) {
	userID := c.GetInt64("user_id")
	file, err := c.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "No file uploaded"))
		return
	}

	// 检查文件大小（限制5MB）
	const maxSize = 5 * 1024 * 1024
	if file.Size > maxSize {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "File too large (max 5MB)"))
		return
	}

	// 保存文件到 uploads 目录
	filename := strconv.FormatInt(userID, 10) + "_avatar" + filepath.Ext(file.Filename)
	savePath := filepath.Join("uploads", filename)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to save avatar file"))
		return
	}

	// 更新数据库中的 avatar_url
	avatarURL := "/uploads/" + filename
	if err := h.userService.UpdateAvatar(c.Request.Context(), int(userID), avatarURL); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to update avatar"))
		return
	}

	c.JSON(http.StatusOK, model.SuccessWithMessage("Avatar updated", map[string]string{"avatar_url": avatarURL}))
}

// ResetAvatar 重置头像为默认（名字首字）
// GET /api/v1/user/avatar/reset
func (h *UserHandler) ResetAvatar(c *gin.Context) {
	userID := c.GetInt64("user_id")

	if err := h.userService.UpdateAvatar(c.Request.Context(), int(userID), ""); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to reset avatar"))
		return
	}

	c.JSON(http.StatusOK, model.SuccessWithMessage("Avatar reset to default", nil))
}
