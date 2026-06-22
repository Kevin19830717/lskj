package handler

import (
	"net/http"
	"strconv"
	"time"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type MealHandler struct {
	mealService *service.MealService
}

func NewMealHandler(mealService *service.MealService) *MealHandler {
	return &MealHandler{mealService: mealService}
}

// RecordWeighIn 上报称重数据（嵌入式端调用）
// POST /api/v1/weigh-in
func (h *MealHandler) RecordWeighIn(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req model.WeighInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	record, err := h.mealService.RecordWeighIn(c.Request.Context(), int(userID), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusCreated, model.Success(record))
}

// RecordWeighInTest 测试用称重数据上报接口（免JWT认证，仅供嵌入式端联调测试）
// POST /api/v1/test/weigh-in?user_id=1
// 复用正式接口的 WeighInRequest 结构与业务逻辑，user_id 通过 query 参数指定，默认为 1。
// 注意：该接口无身份校验，仅应在开发/测试环境使用，切勿暴露到生产环境。
func (h *MealHandler) RecordWeighInTest(c *gin.Context) {
	// 测试接口：user_id 从 query 读取，默认 1（需为库中已存在的用户）
	userID := int64(1)
	if uidStr := c.Query("user_id"); uidStr != "" {
		if uid, err := strconv.ParseInt(uidStr, 10, 64); err == nil && uid > 0 {
			userID = uid
		}
	}

	var req model.WeighInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	record, err := h.mealService.RecordWeighIn(c.Request.Context(), int(userID), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusCreated, model.Success(record))
}

// GetHistoryRecords 查询历史称重记录
// GET /api/v1/records?page=&page_size=&start_date=&end_date=
func (h *MealHandler) GetHistoryRecords(c *gin.Context) {
	userID := c.GetInt64("user_id")

	query := model.RecordsQuery{
		Page:      1,
		PageSize:  20,
		StartDate: c.Query("start_date"),
		EndDate:   c.Query("end_date"),
	}

	if pageStr := c.DefaultQuery("page", "1"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			query.Page = p
		}
	}
	if sizeStr := c.DefaultQuery("page_size", "20"); sizeStr != "" {
		if s, err := strconv.Atoi(sizeStr); err == nil && s > 0 && s <= 100 {
			query.PageSize = s
		}
	}

	result, err := h.mealService.GetHistoryRecords(
		c.Request.Context(),
		int(userID),
		query.Page,
		query.PageSize,
		query.StartDate,
		query.EndDate,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to query records"))
		return
	}

	c.JSON(http.StatusOK, model.Success(result))
}

// GetDailySummary 获取单日营养摘要
// GET /api/v1/daily-summary?date=YYYY-MM-DD
func (h *MealHandler) GetDailySummary(c *gin.Context) {
	userID := c.GetInt64("user_id")
	dateStr := c.Query("date")
	if dateStr == "" {
		dateStr = "now" // 默认今天
	}

	// 解析日期
	// TODO: 根据dateStr解析为time.Time对象
	// 这里使用当前日期作为示例

	result, err := h.mealService.GetDailySummary(c.Request.Context(), int(userID), time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get daily summary"))
		return
	}

	c.JSON(http.StatusOK, model.Success(result))
}
