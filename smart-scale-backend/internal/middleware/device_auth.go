package middleware

import (
	"net/http"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// DeviceAuth 设备认证中间件
// 校验请求头 X-Device-Id + X-Device-Secret，通过后注入 user_id 和 device_id 到上下文。
// 用于嵌入式秤的数据上报接口，与用户 JWT 认证完全独立。
func DeviceAuth(deviceSvc *service.DeviceService) gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID := c.GetHeader("X-Device-Id")
		secret := c.GetHeader("X-Device-Secret")
		if deviceID == "" || secret == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized,
				model.ErrorResp(401, "缺少设备认证信息(需提供 X-Device-Id 和 X-Device-Secret 请求头)"))
			return
		}

		dev, err := deviceSvc.Authenticate(c.Request.Context(), deviceID, secret)
		if err != nil {
			logrus.WithError(err).WithField("device_id", deviceID).Warn("device auth failed")
			c.AbortWithStatusJSON(http.StatusUnauthorized, model.ErrorResp(401, err.Error()))
			return
		}

		// 注入绑定用户ID（后续 handler 复用与用户JWT相同的取值方式 c.GetInt64("user_id")）
		c.Set("user_id", int64(*dev.BoundUserID))
		c.Set("device_id", dev.DeviceID)
		c.Next()
	}
}
