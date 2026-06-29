package service

import (
	"context"
	"fmt"
	"time"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/repository"

	"github.com/sirupsen/logrus"
)

type MealService struct {
	mealRepo *repository.MealRepository
	foodRepo *repository.FoodRepository
}

func NewMealService(mealRepo *repository.MealRepository, foodRepo *repository.FoodRepository) *MealService {
	return &MealService{mealRepo: mealRepo, foodRepo: foodRepo}
}

// RecordWeighIn 上报称重数据（嵌入式端已计算好烹饪后营养值，直接存库）
func (s *MealService) RecordWeighIn(ctx context.Context, userID int, req *model.WeighInRequest) (*model.WeighRecord, error) {
	if len(req.Ingredients) != len(req.RawWeightsG) {
		return nil, fmt.Errorf("ingredients and raw_weights_g length mismatch: got %d vs %d",
			len(req.Ingredients), len(req.RawWeightsG))
	}

	v := func(f float64) *float64 { return &f }

	record := &model.WeighRecord{
		UserID:            userID,
		Ingredients:       req.Ingredients,
		RawWeightsG:       req.RawWeightsG,
		CookingMethod:     req.CookingMethod,
		CookedWeightG:     v(req.CookedWeightG),
		CookedEnergyKcal:  v(req.CookedEnergyKcal),
		CookedProteinG:    v(req.CookedProteinG),
		CookedFatG:        v(req.CookedFatG),
		CookedCarbohydrateG: v(req.CookedCarbohydrateG),
		CookedSodiumMg:    v(req.CookedSodiumMg),
		CookedCholesterolMg: v(req.CookedCholesterolMg),
		CookedVitaminCMg:  v(req.CookedVitaminCMg),
		CookedCalciumMg:   v(req.CookedCalciumMg),
		CookedIronMg:      v(req.CookedIronMg),
		CookedPotassiumMg: v(req.CookedPotassiumMg),
		CreatedAt:         time.Now(),
	}

	if err := s.mealRepo.CreateWeighRecord(ctx, record); err != nil {
		return nil, fmt.Errorf("failed to save weigh record: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"user_id":    userID,
		"ingredients": record.Ingredients,
		"energy":      record.CookedEnergyKcal,
	}).Info("Weigh-in recorded successfully")

	return record, nil
}

// GetHistoryRecords 获取历史记录（分页）
func (s *MealService) GetHistoryRecords(ctx context.Context, userID int, page, pageSize int, startDate, endDate string) (*model.PaginatedRecords, error) {
	records, total, err := s.mealRepo.QueryWeighRecords(ctx, userID, page, pageSize, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to query records: %w", err)
	}

	// 获取中文名称映射
	nameMapping, err := s.foodRepo.GetAllNameMappings(ctx)
	if err != nil {
		logrus.Warnf("Failed to get food name mappings: %v", err)
		nameMapping = make(map[string]string)
	}

	// 转换为响应格式
	responses := make([]model.WeighRecordResponse, 0)
	for _, rec := range records {
		resp := model.WeighRecordResponse{
			ID:                rec.ID,
			UserID:            rec.UserID,
			Ingredients:       rec.Ingredients,
			RawWeightsG:       rec.RawWeightsG,
			CookingMethod:     rec.CookingMethod,
			CookedWeightG:     rec.CookedWeightG,
			CookedEnergyKcal:  rec.CookedEnergyKcal,
			CookedProteinG:    rec.CookedProteinG,
			CookedFatG:        rec.CookedFatG,
			CookedCarbohydrateG: rec.CookedCarbohydrateG,
			CookedSodiumMg:    rec.CookedSodiumMg,
			CookedCholesterolMg: rec.CookedCholesterolMg,
			CookedVitaminCMg:  rec.CookedVitaminCMg,
			CookedCalciumMg:   rec.CookedCalciumMg,
			CookedIronMg:      rec.CookedIronMg,
			CookedPotassiumMg: rec.CookedPotassiumMg,
			CreatedAt:         rec.CreatedAt,
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

	totalPages := int(total) / pageSize
	if int(total)%pageSize > 0 {
		totalPages++
	}

	return &model.PaginatedRecords{
		Items:      responses,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}

// GetDailySummary 获取单日营养摘要
func (s *MealService) GetDailySummary(ctx context.Context, userID int, date time.Time) (*model.NutritionSummary, error) {
	return s.mealRepo.GetDailyStats(ctx, userID, date)
}

// GetRecentMeals 获取最近餐食
func (s *MealService) GetRecentMeals(ctx context.Context, userID int, limit int) ([]*model.WeighRecord, error) {
	return s.mealRepo.GetRecentMeals(ctx, userID, limit)
}

// GetCompanionStats 获取智能秤陪伴记录统计
func (s *MealService) GetCompanionStats(ctx context.Context, userID int) (map[string]interface{}, error) {
	return s.mealRepo.GetCompanionStats(ctx, userID)
}

// GetMealsInDays 获取最近N天有数据的餐食记录
// 以用户最后一条记录的日期为结束日，往前查询足够范围确保包含N个有数据的天
func (s *MealService) GetMealsInDays(ctx context.Context, userID int, days int) ([]*model.WeighRecord, error) {
	// 获取用户最后一条记录的时间
	lastActivity, err := s.mealRepo.GetLastActivity(ctx, userID)
	if err != nil || lastActivity.IsZero() {
		// 无记录时回退到当前时间
		start := time.Now().AddDate(0, 0, -days)
		end := time.Now().AddDate(0, 0, 1)
		return s.mealRepo.QueryRecordsByDateRange(ctx, userID, start, end)
	}
	// 以最后记录日为结束日，往前查 days*4 天作为缓冲（确保有足够有数据的天）
	end := lastActivity.AddDate(0, 0, 1) // +1天包含最后记录日全天
	start := lastActivity.AddDate(0, 0, -(days * 4))
	return s.mealRepo.QueryRecordsByDateRange(ctx, userID, start, end)
}

// UpdateWeighRecord 更新称重记录
func (s *MealService) UpdateWeighRecord(ctx context.Context, id int64, req *model.WeighInRequest) error {
	if len(req.Ingredients) != len(req.RawWeightsG) {
		return fmt.Errorf("ingredients and raw_weights_g length mismatch")
	}

	v := func(f float64) *float64 { return &f }
	record := &model.WeighRecord{
		Ingredients:         req.Ingredients,
		RawWeightsG:         req.RawWeightsG,
		CookingMethod:       req.CookingMethod,
		CookedWeightG:       v(req.CookedWeightG),
		CookedEnergyKcal:    v(req.CookedEnergyKcal),
		CookedProteinG:      v(req.CookedProteinG),
		CookedFatG:          v(req.CookedFatG),
		CookedCarbohydrateG: v(req.CookedCarbohydrateG),
		CookedSodiumMg:      v(req.CookedSodiumMg),
		CookedCholesterolMg: v(req.CookedCholesterolMg),
		CookedVitaminCMg:    v(req.CookedVitaminCMg),
		CookedCalciumMg:     v(req.CookedCalciumMg),
		CookedIronMg:        v(req.CookedIronMg),
		CookedPotassiumMg:   v(req.CookedPotassiumMg),
	}
	var newTime *time.Time
	if req.CreatedAt != "" {
		// 先尝试 ISO 8601 / RFC3339，再尝试 datetime-local 格式
		if t, err := time.Parse(time.RFC3339, req.CreatedAt); err == nil {
			newTime = &t
		} else if t, err := time.Parse("2006-01-02T15:04", req.CreatedAt); err == nil {
			// datetime-local 无时区，按本地时间(UTC+8)解析
			loc := time.FixedZone("CST", 8*3600)
			tt := t.In(loc)
			newTime = &tt
		}
	}
	return s.mealRepo.UpdateWeighRecord(ctx, id, record, newTime)
}

// DeleteWeighRecord 删除称重记录
func (s *MealService) DeleteWeighRecord(ctx context.Context, id int64) error {
	return s.mealRepo.DeleteWeighRecord(ctx, id)
}
