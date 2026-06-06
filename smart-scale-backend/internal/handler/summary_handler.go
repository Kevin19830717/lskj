package handler

import (
	"net/http"
	"strconv"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type SummaryHandler struct {
	summarySvc *service.SummaryService
}

func NewSummaryHandler(summarySvc *service.SummaryService) *SummaryHandler {
	return &SummaryHandler{summarySvc: summarySvc}
}

// GenerateSummary 手动生成营养摘要
// POST /api/v1/summaries/generate?type=weekly|daily|monthly|yearly
func (h *SummaryHandler) GenerateSummary(c *gin.Context) {
	userID := c.GetInt64("user_id")

	summaryType := c.DefaultQuery("type", "weekly")
	validTypes := map[string]bool{"daily": true, "weekly": true, "monthly": true, "yearly": true}
	if !validTypes[summaryType] {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid type. Must be one of: daily, weekly, monthly, yearly"))
		return
	}

	summary, err := h.summarySvc.GenerateSummary(c.Request.Context(), int(userID), summaryType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to generate summary: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(summary))
}

// GetSummaries 查看摘要列表
// GET /api/v1/summaries?type=weekly&limit=
func (h *SummaryHandler) GetSummaries(c *gin.Context) {
	userID := c.GetInt64("user_id")

	summaryType := c.DefaultQuery("type", "weekly")
	limit := 20
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	summaries, err := h.summarySvc.GetSummaries(c.Request.Context(), int(userID), summaryType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get summaries: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(summaries))
}
