package handler

import (
	"net/http"
	"strconv"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

type HealthAdviceHandler struct {
	ragSvc *service.RAGService
}

func NewHealthAdviceHandler(ragSvc *service.RAGService) *HealthAdviceHandler {
	return &HealthAdviceHandler{ragSvc: ragSvc}
}

// GenerateAdvice 生成AI健康建议（RAG）
// POST /api/v1/health-advice/generate
func (h *HealthAdviceHandler) GenerateAdvice(c *gin.Context) {
	userID := c.GetInt64("user_id")

	adviceType := c.DefaultQuery("type", "week")
	switch adviceType {
	case "weekly", "w":
		adviceType = "weekly"
	case "monthly", "m":
		adviceType = "monthly"
	case "long_term", "lt":
		adviceType = "long_term"
	default:
		adviceType = "weekly"
	}

	weekDateStr := c.Query("week_date")

	// 异步生成建议（可能需要较长时间）
	go func() {
		_, genErr := h.ragSvc.GenerateAdvice(c.Request.Context(), int(userID), adviceType, weekDateStr)
		if genErr != nil {
			logrus.WithError(genErr).Errorf("Failed to generate %s advice for user %d", adviceType, userID)
		}
	}()

	c.JSON(http.StatusAccepted, model.SuccessWithMessage(
		"Advice generation started. Please check back shortly.",
		map[string]string{"status": "processing", "type": adviceType},
	))
}

// GetLatestAdvice 获取最新建议
// GET /api/v1/health-advice/latest?type=weekly
func (h *HealthAdviceHandler) GetLatestAdvice(c *gin.Context) {
	userID := c.GetInt64("user_id")

	adviceType := c.DefaultQuery("type", "weekly")

	advice, err := h.ragSvc.GetLatestAdvice(c.Request.Context(), int(userID), adviceType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get latest advice: "+err.Error()))
		return
	}
	if advice == nil {
		c.JSON(http.StatusOK, model.SuccessWithMessage("No advice found for this type", nil))
		return
	}

	c.JSON(http.StatusOK, model.Success(advice))
}

// ListAdvices 获取建议列表
// GET /api/v1/health-advice?limit=
func (h *HealthAdviceHandler) ListAdvices(c *gin.Context) {
	userID := c.GetInt64("user_id")
	limit := 10
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "10")); err == nil && l > 0 {
		limit = l
	}

	// TODO: implement advice listing via RAG service
	c.JSON(http.StatusOK, model.SuccessWithMessage("Advice listing not yet implemented", map[string]interface{}{
		"user_id": userID,
		"limit":   limit,
	}))
}
