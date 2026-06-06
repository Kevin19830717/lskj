package model

import "time"

// WeighRecord 称重记录（嵌入式设备上报）
type WeighRecord struct {
	ID                int64           `json:"id" db:"id"`
	UserID            int             `json:"user_id" db:"user_id"`
	Ingredients       []string        `json:"ingredients" db:"ingredients"`                   // ["chicken","carrot"]
	RawWeightsG       []float64       `json:"raw_weights_g" db:"raw_weights_g"`               // [200,80]
	CookingMethod     string          `json:"cooking_method,omitempty" db:"cooking_method"`    // boil/braise/deep_fry/pan_fry/roast/steam/stir_fry
	CookedWeightG     *float64        `json:"cooked_weight_g,omitempty" db:"cooked_weight_g"`
	CookedEnergyKcal  *float64        `json:"cooked_energy_kcal,omitempty" db:"cooked_energy_kcal"`
	CookedProteinG    *float64        `json:"cooked_protein_g,omitempty" db:"cooked_protein_g"`
	CookedFatG        *float64        `json:"cooked_fat_g,omitempty" db:"cooked_fat_g"`
	CookedCarbohydrateG *float64      `json:"cooked_carbohydrate_g,omitempty" db:"cooked_carbohydrate_g"`
	CookedSodiumMg    *float64        `json:"cooked_sodium_mg,omitempty" db:"cooked_sodium_mg"`
	CookedCholesterolMg *float64      `json:"cooked_cholesterol_mg,omitempty" db:"cooked_cholesterol_mg"`
	CookedVitaminCMg  *float64        `json:"cooked_vitamin_c_mg,omitempty" db:"cooked_vitamin_c_mg"`
	CookedCalciumMg   *float64        `json:"cooked_calcium_mg,omitempty" db:"cooked_calcium_mg"`
	CookedIronMg      *float64        `json:"cooked_iron_mg,omitempty" db:"cooked_iron_mg"`
	CookedPotassiumMg *float64        `json:"cooked_potassium_mg,omitempty" db:"cooked_potassium_mg"`
	CreatedAt         time.Time       `json:"created_at" db:"created_at"`
}

// WeighInRequest 嵌入式端上报称重数据请求（嵌入式端已计算好烹饪后营养值）
type WeighInRequest struct {
	Ingredients       []string  `json:"ingredients" binding:"required,min=1"`        // 食材名称列表(英文标识)
	RawWeightsG       []float64 `json:"raw_weights_g" binding:"required,min=1"`      // 对应原始重量(克)
	CookingMethod     string    `json:"cooking_method,omitempty"`                     // 烹饪方式
	CookedWeightG     float64   `json:"cooked_weight_g"`                              // 烹饪后重量(g) — 嵌入式端计算
	CookedEnergyKcal  float64   `json:"cooked_energy_kcal"`                           // 热量(kcal)
	CookedProteinG    float64   `json:"cooked_protein_g"`                             // 蛋白质(g)
	CookedFatG        float64   `json:"cooked_fat_g"`                                 // 脂肪(g)
	CookedCarbohydrateG float64 `json:"cooked_carbohydrate_g"`                        // 碳水化合物(g)
	CookedSodiumMg    float64   `json:"cooked_sodium_mg"`                             // 钠(mg)
	CookedCholesterolMg float64 `json:"cooked_cholesterol_mg"`                        // 胆固醇(mg)
	CookedVitaminCMg  float64   `json:"cooked_vitamin_c_mg"`                          // 维生素C(mg)
	CookedCalciumMg   float64   `json:"cooked_calcium_mg"`                            // 钙(mg)
	CookedIronMg      float64   `json:"cooked_iron_mg"`                               // 铁(mg)
	CookedPotassiumMg float64   `json:"cooked_potassium_mg"`                          // 钾(mg)
}

// WeighRecordResponse 称重记录响应
type WeighRecordResponse struct {
	ID                int64           `json:"id"`
	UserID            int             `json:"user_id"`
	Ingredients       []string        `json:"ingredients"`
	IngredientNames   []string        `json:"ingredient_names,omitempty"` // 中文名
	RawWeightsG       []float64       `json:"raw_weights_g"`
	CookingMethod     string          `json:"cooking_method,omitempty"`
	CookingMethodLabel string         `json:"cooking_method_label,omitempty"`
	CookedWeightG     *float64        `json:"cooked_weight_g,omitempty"`
	CookedEnergyKcal  *float64        `json:"cooked_energy_kcal,omitempty"`
	CookedProteinG    *float64        `json:"cooked_protein_g,omitempty"`
	CookedFatG        *float64        `json:"cooked_fat_g,omitempty"`
	CookedCarbohydrateG *float64      `json:"cooked_carbohydrate_g,omitempty"`
	CookedSodiumMg    *float64        `json:"cooked_sodium_mg,omitempty"`
	CookedCholesterolMg *float64      `json:"cooked_cholesterol_mg,omitempty"`
	CookedVitaminCMg  *float64        `json:"cooked_vitamin_c_mg,omitempty"`
	CookedCalciumMg   *float64        `json:"cooked_calcium_mg,omitempty"`
	CookedIronMg      *float64        `json:"cooked_iron_mg,omitempty"`
	CookedPotassiumMg *float64        `json:"cooked_potassium_mg,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
}

// RecordsQuery 查询历史记录参数
type RecordsQuery struct {
	Page      int    `form:"page" binding:"omitempty,min=1"`
	PageSize  int    `form:"page_size" binding:"omitempty,min=1,max=100"`
	StartDate string `form:"start_date"` // YYYY-MM-DD
	EndDate   string `form:"end_date"`   // YYYY-MM-DD
}

// PaginatedRecords 分页记录结果
type PaginatedRecords struct {
	Items      []WeighRecordResponse `json:"items"`
	Total      int64                 `json:"total"`
	Page       int                   `json:"page"`
	PageSize   int                   `json:"page_size"`
	TotalPages int                   `json:"total_pages"`
}

// NutritionSummary 营养摘要数据
type NutritionSummary struct {
	Date         string                  `json:"date"`
	TotalEnergy  float64                 `json:"total_energy_kcal"`
	TotalProtein float64                 `json:"total_protein_g"`
	TotalFat     float64                 `json:"total_fat_g"`
	TotalCarb    float64                 `json:"total_carbohydrate_g"`
	MealCount    int                     `json:"meal_count"`
	Foods        []string                `json:"foods"`
	Breakdown    map[string]NutritionItem `json:"breakdown,omitempty"`
}

// NutritionItem 单项营养明细
type NutritionItem struct {
	Name       string  `json:"name"`
	WeightG    float64 `json:"weight_g"`
	EnergyKcal float64 `json:"energy_kcal"`
	ProteinG   float64 `json:"protein_g"`
	FatG       float64 `json:"fat_g"`
	CarbG      float64 `json:"carbohydrate_g"`
}
