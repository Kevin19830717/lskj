package handler

import (
	"math"
	"net/http"
	"strconv"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type DashboardHandler struct {
	mealService   *service.MealService
	userService   *service.UserService
	foodService   *service.FoodService
	ragSvc        *service.RAGService
}

func NewDashboardHandler(mealSvc *service.MealService, userSvc *service.UserService, foodSvc *service.FoodService, ragSvc *service.RAGService) *DashboardHandler {
	return &DashboardHandler{
		mealService: mealSvc,
		userService: userSvc,
		foodService: foodSvc,
		ragSvc:      ragSvc,
	}
}

// GetStats 获取仪表盘统计概览
// GET /api/v1/dashboard/stats
func (h *DashboardHandler) GetStats(c *gin.Context) {
	userID := c.GetInt64("user_id")
	ctx := c.Request.Context()
	days := 7

	// 并行获取各维度数据
	type result struct {
		totalMeals    int64
		trend         []model.TrendPoint
		topFoods      []model.FoodFrequency
		latestAdvice  *model.HealthAdvice
		healthScore   int
		err           error
	}

	res := make(chan result, 1)
	go func() {
		var r result
		// TODO: implement stats via service layer
		r.totalMeals = 0
		r.topFoods, _ = h.foodService.GetTopFoods(ctx, int(userID), days, 10)
		r.latestAdvice, _ = h.ragSvc.GetLatestAdvice(ctx, int(userID), "weekly")
		r.healthScore, _ = h.userService.GetHealthScore(ctx, int(userID))
		res <- r
	}()

	r := <-res
	if r.err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to load dashboard stats"))
		return
	}

	// 计算平均日热量
	var avgEnergy float64
	for _, t := range r.trend {
		avgEnergy += t.Value
	}
	if len(r.trend) > 0 {
		avgEnergy = avgEnergy / float64(len(r.trend))
	}

	stats := model.DashboardStats{
		PeriodDays:     days,
		TotalMeals:     r.totalMeals,
		AvgDailyEnergy: math.Round(avgEnergy*100) / 100,
		EnergyTrend:     r.trend,
		TopFoods:       r.topFoods,
		LatestAdvice:   r.latestAdvice,
	}

	// 计算营养分布（从最近记录中汇总）
	if len(r.topFoods) > 0 {
		records, _ := h.mealService.GetRecentMeals(ctx, int(userID), min(50, days*5))
		var totalP, totalF, totalC float64
		for _, rec := range records {
			if rec.CookedProteinG != nil {
				totalP += *rec.CookedProteinG
			}
			if rec.CookedFatG != nil {
				totalF += *rec.CookedFatG
			}
			if rec.CookedCarbohydrateG != nil {
				totalC += *rec.CookedCarbohydrateG
			}
		}
		totalMacro := totalP + totalF + totalC
		if totalMacro > 0 {
			stats.NutrientDistribution = model.NutrientDist{
				ProteinPct: math.Round(totalP/totalMacro*10000) / 100,
				FatPct:     math.Round(totalF/totalMacro*10000) / 100,
				CarbPct:    math.Round(totalC/totalMacro*10000) / 100,
			}
		}
	}

	c.JSON(http.StatusOK, model.Success(stats))
}

// GetRecentMeals 获取最近餐食
// GET /api/v1/dashboard/recent-meals
func (h *DashboardHandler) GetRecentMeals(c *gin.Context) {
	userID := c.GetInt64("user_id")

	limit := 10
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "10")); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	meals, err := h.mealService.GetRecentMeals(c.Request.Context(), int(userID), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get recent meals"))
		return
	}
	c.JSON(http.StatusOK, model.Success(meals))
}
