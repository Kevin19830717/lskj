package middleware

import (
	"net/http"
	"strings"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// JWTAuth JWT认证中间件
func JWTAuth(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, model.ErrorResp(401, "Missing authorization header"))
			return
		}

		// 支持 Bearer token 格式
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, model.ErrorResp(401, "Invalid authorization header format"))
			return
		}

		tokenString := parts[1]
		userID, err := authService.ValidateToken(tokenString)
		if err != nil {
			logrus.WithError(err).Warn("JWT validation failed")
			c.AbortWithStatusJSON(http.StatusUnauthorized, model.ErrorResp(401, "Invalid or expired token"))
			return
		}

		// 将用户ID存入上下文，供后续handler使用
		c.Set("user_id", userID)
		c.Next()
	}
}
