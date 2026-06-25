package handler

import (
	"math"
	"net/http"
	"sort"
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
// GET /api/v1/dashboard/stats?days=7
func (h *DashboardHandler) GetStats(c *gin.Context) {
	userID := c.GetInt64("user_id")
	ctx := c.Request.Context()
	days := 7
	if d, err := strconv.Atoi(c.DefaultQuery("days", "7")); err == nil && d > 0 && d <= 365 {
		days = d
	}

	// 获取指定时间范围内的所有餐食记录
	records, err := h.mealService.GetMealsInDays(ctx, int(userID), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to load meal records"))
		return
	}

	// 按日期聚合营养数据
	type dayNutrients struct {
		Energy, Protein, Fat, Carb float64
		MealCount                  int
	}
	dayTotals := make(map[string]*dayNutrients)
	for _, rec := range records {
		dateStr := rec.CreatedAt.Format("2006-01-02")
		dn := dayTotals[dateStr]
		if dn == nil {
			dn = &dayNutrients{}
			dayTotals[dateStr] = dn
		}
		dn.MealCount++
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

	// 排序日期（升序）
	dates := make([]string, 0, len(dayTotals))
	for d := range dayTotals {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	// 只保留最近 N 个有数据的日期（跳过没有记录的天，补齐到 N 天）
	if len(dates) > days {
		validDates := make(map[string]bool)
		for _, d := range dates[len(dates)-days:] {
			validDates[d] = true
		}
		for d := range dayTotals {
			if !validDates[d] {
				delete(dayTotals, d)
			}
		}
		dates = dates[len(dates)-days:]
	}

	// 构建趋势数据（按日期升序排列）
	var trend []model.TrendPoint
	for _, d := range dates {
		trend = append(trend, model.TrendPoint{
			Date:  d,
			Value: math.Round(dayTotals[d].Energy*100) / 100,
		})
	}

	// 计算总餐数（只统计有效日期内的记录）
	totalMeals := int64(0)

	// 计算日均营养素
	actualDayCount := len(dayTotals)
	var sumEnergy, sumP, sumF, sumC float64
	for _, dn := range dayTotals {
		totalMeals += int64(dn.MealCount)
		sumEnergy += dn.Energy
		sumP += dn.Protein
		sumF += dn.Fat
		sumC += dn.Carb
	}

	var avgDailyEnergy, avgProtein, avgFat, avgCarb float64
	if actualDayCount > 0 {
		avgDailyEnergy = math.Round(sumEnergy/float64(actualDayCount)*100) / 100
		avgProtein = math.Round(sumP/float64(actualDayCount)*10) / 10
		avgFat = math.Round(sumF/float64(actualDayCount)*10) / 10
		avgCarb = math.Round(sumC/float64(actualDayCount)*10) / 10
	}

	// 营养素分布占比
	totalMacro := sumP + sumF + sumC
	nutrientDist := model.NutrientDist{}
	if totalMacro > 0 {
		nutrientDist = model.NutrientDist{
			ProteinPct: math.Round(sumP/totalMacro*10000) / 100,
			FatPct:     math.Round(sumF/totalMacro*10000) / 100,
			CarbPct:    math.Round(sumC/totalMacro*10000) / 100,
		}
	}

	// 常吃食物排行
	topFoods, _ := h.foodService.GetTopFoods(ctx, int(userID), days, 10)

	stats := model.DashboardStats{
		PeriodDays:           days,
		TotalMeals:           totalMeals,
		AvgDailyEnergy:       avgDailyEnergy,
		TotalProtein:         avgProtein,
		TotalFat:             avgFat,
		TotalCarb:            avgCarb,
		EnergyTrend:          trend,
		TopFoods:             topFoods,
		NutrientDistribution: nutrientDist,
	}

	c.JSON(http.StatusOK, model.Success(stats))
}

// GetCompanionStats 获取智能秤陪伴记录统计
// GET /api/v1/dashboard/companion
func (h *DashboardHandler) GetCompanionStats(c *gin.Context) {
	userID := c.GetInt64("user_id")
	ctx := c.Request.Context()

	stats, err := h.mealService.GetCompanionStats(ctx, int(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to load companion stats"))
		return
	}

	// 烹饪方式中文标签
	if method, ok := stats["favorite_method"].(string); ok {
		if label, ok := model.CookingMethodLabels[model.CookingMethod(method)]; ok {
			stats["favorite_method_label"] = label
		} else {
			stats["favorite_method_label"] = method
		}
	}

	c.JSON(http.StatusOK, model.Success(stats))
}

// GetRecentMeals 获取最近餐食
// GET /api/v1/dashboard/recent-meals?days=7&limit=5
func (h *DashboardHandler) GetRecentMeals(c *gin.Context) {
	userID := c.GetInt64("user_id")
	ctx := c.Request.Context()

	days := 7
	if d, err := strconv.Atoi(c.DefaultQuery("days", "7")); err == nil && d > 0 && d <= 365 {
		days = d
	}

	limit := 5
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "5")); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	// 获取指定天数内的所有记录，然后截取 limit 条
	records, err := h.mealService.GetMealsInDays(ctx, int(userID), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to get recent meals"))
		return
	}

	// 获取中文名称映射
	nameMapping, _ := h.foodService.GetAllNameMappings(ctx)

	// records 按 created_at DESC 排序（QueryRecordsByDateRange 返回 ASC，需反转）
	// 取最近 limit 条
	if len(records) > limit {
		records = records[len(records)-limit:]
	}
	// 反转使最近的在前
	for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
		records[i], records[j] = records[j], records[i]
	}

	// 构建响应（包含 ingredient_names 和 cooking_method_label）
	responses := make([]model.WeighRecordResponse, 0, len(records))
	for _, rec := range records {
		resp := model.WeighRecordResponse{
			ID:                  rec.ID,
			UserID:              rec.UserID,
			Ingredients:         rec.Ingredients,
			RawWeightsG:         rec.RawWeightsG,
			CookingMethod:       rec.CookingMethod,
			CookedWeightG:       rec.CookedWeightG,
			CookedEnergyKcal:    rec.CookedEnergyKcal,
			CookedProteinG:      rec.CookedProteinG,
			CookedFatG:          rec.CookedFatG,
			CookedCarbohydrateG: rec.CookedCarbohydrateG,
			CookedSodiumMg:      rec.CookedSodiumMg,
			CookedCholesterolMg: rec.CookedCholesterolMg,
			CookedVitaminCMg:    rec.CookedVitaminCMg,
			CookedCalciumMg:     rec.CookedCalciumMg,
			CookedIronMg:        rec.CookedIronMg,
			CookedPotassiumMg:   rec.CookedPotassiumMg,
			CreatedAt:           rec.CreatedAt,
		}

		// 中文名
		for _, ing := range rec.Ingredients {
			if zhName, ok := nameMapping[ing]; ok {
				resp.IngredientNames = append(resp.IngredientNames, zhName)
			} else {
				resp.IngredientNames = append(resp.IngredientNames, ing)
			}
		}

		// 烹饪方式中文标签
		if label, ok := model.CookingMethodLabels[model.CookingMethod(rec.CookingMethod)]; ok {
			resp.CookingMethodLabel = label
		}

		responses = append(responses, resp)
	}

	c.JSON(http.StatusOK, model.Success(responses))
}
