package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// Logger 日志中间件
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		startTime := time.Now()

		c.Next()

		latency := time.Since(startTime)
		statusCode := c.Writer.Status()

		logEntry := logrus.WithFields(logrus.Fields{
			"method":     c.Request.Method,
			"path":       c.Request.URL.Path,
			"status":     statusCode,
			"latency":    latency.String(),
			"client_ip":  c.ClientIP(),
			"user_agent": c.Request.UserAgent(),
		})

		if statusCode >= 500 {
			logEntry.Error("Server error")
		} else if statusCode >= 400 {
			logEntry.Warn("Client error")
		} else {
			logEntry.Info("Request completed")
		}
	}
}
