package handler

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"time"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

type MealHandler struct {
	mealService *service.MealService
	photoService *service.PhotoRecognitionService
}

func NewMealHandler(mealService *service.MealService, photoService *service.PhotoRecognitionService) *MealHandler {
	return &MealHandler{mealService: mealService, photoService: photoService}
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

// RecordCookedWeighIn 熟食称重上报（App端直接录入成品菜）
// POST /api/v1/weigh-in/cooked
// Body: { dish_name, weight_g, created_at? }
func (h *MealHandler) RecordCookedWeighIn(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req model.CookedWeighInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	record, err := h.mealService.RecordCookedWeighIn(c.Request.Context(), int(userID), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusCreated, model.Success(record))
}

// ListDishes 列出所有熟菜菜名（前端菜名下拉用）
// GET /api/v1/dishes
func (h *MealHandler) ListDishes(c *gin.Context) {
	dishes, err := h.mealService.ListDishes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to list dishes"))
		return
	}
	c.JSON(http.StatusOK, model.Success(dishes))
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

	// 调试：记录 ESP32 原始请求体（读完需重新塞回以供后续绑定）
	raw, _ := io.ReadAll(c.Request.Body)
	c.Request.Body = io.NopCloser(bytes.NewBuffer(raw))
	logrus.Infof("[ESP32] user_id=%d raw body: %s", userID, string(raw))

	var req model.WeighInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logrus.Warnf("[ESP32] bind failed: %v", err)
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	record, err := h.mealService.RecordWeighIn(c.Request.Context(), int(userID), &req)
	if err != nil {
		logrus.Warnf("[ESP32] RecordWeighIn failed: %v, body=%s", err, string(raw))
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusCreated, model.Success(record))
}

// GetHistoryRecords 查询历史称重记录
// GET /api/v1/records?page=&page_size=&start_date=&end_date=&search=
func (h *MealHandler) GetHistoryRecords(c *gin.Context) {
	userID := c.GetInt64("user_id")

	query := model.RecordsQuery{
		Page:      1,
		PageSize:  20,
		StartDate: c.Query("start_date"),
		EndDate:   c.Query("end_date"),
		Search:    c.Query("search"),
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
		query.Search,
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

// UpdateWeighRecord 更新称重记录
// PUT /api/v1/records/:id
func (h *MealHandler) UpdateWeighRecord(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid record id"))
		return
	}

	var req model.WeighInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	if err := h.mealService.UpdateWeighRecord(c.Request.Context(), id, &req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(nil))
}

// DeleteWeighRecord 删除称重记录
// DELETE /api/v1/records/:id
func (h *MealHandler) DeleteWeighRecord(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid record id"))
		return
	}

	if err := h.mealService.DeleteWeighRecord(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(nil))
}

// BatchDeleteWeighRecords 批量删除称重记录
// DELETE /api/v1/records/batch
func (h *MealHandler) BatchDeleteWeighRecords(c *gin.Context) {
	var req struct {
		IDs []int64 `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "请求参数错误: ids 数组不能为空"))
		return
	}

	count, err := h.mealService.DeleteWeighRecordsBatch(c.Request.Context(), req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.SuccessWithMessage("批量删除成功", gin.H{"deleted": count}))
}

// RecognizeFoodPhoto 拍照识别食物（上传图片 → 多模态AI识别 → 返回食物+营养）
// POST /api/v1/weigh-in/photo  (multipart/form-data, field: "file", field: "mode"=ingredient|cooked)
func (h *MealHandler) RecognizeFoodPhoto(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "图片上传失败: "+err.Error()))
		return
	}

	// 限制 10MB
	if file.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "图片大小不能超过10MB"))
		return
	}

	// 读取识别模式：ingredient=生食材, cooked=成品菜（默认cooked）
	mode := c.PostForm("mode")
	if mode != "ingredient" {
		mode = "cooked"
	}

	// 读取图片字节
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "读取图片失败"))
		return
	}
	defer f.Close()

	imageBytes, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "读取图片失败"))
		return
	}

	// 获取 MIME 类型
	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "image/jpeg"
	}

	// 根据 mode 调用不同的识别服务
	var result *service.PhotoRecognitionResult
	if mode == "ingredient" {
		result, err = h.photoService.RecognizeIngredientsFromImage(imageBytes, mimeType)
	} else {
		result, err = h.photoService.RecognizeFoodFromImage(imageBytes, mimeType)
	}
	if err != nil {
		logrus.WithError(err).WithField("mode", mode).Warn("Photo recognition failed")
		c.JSON(http.StatusOK, model.ErrorResp(500, "图片识别失败: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(result))
}

// DeviceCookedRecognition 器件端正餐识别：接收图像 + 已知重量 → AI识别菜名 + 预测营养素
// 设备调用走 DeviceAuth 中间件自动注入 user_id；测试调用从 query 参数读取
// POST /api/v1/device/cooked-recognition（设备认证）
// POST /api/v1/weigh-in/cooked-recognition?user_id=20（免认证测试）
func (h *MealHandler) DeviceCookedRecognition(c *gin.Context) {
	// user_id 优先从 context（设备认证中件），否则从 query 参数取（测试模式）
	if c.GetInt64("user_id") == 0 {
		userID := int64(14)
		if uidStr := c.Query("user_id"); uidStr != "" {
			if uid, err := strconv.ParseInt(uidStr, 10, 64); err == nil && uid > 0 {
				userID = uid
			}
		}
		c.Set("user_id", userID)
		logrus.Infof("[Test] cooked-recognition user_id=%d (from query)", userID)
	}

	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "图片上传失败: "+err.Error()))
		return
	}

	weightStr := c.PostForm("weight_g")
	if weightStr == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "缺少 weight_g 参数"))
		return
	}
	weightG, err := strconv.ParseFloat(weightStr, 64)
	if err != nil || weightG <= 0 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "weight_g 参数无效"))
		return
	}

	if file.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "图片大小不能超过10MB"))
		return
	}

	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "读取图片失败"))
		return
	}
	defer f.Close()

	imageBytes, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "读取图片失败"))
		return
	}

	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "image/jpeg"
	}

	result, err := h.photoService.RecognizeCookedDishFromImage(imageBytes, mimeType, weightG)
	if err != nil {
		logrus.WithError(err).Warn("Device cooked recognition failed")
		c.JSON(http.StatusOK, model.ErrorResp(500, "正餐识别失败: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(result))
}
