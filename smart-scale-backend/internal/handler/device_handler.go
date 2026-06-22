package handler

import (
	"net/http"
	"strings"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type DeviceHandler struct {
	svc      *service.DeviceService
	adminKey string
}

func NewDeviceHandler(svc *service.DeviceService, adminKey string) *DeviceHandler {
	return &DeviceHandler{svc: svc, adminKey: adminKey}
}

// Provision 批量预登记设备（后台，需 X-Admin-Key）
// POST /api/v1/admin/devices
// Body: {"count": 10, "prefix": "SS", "name": "2025批次1"}
// 返回每个设备的 device_id 和明文 secret（仅此一次，需立即烧录到设备）
func (h *DeviceHandler) Provision(c *gin.Context) {
	if h.adminKey == "" || c.GetHeader("X-Admin-Key") != h.adminKey {
		c.JSON(http.StatusUnauthorized, model.ErrorResp(401, "无效的管理员密钥"))
		return
	}

	var req model.ProvisionDevicesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	devices, err := h.svc.Provision(c.Request.Context(), req.Count, strings.TrimSpace(req.Prefix), strings.TrimSpace(req.Name))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, err.Error()))
		return
	}

	c.JSON(http.StatusCreated, model.Success(gin.H{
		"count":   len(devices),
		"devices": devices,
		"notice":  "密钥仅此一次返回，请立即烧录到设备并妥善保管；后端仅存哈希，无法再次获取明文",
	}))
}

// Bind 用户扫码绑定设备
// POST /api/v1/devices/bind   (需用户JWT)
// Body: {"device_id": "SS2506A3F1B9C8D2", "name": "厨房秤"}
func (h *DeviceHandler) Bind(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req model.BindDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	dev, err := h.svc.Bind(c.Request.Context(), int(userID), strings.TrimSpace(req.DeviceID), strings.TrimSpace(req.Name))
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(dev.ToResponse()))
}

// Unbind 用户解绑设备
// POST /api/v1/devices/unbind   (需用户JWT)
// Body: {"device_id": "SS2506A3F1B9C8D2"}
func (h *DeviceHandler) Unbind(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req model.BindDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	if err := h.svc.Unbind(c.Request.Context(), int(userID), strings.TrimSpace(req.DeviceID)); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(gin.H{"message": "设备已解绑"}))
}

// ListMine 查看当前用户绑定的设备
// GET /api/v1/devices/mine   (需用户JWT)
func (h *DeviceHandler) ListMine(c *gin.Context) {
	userID := c.GetInt64("user_id")

	devices, err := h.svc.ListByUser(c.Request.Context(), int(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to list devices"))
		return
	}

	resp := make([]model.DeviceResponse, 0, len(devices))
	for _, d := range devices {
		resp = append(resp, d.ToResponse())
	}

	c.JSON(http.StatusOK, model.Success(resp))
}

// Revoke 吊销设备（后台，需 X-Admin-Key）
// POST /api/v1/admin/devices/revoke   Body: {"device_id": "..."}
func (h *DeviceHandler) Revoke(c *gin.Context) {
	if h.adminKey == "" || c.GetHeader("X-Admin-Key") != h.adminKey {
		c.JSON(http.StatusUnauthorized, model.ErrorResp(401, "无效的管理员密钥"))
		return
	}

	var req struct {
		DeviceID string `json:"device_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	if err := h.svc.Revoke(c.Request.Context(), strings.TrimSpace(req.DeviceID)); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(gin.H{"message": "设备已吊销"}))
}
