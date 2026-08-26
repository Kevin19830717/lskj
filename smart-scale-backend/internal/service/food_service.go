package service

import (
	"context"
	"fmt"

	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/repository"
)

type FoodService struct {
	foodRepo *repository.FoodRepository
}

func NewFoodService(foodRepo *repository.FoodRepository) *FoodService {
	return &FoodService{foodRepo: foodRepo}
}

// AddFood 添加食物
func (s *FoodService) AddFood(ctx context.Context, req *model.CreateFoodRequest) (*model.Food, error) {
	food := &model.Food{
		Name:            req.Name,
		NameEn:          req.NameEn,
		Category:        req.Category,
		EdibleRatio:     req.EdibleRatio,
		EnergyKcal:      req.EnergyKcal,
		ProteinG:        req.ProteinG,
		FatG:            req.FatG,
		CarbohydrateG:   req.CarbohydrateG,
		SodiumMg:        req.SodiumMg,
		CholesterolMg:   req.CholesterolMg,
		VitaminCMg:      req.VitaminCMg,
		CalciumMg:       req.CalciumMg,
		IronMg:          req.IronMg,
		PotassiumMg:     req.PotassiumMg,
	}

	if err := s.foodRepo.Create(ctx, food); err != nil {
		return nil, fmt.Errorf("failed to add food: %w", err)
	}
	return food, nil
}

// SearchFoods 搜索食物
func (s *FoodService) SearchFoods(ctx context.Context, query string, limit int) ([]*model.Food, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	return s.foodRepo.Search(ctx, query, limit)
}

// ListFoods 列出所有食物（分页）
func (s *FoodService) ListFoods(ctx context.Context, page, pageSize int) (*model.FoodSearchResult, error) {
	offset := (page - 1) * pageSize
	foods, total, err := s.foodRepo.List(ctx, offset, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list foods: %w", err)
	}
	return &model.FoodSearchResult{Items: foods, Total: total}, nil
}

// GetFoodByID 通过ID获取食物详情
func (s *FoodService) GetFoodByID(ctx context.Context, id int64) (*model.Food, error) {
	food, err := s.foodRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get food: %w", err)
	}
	// 不存在时返回 (nil, nil)，由 handler 层返回 404
	return food, nil
}

// GetFoodsByNames 通过英文名批量获取食物
func (s *FoodService) GetFoodsByNames(ctx context.Context, names []string) (map[string]*model.Food, error) {
	return s.foodRepo.FindByNamesEn(ctx, names)
}

// ImportFromJSON 从JSON数据批量导入食物（用于初始化）
func (s *FoodService) ImportFromJSON(ctx context.Context, foods []*model.Food) (int, error) {
	count, err := s.foodRepo.BatchImport(ctx, foods)
	if err != nil {
		return 0, fmt.Errorf("failed to import foods: %w", err)
	}
	return count, nil
}

// Count 统计食物总数
func (s *FoodService) Count(ctx context.Context) (int64, error) {
	return s.foodRepo.Count(ctx)
}

// GetTopFoods 获取最常食用食物排行
func (s *FoodService) GetTopFoods(ctx context.Context, userID int, days, limit int) ([]model.FoodFrequency, error) {
	return s.foodRepo.GetTopFoods(ctx, userID, days, limit)
}

// GetAllNameMappings 获取所有食物英文名→中文名映射
func (s *FoodService) GetAllNameMappings(ctx context.Context) (map[string]string, error) {
	return s.foodRepo.GetAllNameMappings(ctx)
}
