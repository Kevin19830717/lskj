package handler

import (
	"net/http"
	"strconv"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type FoodHandler struct {
	foodService *service.FoodService
}

func NewFoodHandler(foodService *service.FoodService) *FoodHandler {
	return &FoodHandler{foodService: foodService}
}

// AddFood 添加食物
// POST /api/v1/foods
func (h *FoodHandler) AddFood(c *gin.Context) {
	var req model.CreateFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	food, err := h.foodService.AddFood(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to add food: "+err.Error()))
		return
	}

	c.JSON(http.StatusCreated, model.Success(food))
}

// SearchFoods 搜索食物
// GET /api/v1/foods/search?query=
func (h *FoodHandler) SearchFoods(c *gin.Context) {
	queryStr := c.Query("query")
	if queryStr == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "query parameter is required"))
		return
	}

	limit := 20
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
			limit = l
		}
	}

	foods, err := h.foodService.SearchFoods(c.Request.Context(), queryStr, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Search failed"))
		return
	}

	c.JSON(http.StatusOK, model.Success(model.FoodSearchResult{Items: foods, Total: int64(len(foods))}))
}

// ListFoods 列出所有食物 / 或通过?id=获取单个详情
// GET /api/v1/foods
// GET /api/v1/foods?id=5  (获取单个食物详情)
func (h *FoodHandler) ListFoods(c *gin.Context) {
	// 如果有 id 参数，返回单个食物详情
	if idStr := c.Query("id"); idStr != "" {
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid food ID"))
			return
		}
		food, err := h.foodService.GetFoodByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.ErrorResp(500, err.Error()))
			return
		}
		if food == nil {
			c.JSON(http.StatusNotFound, model.ErrorResp(404, "Food not found"))
			return
		}
		c.JSON(http.StatusOK, model.Success(food))
		return
	}

	// 正常分页列表
	page := 1
	pageSize := 20

	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 && v <= 100 {
			pageSize = v
		}
	}

	result, err := h.foodService.ListFoods(c.Request.Context(), page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to list foods"))
		return
	}

	c.JSON(http.StatusOK, model.Success(result))
}

// GetFoodByID 通过ID获取食物详情
// GET /api/v1/foods/detail?id=xxx
func (h *FoodHandler) GetFoodByID(c *gin.Context) {
	idStr := c.Query("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "id parameter is required"))
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid food ID"))
		return
	}

	food, err := h.foodService.GetFoodByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, err.Error()))
		return
	}
	if food == nil {
		c.JSON(http.StatusNotFound, model.ErrorResp(404, "Food not found"))
		return
	}

	c.JSON(http.StatusOK, model.Success(food))
}
