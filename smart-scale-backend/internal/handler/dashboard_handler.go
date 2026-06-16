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

	// 计算营养分布及均值：取最近有数据的N天（不要求一定是近N个日历日）
	records, _ := h.mealService.GetRecentMeals(ctx, int(userID), min(days*5, 50))
	// dayTotals: key=日期字符串(YYYY-MM-DD), value=当日各营养素汇总
	type dayNutrients struct {
		Energy, Protein, Fat, Carb float64
	}
	dayTotals := make(map[string]*dayNutrients)
	for _, rec := range records {
		dateStr := rec.CreatedAt.Format("2006-01-02")
		dn := dayTotals[dateStr]
		if dn == nil {
			dn = &dayNutrients{}
			dayTotals[dateStr] = dn
		}
		if rec.CookedEnergyKcal != nil {
			dn.Energy += *rec.CookedEnergyKcal
		}
		if rec.CookedProteinG != nil {
			dn.Protein += *rec.CookedProteinG
		}
		if rec.CookedFatG != nil {
			dn.Fat += *rec.CookedFatG
		}
		if rec.CookedCarbohydrateG != nil {
			dn.Carb += *rec.CookedCarbohydrateG
		}
	}

	// 只取最近N个有数据的天
	actualDayCount := len(dayTotals)
	if actualDayCount > days {
		// 按日期排序，只保留最近days天
		type kv struct {
			date string
			dn   *dayNutrients
		}
		var sorted []kv
		for d, dn := range dayTotals {
			sorted = append(sorted, kv{d, dn})
		}
		// 简单按日期降序排序
		for i := 0; i < len(sorted); i++ {
			for j := i + 1; j < len(sorted); j++ {
				if sorted[j].date > sorted[i].date {
					sorted[i], sorted[j] = sorted[j], sorted[i]
				}
			}
		}
		// 重建 dayTotals，只保留前 days 天
		dayTotals = make(map[string]*dayNutrients)
		for i := 0; i < days && i < len(sorted); i++ {
			dayTotals[sorted[i].date] = sorted[i].dn
		}
		actualDayCount = len(dayTotals)
	}
	var sumEnergy, sumP, sumF, sumC float64
	if actualDayCount > 0 {
		for _, dn := range dayTotals {
			sumEnergy += dn.Energy
			sumP += dn.Protein
			sumF += dn.Fat
			sumC += dn.Carb
		}
		stats.AvgDailyEnergy = math.Round(sumEnergy/float64(actualDayCount)*100) / 100
		stats.TotalProtein = math.Round(sumP/float64(actualDayCount)*10) / 10
		stats.TotalFat = math.Round(sumF/float64(actualDayCount)*10) / 10
		stats.TotalCarb = math.Round(sumC/float64(actualDayCount)*10) / 10
	}
	totalMacro := sumP + sumF + sumC
	if totalMacro > 0 {
		stats.NutrientDistribution = model.NutrientDist{
			ProteinPct: math.Round(sumP/totalMacro*10000) / 100,
			FatPct:     math.Round(sumF/totalMacro*10000) / 100,
			CarbPct:    math.Round(sumC/totalMacro*10000) / 100,
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
