package repository

import (
	"context"
	"fmt"

	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type FoodRepository struct{}

func NewFoodRepository() *FoodRepository {
	return &FoodRepository{}
}

// Create 添加食物
func (r *FoodRepository) Create(ctx context.Context, food *model.Food) error {
	query := `INSERT INTO foods (
		name, name_en, category, edible_ratio, energy_kcal, protein_g, fat_g, 
		carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, 
		iron_mg, potassium_mg, created_at, updated_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
	RETURNING id, created_at, updated_at`

	err := database.Pool.QueryRow(ctx, query,
		food.Name, food.NameEn, food.Category, food.EdibleRatio,
		food.EnergyKcal, food.ProteinG, food.FatG, food.CarbohydrateG,
		food.SodiumMg, food.CholesterolMg, food.VitaminCMg, food.CalciumMg,
		food.IronMg, food.PotassiumMg,
	).Scan(&food.ID, &food.CreatedAt, &food.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create food: %w", err)
	}
	return nil
}

// FindByID 通过ID查找食物
func (r *FoodRepository) FindByID(ctx context.Context, id int64) (*model.Food, error) {
	var f model.Food
	query := `SELECT id, name, name_en, category, edible_ratio, energy_kcal, protein_g, fat_g,
		carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg,
		created_at, updated_at FROM foods WHERE id = $1`

	err := database.Pool.QueryRow(ctx, query, id).Scan(
		&f.ID, &f.Name, &f.NameEn, &f.Category, &f.EdibleRatio,
		&f.EnergyKcal, &f.ProteinG, &f.FatG, &f.CarbohydrateG,
		&f.SodiumMg, &f.CholesterolMg, &f.VitaminCMg, &f.CalciumMg,
		&f.IronMg, &f.PotassiumMg, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find food by ID: %w", err)
	}
	return &f, nil
}

// FindByNameEn 通过英文名查找食物
func (r *FoodRepository) FindByNameEn(ctx context.Context, nameEn string) (*model.Food, error) {
	var f model.Food
	query := `SELECT id, name, name_en, category, edible_ratio, energy_kcal, protein_g, fat_g,
		carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg,
		created_at, updated_at FROM foods WHERE name_en = $1`

	err := database.Pool.QueryRow(ctx, query, nameEn).Scan(
		&f.ID, &f.Name, &f.NameEn, &f.Category, &f.EdibleRatio,
		&f.EnergyKcal, &f.ProteinG, &f.FatG, &f.CarbohydrateG,
		&f.SodiumMg, &f.CholesterolMg, &f.VitaminCMg, &f.CalciumMg,
		&f.IronMg, &f.PotassiumMg, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find food by name_en: %w", err)
	}
	return &f, nil
}

// FindByNamesEn 批量通过英文名查找食物
func (r *FoodRepository) FindByNamesEn(ctx context.Context, names []string) (map[string]*model.Food, error) {
	result := make(map[string]*model.Food)
	if len(names) == 0 {
		return result, nil
	}

	query := `SELECT id, name, name_en, category, edible_ratio, energy_kcal, protein_g, fat_g,
		carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg,
		created_at, updated_at FROM foods WHERE name_en = ANY($1)`

	rows, err := database.Pool.Query(ctx, query, names)
	if err != nil {
		return nil, fmt.Errorf("failed to find foods by names: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var f model.Food
		if err := rows.Scan(
			&f.ID, &f.Name, &f.NameEn, &f.Category, &f.EdibleRatio,
			&f.EnergyKcal, &f.ProteinG, &f.FatG, &f.CarbohydrateG,
			&f.SodiumMg, &f.CholesterolMg, &f.VitaminCMg, &f.CalciumMg,
			&f.IronMg, &f.PotassiumMg, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			continue
		}
		result[f.NameEn] = &f
	}
	return result, nil
}

// Search 搜索食物（模糊匹配）
func (r *FoodRepository) Search(ctx context.Context, queryStr string, limit int) ([]*model.Food, error) {
	sql := `
		SELECT id, name, name_en, category, edible_ratio, energy_kcal, protein_g, fat_g,
		carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg,
		created_at, updated_at 
		FROM foods 
		WHERE name ILIKE $1 OR name_en ILIKE $1
		ORDER BY name 
		LIMIT $2`

	rows, err := database.Pool.Query(ctx, sql, "%"+queryStr+"%", limit)
	if err != nil {
		return nil, fmt.Errorf("failed to search foods: %w", err)
	}
	defer rows.Close()

	var foods []*model.Food
	for rows.Next() {
		var f model.Food
		if err := rows.Scan(
			&f.ID, &f.Name, &f.NameEn, &f.Category, &f.EdibleRatio,
			&f.EnergyKcal, &f.ProteinG, &f.FatG, &f.CarbohydrateG,
			&f.SodiumMg, &f.CholesterolMg, &f.VitaminCMg, &f.CalciumMg,
			&f.IronMg, &f.PotassiumMg, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			continue
		}
		foods = append(foods, &f)
	}
	return foods, nil
}

// List 列出所有食物（分页）
func (r *FoodRepository) List(ctx context.Context, offset, limit int) ([]*model.Food, int64, error) {
	var total int64
	database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM foods`).Scan(&total)

	rows, err := database.Pool.Query(ctx, `
		SELECT id, name, name_en, category, edible_ratio, energy_kcal, protein_g, fat_g,
		carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg,
		created_at, updated_at 
		FROM foods ORDER BY name LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list foods: %w", err)
	}
	defer rows.Close()

	var foods []*model.Food
	for rows.Next() {
		var f model.Food
		if err := rows.Scan(
			&f.ID, &f.Name, &f.NameEn, &f.Category, &f.EdibleRatio,
			&f.EnergyKcal, &f.ProteinG, &f.FatG, &f.CarbohydrateG,
			&f.SodiumMg, &f.CholesterolMg, &f.VitaminCMg, &f.CalciumMg,
			&f.IronMg, &f.PotassiumMg, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			continue
		}
		foods = append(foods, &f)
	}
	return foods, total, nil
}

// BatchImport 批量导入食物数据
func (r *FoodRepository) BatchImport(ctx context.Context, foods []*model.Food) (int, error) {
	count := 0
	for _, food := range foods {
		query := `INSERT INTO foods (
			name, name_en, category, edible_ratio, energy_kcal, protein_g, fat_g, 
			carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, 
			iron_mg, potassium_mg, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
		ON CONFLICT (name_en) DO UPDATE SET
			name = EXCLUDED.name, category = EXCLUDED.category, 
			edible_ratio = EXCLUDED.edible_ratio, energy_kcal = EXCLUDED.energy_kcal,
			protein_g = EXCLUDED.protein_g, fat_g = EXCLUDED.fat_g,
			carbohydrate_g = EXCLUDED.carbohydrate_g, sodium_mg = EXCLUDED.sodium_mg,
			cholesterol_mg = EXCLUDED.cholesterol_mg, vitamin_c_mg = EXCLUDED.vitamin_c_mg,
			calcium_mg = EXCLUDED.calcium_mg, iron_mg = EXCLUDED.iron_mg,
			potassium_mg = EXCLUDED.potassium_mg, updated_at = NOW()`

		_, err := database.Pool.Exec(ctx, query,
			food.Name, food.NameEn, food.Category, food.EdibleRatio,
			food.EnergyKcal, food.ProteinG, food.FatG, food.CarbohydrateG,
			food.SodiumMg, food.CholesterolMg, food.VitaminCMg, food.CalciumMg,
			food.IronMg, food.PotassiumMg,
		)
		if err != nil {
			continue
		}
		count++
	}
	return count, nil
}

// Count 统计食物总数
func (r *FoodRepository) Count(ctx context.Context) (int64, error) {
	var count int64
	err := database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM foods`).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count foods: %w", err)
	}
	return count, nil
}

// GetTopFoods 获取用户最常食用的食物排行
// 以用户有数据的最近N天为查询范围，而非固定日历天数
func (r *FoodRepository) GetTopFoods(ctx context.Context, userID int, days, limit int) ([]model.FoodFrequency, error) {
	query := `
		WITH recent_dates AS (
			SELECT DISTINCT DATE(created_at) as d
			FROM weigh_records
			WHERE user_id = $1
			ORDER BY d DESC
			LIMIT $2
		)
		SELECT elem as food_name_en, COUNT(*) as cnt
		FROM weigh_records, jsonb_array_elements_text(ingredients) AS elem, recent_dates
		WHERE user_id = $1 
		  AND DATE(created_at) = recent_dates.d
		GROUP BY elem ORDER BY cnt DESC LIMIT $3`

	rows, err := database.Pool.Query(ctx, query, userID, days, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get top foods: %w", err)
	}
	defer rows.Close()

	// 获取英文名→中文名映射
	nameMap, _ := r.GetAllNameMappings(ctx)

	var results []model.FoodFrequency
	for rows.Next() {
		var fr model.FoodFrequency
		if err := rows.Scan(&fr.NameEn, &fr.Count); err != nil {
			continue
		}
		fr.Name = nameMap[fr.NameEn]
		if fr.Name == "" {
			fr.Name = fr.NameEn
		}
		fr.TotalWeightG = 0
		results = append(results, fr)
	}
	return results, nil
}

// GetAllNameMappings 获取所有食物名称映射
func (r *FoodRepository) GetAllNameMappings(ctx context.Context) (map[string]string, error) {
	mapping := make(map[string]string)
	query := `SELECT name_en, name FROM foods`
	rows, err := database.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get name mappings: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var nameEn, name string
		if err := rows.Scan(&nameEn, &name); err != nil {
			continue
		}
		mapping[nameEn] = name
	}
	return mapping, nil
}
