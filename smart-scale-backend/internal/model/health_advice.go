package model

import "time"

// AnalysisSummary 分析摘要
type AnalysisSummary struct {
	ID           int64                  `json:"id" db:"id"`
	UserID       int                    `json:"user_id" db:"user_id"`
	SummaryDate  time.Time              `json:"summary_date" db:"summary_date"`
	SummaryType  string                 `json:"summary_type" db:"summary_type"` // daily/weekly/monthly/yearly
	Source       string                 `json:"source" db:"source"`             // auto/manual
	Insights     map[string]interface{} `json:"insights" db:"insights"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
}

// SummaryInsights 摘要详细洞察数据结构
type SummaryInsights struct {
	PeriodStart    string            `json:"period_start"`
	PeriodEnd      string            `json:"period_end"`
	TotalMeals     int               `json:"total_meals"`
	TotalEnergy    float64           `json:"total_energy_kcal"`
	AvgDailyEnergy float64           `json:"avg_daily_energy_kcal"`
	TotalProtein   float64           `json:"total_protein_g"`
	TotalFat       float64           `json:"total_fat_g"`
	TotalCarb      float64           `json:"total_carbohydrate_g"`
	TopFoods       []FoodFrequency   `json:"top_foods"`
	NutrientTrend  map[string][]float64 `json:"nutrient_trend,omitempty"`
	HealthScore    *int              `json:"health_score,omitempty"`
	Recommendations []string         `json:"recommendations,omitempty"`
}

// FoodFrequency 食物出现频率
type FoodFrequency struct {
	Name       string  `json:"name"`
	NameEn     string  `json:"name_en"`
	Count      int     `json:"count"`
	TotalWeightG float64 `json:"total_weight_g"`
}

// HealthAdvice 健康建议
type HealthAdvice struct {
	ID             int64     `json:"id" db:"id"`
	UserID         int       `json:"user_id" db:"user_id"`
	WeekStartDate  time.Time `json:"week_start_date" db:"week_start_date"`
	AdviceContent  string    `json:"advice_content" db:"advice_content"`
	AdviceType     string    `json:"advice_type" db:"advice_type"` // weekly/monthly/long_term
	GeneratedAt    time.Time `json:"generated_at" db:"generated_at"`
}

// GenerateAdviceRequest 生成建议请求
type GenerateAdviceRequest struct {
	Type    string `form:"type" binding:"omitempty,oneof=weekly monthly long_term"`
	WeekDate string `form:"week_date"` // YYYY-MM-DD format for the start of week
}

// DashboardStats 仪表盘统计数据
type DashboardStats struct {
	PeriodDays         int                `json:"period_days"`
	TotalMeals         int64              `json:"total_meals"`
	AvgDailyEnergy     float64            `json:"avg_daily_energy_kcal"`
	TotalProtein       float64            `json:"total_protein_g"`
	TotalFat           float64            `json:"total_fat_g"`
	TotalCarb          float64            `json:"total_carbohydrate_g"`
	EnergyTrend        []TrendPoint       `json:"energy_trend"`
	TopFoods           []FoodFrequency    `json:"top_foods"`
	NutrientDistribution NutrientDist     `json:"nutrient_distribution"`
	LatestAdvice       *HealthAdvice      `json:"latest_advice,omitempty"`
}

// TrendPoint 趋势数据点
type TrendPoint struct {
	Date   string  `json:"date"`
	Value  float64 `json:"value"`
}

// NutrientDist 营养素分布占比
type NutrientDist struct {
	ProteinPct  float64 `json:"protein_pct"`
	FatPct      float64 `json:"fat_pct"`
	CarbPct     float64 `json:"carb_pct"`
}

// UserHealthEmbedding 健康向量嵌入
type UserHealthEmbedding struct {
	ID          int64                   `json:"id" db:"id"`
	UserID      int                     `json:"user_id" db:"user_id"`
	SourceType  string                  `json:"source_type" db:"source_type"`
	SourceDate  time.Time               `json:"source_date" db:"source_date"`
	ContentText string                  `json:"content_text" db:"content_text"`
	Embedding   []float64               `json:"-" db:"embedding"`
	Metadata    map[string]interface{}   `json:"metadata" db:"metadata"`
	CreatedAt   time.Time               `json:"created_at" db:"created_at"`
}

// EmbeddingSearchResult 向量检索结果
type EmbeddingSearchResult struct {
	Embedding   UserHealthEmbedding `json:"embedding"`
	Similarity  float64             `json:"similarity"`
}

// UnifiedResponse 统一API响应格式
type UnifiedResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Success 成功响应
func Success(data interface{}) UnifiedResponse {
	return UnifiedResponse{Code: 0, Message: "success", Data: data}
}

// SuccessWithMessage 带消息的成功响应
func SuccessWithMessage(message string, data interface{}) UnifiedResponse {
	return UnifiedResponse{Code: 0, Message: message, Data: data}
}

// ErrorResp 错误响应
func ErrorResp(code int, message string) UnifiedResponse {
	return UnifiedResponse{Code: code, Message: message}
}

// PageData 分页元信息
type PageData struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}
