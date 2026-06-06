package model

import "time"

// UserProfile 用户健康画像
type UserProfile struct {
	UserID          int              `json:"user_id" db:"user_id"`
	Gender          string           `json:"gender,omitempty" db:"gender"`
	Age             *int             `json:"age,omitempty" db:"age"`
	HeightCm        *float64         `json:"height_cm,omitempty" db:"height_cm"`
	WeightKg        *float64         `json:"weight_kg,omitempty" db:"weight_kg"`
	HealthGoal      string           `json:"health_goal,omitempty" db:"health_goal"`
	Allergies       []string         `json:"allergies" db:"allergies"`
	MedicalReports  map[string]interface{} `json:"medical_reports" db:"medical_reports"`
	CreatedAt       time.Time        `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at" db:"updated_at"`
}

// UpdateProfileRequest 更新画像请求
type UpdateProfileRequest struct {
	Gender         *string  `json:"gender,omitempty" binding:"omitempty,oneof=male female other"`
	Age            *int     `json:"age,omitempty" binding:"omitempty,min=1,max=150"`
	HeightCm       *float64 `json:"height_cm,omitempty" binding:"omitempty,min=50,max=300"`
	WeightKg       *float64 `json:"weight_kg,omitempty" binding:"omitempty,min=10,max=500"`
	HealthGoal     *string  `json:"health_goal,omitempty" binding:"omitempty,oneof=lose_weight gain_weight maintain muscle_gain health_maintenance"`
	Allergies      []string `json:"allergies,omitempty"`
}

// MedicalReportUploadRequest 体检报告上传请求
type MedicalReportUploadRequest struct {
	ReportType    string                 `json:"report_type" binding:"omitempty"`
	ReportDate    string                 `json:"report_date" binding:"omitempty"` // YYYY-MM-DD
	ReportData    map[string]interface{} `json:"report_data" binding:"required"`
	FileURL       string                 `json:"file_url,omitempty"`
}

// HealthGoals 健康目标列表
var HealthGoals = []string{
	"lose_weight", "gain_weight", "maintain", "muscle_gain", "health_maintenance",
}
