package model

import "time"

// Food 食材营养信息
type Food struct {
	ID              int64   `json:"id" db:"id"`
	Name            string  `json:"name" db:"name"`
	NameEn          string  `json:"name_en" db:"name_en"`
	Category        string  `json:"category,omitempty" db:"category"`
	EdibleRatio     float64 `json:"edible_ratio" db:"edible_ratio"`
	EnergyKcal      float64 `json:"energy_kcal" db:"energy_kcal"`
	ProteinG        float64 `json:"protein_g" db:"protein_g"`
	FatG            float64 `json:"fat_g" db:"fat_g"`
	CarbohydrateG   float64 `json:"carbohydrate_g" db:"carbohydrate_g"`
	SodiumMg        float64 `json:"sodium_mg" db:"sodium_mg"`
	CholesterolMg   float64 `json:"cholesterol_mg" db:"cholesterol_mg"`
	VitaminCMg      float64 `json:"vitamin_c_mg" db:"vitamin_c_mg"`
	CalciumMg       float64 `json:"calcium_mg" db:"calcium_mg"`
	IronMg          float64 `json:"iron_mg" db:"iron_mg"`
	PotassiumMg     float64 `json:"potassium_mg" db:"potassium_mg"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// CreateFoodRequest 添加食物请求
type CreateFoodRequest struct {
	Name            string  `json:"name" binding:"required"`
	NameEn          string  `json:"name_en" binding:"required"`
	Category        string  `json:"category,omitempty"`
	EdibleRatio     float64 `json:"edible_ratio,omitempty"`
	EnergyKcal      float64 `json:"energy_kcal"`
	ProteinG        float64 `json:"protein_g"`
	FatG            float64 `json:"fat_g"`
	CarbohydrateG   float64 `json:"carbohydrate_g"`
	SodiumMg        float64 `json:"sodium_mg"`
	CholesterolMg   float64 `json:"cholesterol_mg"`
	VitaminCMg      float64 `json:"vitamin_c_mg"`
	CalciumMg       float64 `json:"calcium_mg"`
	IronMg          float64 `json:"iron_mg"`
	PotassiumMg     float64 `json:"potassium_mg"`
}

// FoodSearchResult 食物搜索结果
type FoodSearchResult struct {
	Items []*Food `json:"items"`
	Total  int64   `json:"total"`
}

// CookingMethod 烹饪方式枚举及编码
type CookingMethod string

const (
	CookBoil     CookingMethod = "boil"      // 煮(0)
	CookBraise   CookingMethod = "braise"    // 炖(1)
	CookDeepFry  CookingMethod = "deep_fry"  // 炸(2)
	CookPanFry   CookingMethod = "pan_fry"   // 煎(3)
	CookRoast    CookingMethod = "roast"     // 烤(4)
	CookSteam    CookingMethod = "steam"     // 蒸(5)
	CookStirFry  CookingMethod = "stir_fry"  // 炒(6)
)

// CookingMethods 所有支持的烹饪方式
var CookingMethods = []CookingMethod{CookBoil, CookBraise, CookDeepFry, CookPanFry, CookRoast, CookSteam, CookStirFry}

// CookingMethodLabels 烹饪方式中文标签
var CookingMethodLabels = map[CookingMethod]string{
	CookBoil:    "煮",
	CookBraise:  "炖",
	CookDeepFry: "炸",
	CookPanFry:  "煎",
	CookRoast:   "烤",
	CookSteam:   "蒸",
	CookStirFry: "炒",
}

// CookingLossRates 各烹饪方式的营养保留率（相对于生食）
// 格式: cooking_method -> {energy_retain, protein_retain, fat_retain, carb_retain, vc_retain, ...}
var CookingLossRates = map[CookingMethod]map[string]float64{
	CookBoil:    {"energy": 0.92, "protein": 0.95, "fat": 0.85, "carb": 0.90, "vc": 0.50, "calcium": 0.70, "iron": 0.75, "potassium": 0.65, "sodium": 0.40, "cholesterol": 0.90},
	CookBraise:  {"energy": 0.88, "protein": 0.92, "fat": 0.90, "carb": 0.88, "vc": 0.35, "calcium": 0.72, "iron": 0.80, "potassium": 0.70, "sodium": 0.70, "cholesterol": 0.88},
	CookDeepFry: {"energy": 1.45, "protein": 0.90, "fat": 2.20, "carb": 0.85, "vc": 0.20, "calcium": 0.78, "iron": 0.82, "potassium": 0.68, "sodium": 0.85, "cholesterol": 0.95},
	CookPanFry:  {"energy": 1.25, "protein": 0.93, "fat": 1.60, "carb": 0.88, "vc": 0.45, "calcium": 0.80, "iron": 0.84, "potassium": 0.72, "sodium": 0.80, "cholesterol": 0.93},
	CookRoast:   {"energy": 0.98, "protein": 0.96, "fat": 0.97, "carb": 0.94, "vc": 0.55, "calcium": 0.85, "iron": 0.90, "potassium": 0.82, "sodium": 0.90, "cholesterol": 0.96},
	CookSteam:   {"energy": 0.96, "protein": 0.98, "fat": 0.92, "carb": 0.96, "vc": 0.80, "calcium": 0.90, "iron": 0.92, "potassium": 0.88, "sodium": 0.75, "cholesterol": 0.94},
	CookStirFry: {"energy": 1.08, "protein": 0.95, "fat": 1.15, "carb": 0.92, "vc": 0.55, "calcium": 0.83, "iron": 0.87, "potassium": 0.78, "sodium": 0.82, "cholesterol": 0.94},
}

// ValidCookingMethod 检查是否是有效的烹饪方式
func ValidCookingMethod(method string) bool {
	_, ok := CookingLossRates[CookingMethod(method)]
	return ok
}
