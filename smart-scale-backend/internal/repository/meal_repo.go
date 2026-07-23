package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type MealRepository struct{}

func NewMealRepository() *MealRepository {
	return &MealRepository{}
}

// CreateWeighRecord 创建称重记录并计算烹饪后营养值
func (r *MealRepository) CreateWeighRecord(ctx context.Context, record *model.WeighRecord) error {
	ingredientsJSON, _ := json.Marshal(record.Ingredients)
	weightsJSON, _ := json.Marshal(record.RawWeightsG)

	query := `INSERT INTO weigh_records (
		user_id, ingredients, raw_weights_g, cooking_method, record_mode,
		cooked_weight_g, cooked_energy_kcal, cooked_protein_g, cooked_fat_g,
		cooked_carbohydrate_g, cooked_sodium_mg, cooked_cholesterol_mg,
		cooked_vitamin_c_mg, cooked_calcium_mg, cooked_iron_mg, cooked_potassium_mg,
		created_at
	) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	RETURNING id`

	err := database.Pool.QueryRow(ctx, query,
		record.UserID,
		ingredientsJSON,
		weightsJSON,
		record.CookingMethod,
		record.RecordMode,
		record.CookedWeightG,
		record.CookedEnergyKcal,
		record.CookedProteinG,
		record.CookedFatG,
		record.CookedCarbohydrateG,
		record.CookedSodiumMg,
		record.CookedCholesterolMg,
		record.CookedVitaminCMg,
		record.CookedCalciumMg,
		record.CookedIronMg,
		record.CookedPotassiumMg,
		record.CreatedAt,
	).Scan(&record.ID)

	if err != nil {
		return fmt.Errorf("failed to create weigh record: %w", err)
	}
	return nil
}

// QueryWeighRecords 查询称重记录（分页+搜索）
func (r *MealRepository) QueryWeighRecords(ctx context.Context, userID int, page, pageSize int, startDate, endDate, search string) ([]*model.WeighRecord, int64, error) {
	var total int64
	countParams := []interface{}{userID}
	countWhere := "WHERE user_id = $1"
	paramIdx := 2

	if startDate != "" {
		countWhere += fmt.Sprintf(" AND created_at >= $%d", paramIdx)
		countParams = append(countParams, startDate+"T00:00:00+08:00")
		paramIdx++
	}
	if endDate != "" {
		countWhere += fmt.Sprintf(" AND created_at <= $%d", paramIdx)
		countParams = append(countParams, endDate+"T23:59:59+08:00")
		paramIdx++
	}
	// 搜索：匹配食材英文名(ingredients)、中文食物名(foods.name)、烹饪方式英文或中文标签
	if search != "" {
		countWhere += fmt.Sprintf(` AND (
			ingredients::text ILIKE $%d
			OR cooking_method ILIKE $%d
			OR EXISTS (SELECT 1 FROM foods f WHERE f.name ILIKE $%d AND ingredients::jsonb ? f.name_en)
			OR EXISTS (SELECT 1 FROM (VALUES
			('boil','煮'),('braise','炖'),('deep_fry','炸'),('pan_fry','煎'),
			('roast','烤'),('steam','蒸'),('stir_fry','炒'),('raw','生食'),('cooked','熟食')
		) AS cm(en, zh) WHERE cm.zh ILIKE $%d AND cooking_method = cm.en)
		)`, paramIdx, paramIdx, paramIdx, paramIdx)
		countParams = append(countParams, "%"+search+"%")
		paramIdx++
	}

	countQuery := "SELECT COUNT(*) FROM weigh_records " + countWhere
	if err := database.Pool.QueryRow(ctx, countQuery, countParams...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count records: %w", err)
	}

	offset := (page - 1) * pageSize
	dataParams := append(countParams, pageSize, offset)
	dataQuery := fmt.Sprintf(`
		SELECT id, user_id, ingredients, raw_weights_g, cooking_method, record_mode,
		       cooked_weight_g, cooked_energy_kcal, cooked_protein_g, cooked_fat_g,
		       cooked_carbohydrate_g, cooked_sodium_mg, cooked_cholesterol_mg,
		       cooked_vitamin_c_mg, cooked_calcium_mg, cooked_iron_mg, cooked_potassium_mg,
		       created_at
		FROM weigh_records %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		countWhere, paramIdx, paramIdx+1)

	rows, err := database.Pool.Query(ctx, dataQuery, dataParams...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query records: %w", err)
	}
	defer rows.Close()

	var records []*model.WeighRecord
	for rows.Next() {
		var rec model.WeighRecord
		var ingredientsJSON, weightsJSON []byte

		err := rows.Scan(
			&rec.ID, &rec.UserID, &ingredientsJSON, &weightsJSON, &rec.CookingMethod, &rec.RecordMode,
			&rec.CookedWeightG, &rec.CookedEnergyKcal, &rec.CookedProteinG, &rec.CookedFatG,
			&rec.CookedCarbohydrateG, &rec.CookedSodiumMg, &rec.CookedCholesterolMg,
			&rec.CookedVitaminCMg, &rec.CookedCalciumMg, &rec.CookedIronMg, 			&rec.CookedPotassiumMg,
			&rec.CreatedAt,
		)
		if err != nil {
			continue
		}

		json.Unmarshal(ingredientsJSON, &rec.Ingredients)
		json.Unmarshal(weightsJSON, &rec.RawWeightsG)
		records = append(records, &rec)
	}

	return records, total, nil
}

// QueryRecordsByDateRange 按日期范围查询记录（用于摘要生成）
func (r *MealRepository) QueryRecordsByDateRange(ctx context.Context, userID int, start, end time.Time) ([]*model.WeighRecord, error) {
	query := `
		SELECT id, user_id, ingredients, raw_weights_g, cooking_method, record_mode,
		       cooked_weight_g, cooked_energy_kcal, cooked_protein_g, cooked_fat_g,
		       cooked_carbohydrate_g, cooked_sodium_mg, cooked_cholesterol_mg,
		       cooked_vitamin_c_mg, cooked_calcium_mg, cooked_iron_mg, cooked_potassium_mg,
		       created_at
		FROM weigh_records
		WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
		ORDER BY created_at ASC`

	rows, err := database.Pool.Query(ctx, query, userID, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to query records by date range: %w", err)
	}
	defer rows.Close()

	var records []*model.WeighRecord
	for rows.Next() {
		var rec model.WeighRecord
		var ingredientsJSON, weightsJSON []byte

		if err := rows.Scan(
			&rec.ID, &rec.UserID, &ingredientsJSON, &weightsJSON, &rec.CookingMethod, &rec.RecordMode,
			&rec.CookedWeightG, &rec.CookedEnergyKcal, &rec.CookedProteinG, &rec.CookedFatG,
			&rec.CookedCarbohydrateG, &rec.CookedSodiumMg, &rec.CookedCholesterolMg,
			&rec.CookedVitaminCMg, &rec.CookedCalciumMg, &rec.CookedIronMg, 			&rec.CookedPotassiumMg,
			&rec.CreatedAt,
		); err != nil {
			continue
		}

		json.Unmarshal(ingredientsJSON, &rec.Ingredients)
		json.Unmarshal(weightsJSON, &rec.RawWeightsG)
		records = append(records, &rec)
	}

	return records, nil
}

// GetRecentMeals 获取最近N餐记录
func (r *MealRepository) GetRecentMeals(ctx context.Context, userID int, limit int) ([]*model.WeighRecord, error) {
	query := `
		SELECT id, user_id, ingredients, raw_weights_g, cooking_method, record_mode,
		       cooked_weight_g, cooked_energy_kcal, cooked_protein_g, cooked_fat_g,
		       cooked_carbohydrate_g, cooked_sodium_mg, cooked_cholesterol_mg,
		       cooked_vitamin_c_mg, cooked_calcium_mg, cooked_iron_mg, cooked_potassium_mg,
		       created_at
		FROM weigh_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`

	rows, err := database.Pool.Query(ctx, query, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get recent meals: %w", err)
	}
	defer rows.Close()

	var records []*model.WeighRecord
	for rows.Next() {
		var rec model.WeighRecord
		var ingredientsJSON, weightsJSON []byte
		if err := rows.Scan(
			&rec.ID, &rec.UserID, &ingredientsJSON, &weightsJSON, &rec.CookingMethod, &rec.RecordMode,
			&rec.CookedWeightG, &rec.CookedEnergyKcal, &rec.CookedProteinG, &rec.CookedFatG,
			&rec.CookedCarbohydrateG, &rec.CookedSodiumMg, &rec.CookedCholesterolMg,
			&rec.CookedVitaminCMg, &rec.CookedCalciumMg, &rec.CookedIronMg, 			&rec.CookedPotassiumMg,
			&rec.CreatedAt,
		); err != nil {
			continue
		}
		json.Unmarshal(ingredientsJSON, &rec.Ingredients)
		json.Unmarshal(weightsJSON, &rec.RawWeightsG)
		records = append(records, &rec)
	}
	return records, nil
}

// GetDailyStats 获取每日营养统计
func (r *MealRepository) GetDailyStats(ctx context.Context, userID int, date time.Time) (*model.NutritionSummary, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	end := start.AddDate(0, 0, 1)

	records, err := r.QueryRecordsByDateRange(ctx, userID, start, end)
	if err != nil {
		return nil, err
	}

	if len(records) == 0 {
		return &model.NutritionSummary{
			Date:      date.Format("2006-01-02"),
			MealCount: 0,
		}, nil
	}

	summary := &model.NutritionSummary{
		Date:      date.Format("2006-01-02"),
		MealCount: len(records),
		Foods:     []string{},
	}

	allFoods := make(map[string]int)
	for _, rec := range records {
		if rec.CookedEnergyKcal != nil {
			summary.TotalEnergy += *rec.CookedEnergyKcal
		}
		if rec.CookedProteinG != nil {
			summary.TotalProtein += *rec.CookedProteinG
		}
		if rec.CookedFatG != nil {
			summary.TotalFat += *rec.CookedFatG
		}
		if rec.CookedCarbohydrateG != nil {
			summary.TotalCarb += *rec.CookedCarbohydrateG
		}
		for _, ing := range rec.Ingredients {
			allFoods[ing]++
			summary.Foods = append(summary.Foods, ing)
		}
	}
	return summary, nil
}

// GetEnergyTrend 获取热量趋势数据
func (r *MealRepository) GetEnergyTrend(ctx context.Context, userID int, days int) ([]model.TrendPoint, error) {
	query := `
		SELECT DATE(created_at)::TEXT as date, 
		       COALESCE(SUM(cooked_energy_kcal), 0) as energy
		FROM weigh_records 
		WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
		GROUP BY DATE(created_at) 
		ORDER BY date ASC`

	rows, err := database.Pool.Query(ctx, query, userID, days)
	if err != nil {
		return nil, fmt.Errorf("failed to get energy trend: %w", err)
	}
	defer rows.Close()

	var trends []model.TrendPoint
	for rows.Next() {
		var tp model.TrendPoint
		if err := rows.Scan(&tp.Date, &tp.Value); err != nil {
			continue
		}
		trends = append(trends, tp)
	}
	return trends, nil
}

// CountRecordsInRange 统计日期范围内的记录数
func (r *MealRepository) CountRecordsInRange(ctx context.Context, userID int, start, end time.Time) (int64, error) {
	var count int64
	query := `SELECT COUNT(*) FROM weigh_records WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`
	err := database.Pool.QueryRow(ctx, query, userID, start, end).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count records in range: %w", err)
	}
	return count, nil
}

// GetOldestRecordDate 获取最早记录日期
func (r *MealRepository) GetOldestRecordDate(ctx context.Context, userID int) (*time.Time, error) {
	var t time.Time
	query := `SELECT MIN(created_at) FROM weigh_records WHERE user_id = $1`
	err := database.Pool.QueryRow(ctx, query, userID).Scan(&t)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get oldest record date: %w", err)
	}
	return &t, nil
}

// GetLastActivity 获取用户最后活动时间
func (r *MealRepository) GetLastActivity(ctx context.Context, userID int) (time.Time, error) {
	var t time.Time
	query := `SELECT MAX(created_at) FROM weigh_records WHERE user_id = $1`
	err := database.Pool.QueryRow(ctx, query, userID).Scan(&t)
	if err != nil {
		if err == pgx.ErrNoRows {
			return time.Time{}, nil
		}
		return time.Time{}, fmt.Errorf("failed to get last activity: %w", err)
	}
	return t, nil
}

// ArchiveOldRecords 归档旧数据到摘要表后删除原始记录
func (r *MealRepository) DeleteArchivedRecords(ctx context.Context, userID int, before time.Time) (int64, error) {
	query := `DELETE FROM weigh_records WHERE user_id = $1 AND created_at < $2`
	result, err := database.Pool.Exec(ctx, query, userID, before)
	if err != nil {
		return 0, fmt.Errorf("failed to delete archived records: %w", err)
	}
	return result.RowsAffected(), nil
}

// GetCompanionStats 获取智能秤陪伴记录统计（基于餐食记录）
func (r *MealRepository) GetCompanionStats(ctx context.Context, userID int) (map[string]interface{}, error) {
	// 总餐数 + 记录天数
	var totalMeals int64
	var totalDays int64
	err := database.Pool.QueryRow(ctx,
		`SELECT COUNT(*), COUNT(DISTINCT DATE(created_at)) FROM weigh_records WHERE user_id = $1`,
		userID,
	).Scan(&totalMeals, &totalDays)
	if err != nil {
		return nil, fmt.Errorf("failed to get companion stats: %w", err)
	}

	// 不同食材种类数
	var ingredientCount int64
	err = database.Pool.QueryRow(ctx,
		`SELECT COUNT(DISTINCT elem) FROM weigh_records, jsonb_array_elements_text(ingredients) AS elem WHERE user_id = $1`,
		userID,
	).Scan(&ingredientCount)
	if err != nil {
		ingredientCount = 0
	}

	// 最常用烹饪方式
	var favMethod string
	var favMethodCount int64
	err = database.Pool.QueryRow(ctx,
		`SELECT cooking_method, COUNT(*) as cnt FROM weigh_records WHERE user_id = $1 GROUP BY cooking_method ORDER BY cnt DESC LIMIT 1`,
		userID,
	).Scan(&favMethod, &favMethodCount)
	if err != nil {
		favMethod = ""
		favMethodCount = 0
	}

	// 首次记录日期
	var firstDate *time.Time
	err = database.Pool.QueryRow(ctx,
		`SELECT MIN(created_at) FROM weigh_records WHERE user_id = $1`,
		userID,
	).Scan(&firstDate)
	if err != nil {
		firstDate = nil
	}

	result := map[string]interface{}{
		"total_meals":          totalMeals,
		"total_days":           totalDays,
		"ingredient_variety":   ingredientCount,
		"favorite_method":      favMethod,
		"favorite_method_count": favMethodCount,
	}
	if firstDate != nil {
		result["first_record_date"] = firstDate.Format("2006-01-02")
	}
	return result, nil
}

// GetUsersWithRecordsBefore 获取在指定日期之前有称重记录的用户列表
func (r *MealRepository) GetUsersWithRecordsBefore(ctx context.Context, before time.Time) ([]int, error) {
	query := `SELECT DISTINCT user_id FROM weigh_records WHERE created_at < $1`
	rows, err := database.Pool.Query(ctx, query, before)
	if err != nil {
		return nil, fmt.Errorf("failed to get users with records before: %w", err)
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			continue
		}
		userIDs = append(userIDs, id)
	}
	return userIDs, nil
}

// GetUsersWithSummariesBefore 获取在指定日期之前有特定类型摘要的用户列表
func (r *MealRepository) GetUsersWithSummariesBefore(ctx context.Context, before time.Time, summaryType string) ([]int, error) {
	query := `SELECT DISTINCT user_id FROM user_analysis_summaries WHERE summary_date < $1 AND summary_type = $2`
	rows, err := database.Pool.Query(ctx, query, before, summaryType)
	if err != nil {
		return nil, fmt.Errorf("failed to get users with summaries before: %w", err)
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			continue
		}
		userIDs = append(userIDs, id)
	}
	return userIDs, nil
}

// GetAllActiveUserIDs 获取所有有称重记录的用户ID列表（用于定时任务遍历）
func (r *MealRepository) GetAllActiveUserIDs(ctx context.Context) ([]int, error) {
	query := `SELECT DISTINCT user_id FROM weigh_records`
	rows, err := database.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get active user IDs: %w", err)
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			continue
		}
		userIDs = append(userIDs, id)
	}
	return userIDs, nil
}

// UpdateWeighRecord 更新称重记录
func (r *MealRepository) UpdateWeighRecord(ctx context.Context, id int64, record *model.WeighRecord, newTime *time.Time) error {
	ingredientsJSON, _ := json.Marshal(record.Ingredients)
	weightsJSON, _ := json.Marshal(record.RawWeightsG)

	query := `UPDATE weigh_records SET
		ingredients = $1::jsonb, raw_weights_g = $2::jsonb, cooking_method = $3,
		cooked_weight_g = $4, cooked_energy_kcal = $5, cooked_protein_g = $6,
		cooked_fat_g = $7, cooked_carbohydrate_g = $8, cooked_sodium_mg = $9,
		cooked_cholesterol_mg = $10, cooked_vitamin_c_mg = $11, cooked_calcium_mg = $12,
		cooked_iron_mg = $13, cooked_potassium_mg = $14`
	args := []interface{}{
		ingredientsJSON, weightsJSON, record.CookingMethod,
		record.CookedWeightG, record.CookedEnergyKcal, record.CookedProteinG,
		record.CookedFatG, record.CookedCarbohydrateG, record.CookedSodiumMg,
		record.CookedCholesterolMg, record.CookedVitaminCMg, record.CookedCalciumMg,
		record.CookedIronMg, record.CookedPotassiumMg,
	}
	if newTime != nil {
		query += `, created_at = $15`
		args = append(args, *newTime)
		query += fmt.Sprintf(" WHERE id = $%d", len(args)+1)
	} else {
		query += fmt.Sprintf(" WHERE id = $%d", len(args)+1)
	}
	args = append(args, id)

	_, err := database.Pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to update weigh record: %w", err)
	}
	return nil
}

// DeleteWeighRecord 删除称重记录
func (r *MealRepository) DeleteWeighRecord(ctx context.Context, id int64) error {
	_, err := database.Pool.Exec(ctx, "DELETE FROM weigh_records WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete weigh record: %w", err)
	}
	return nil
}

// DeleteWeighRecordsBatch 批量删除称重记录
func (r *MealRepository) DeleteWeighRecordsBatch(ctx context.Context, ids []int64) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	result, err := database.Pool.Exec(ctx, "DELETE FROM weigh_records WHERE id = ANY($1)", ids)
	if err != nil {
		return 0, fmt.Errorf("failed to batch delete weigh records: %w", err)
	}
	return result.RowsAffected(), nil
}

// FindDishNutritionByName 按菜名精确查找熟菜营养信息（每100g营养值）
func (r *MealRepository) FindDishNutritionByName(ctx context.Context, name string) (*model.DishNutrition, error) {
	query := `SELECT id, name_zh, energy_kcal, protein_g, fat_g, carbohydrate_g,
	                 sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg
	          FROM dish_nutrition WHERE name_zh = $1`
	var d model.DishNutrition
	err := database.Pool.QueryRow(ctx, query, name).Scan(
		&d.ID, &d.NameZh, &d.EnergyKcal, &d.ProteinG, &d.FatG, &d.CarbohydrateG,
		&d.SodiumMg, &d.CholesterolMg, &d.VitaminCMg, &d.CalciumMg, &d.IronMg, &d.PotassiumMg,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find dish nutrition: %w", err)
	}
	return &d, nil
}

// ListDishNutritions 列出所有熟菜（前端菜名下拉用）
func (r *MealRepository) ListDishNutritions(ctx context.Context) ([]*model.DishNutrition, error) {
	query := `SELECT id, name_zh, energy_kcal, protein_g, fat_g, carbohydrate_g,
	                 sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg
	          FROM dish_nutrition ORDER BY name_zh ASC`
	rows, err := database.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list dish nutritions: %w", err)
	}
	defer rows.Close()

	var dishes []*model.DishNutrition
	for rows.Next() {
		var d model.DishNutrition
		if err := rows.Scan(
			&d.ID, &d.NameZh, &d.EnergyKcal, &d.ProteinG, &d.FatG, &d.CarbohydrateG,
			&d.SodiumMg, &d.CholesterolMg, &d.VitaminCMg, &d.CalciumMg, &d.IronMg, &d.PotassiumMg,
		); err != nil {
			continue
		}
		dishes = append(dishes, &d)
	}
	return dishes, nil
}
