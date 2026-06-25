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

// GetSummaries 查看摘要列表（支持分页：?type=daily&page=1&page_size=10）
// GET /api/v1/summaries?type=weekly&limit=  (兼容旧版)
func (h *SummaryHandler) GetSummaries(c *gin.Context) {
	userID := c.GetInt64("user_id")
	summaryType := c.DefaultQuery("type", "weekly")

	// 新版分页参数
	if pageStr := c.Query("page"); pageStr != "" {
		page, _ := strconv.Atoi(pageStr)
		pageSize := 10
		if ps := c.Query("page_size"); ps != "" {
			if p, err := strconv.Atoi(ps); err == nil && p > 0 {
				pageSize = p
			}
		}
		items, total, err := h.summarySvc.GetSummariesPaged(c.Request.Context(), int(userID), summaryType, page, pageSize)
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get summaries: "+err.Error()))
			return
		}
		totalPages := (int(total) + pageSize - 1) / pageSize
		c.JSON(http.StatusOK, model.Success(map[string]interface{}{
			"items":       items,
			"total":       total,
			"page":        page,
			"page_size":   pageSize,
			"total_pages": totalPages,
		}))
		return
	}

	// 兼容旧版（不带分页参数）
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

// DeleteAllSummaries 清除当前用户全部报告（测试用）
// DELETE /api/v1/summaries
func (h *SummaryHandler) DeleteAllSummaries(c *gin.Context) {
	userID := c.GetInt64("user_id")
	count, err := h.summarySvc.DeleteAllSummaries(c.Request.Context(), int(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, model.SuccessWithMessage("已清除", gin.H{"deleted": count}))
}

// DeleteSummary 删除指定摘要
// DELETE /api/v1/summaries/:id
func (h *SummaryHandler) DeleteSummary(c *gin.Context) {
	userID := c.GetInt64("user_id")
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid summary id"))
		return
	}

	if err := h.summarySvc.DeleteSummary(c.Request.Context(), int(userID), id); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to delete summary: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.SuccessWithMessage("删除成功", nil))
}

// UpdateSummary 更新指定摘要的 insights
// PUT /api/v1/summaries/:id
func (h *SummaryHandler) UpdateSummary(c *gin.Context) {
	userID := c.GetInt64("user_id")
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid summary id"))
		return
	}

	var body struct {
		Insights map[string]interface{} `json:"insights"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Insights == nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "请提供 insights 字段"))
		return
	}

	if err := h.summarySvc.UpdateSummary(c.Request.Context(), int(userID), id, body.Insights); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to update summary: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.SuccessWithMessage("更新成功", nil))
}

// IncrementalBackfill 增量生成报告（日报15+周报5+月报3+年报1）
// POST /api/v1/summaries/incremental-backfill
func (h *SummaryHandler) IncrementalBackfill(c *gin.Context) {
	userID := c.GetInt64("user_id")

	result, err := h.summarySvc.IncrementalBackfill(c.Request.Context(), int(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(result))
}
