package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/sirupsen/logrus"
)

type UserService struct {
	userRepo     interface {
		FindByPhone(ctx context.Context, phone string) (*model.User, error)
		Create(ctx context.Context, req *model.RegisterRequest) (*model.User, error)
	}
	mealRepo     interface {
		CountRecordsInRange(ctx context.Context, userID int, start, end time.Time) (int64, error)
		GetLastActivity(ctx context.Context, userID int) (time.Time, error)
		GetEnergyTrend(ctx context.Context, userID int, days int) ([]model.TrendPoint, error)
	}
	authService  *AuthService
}

func NewUserService(
	userRepo interface {
		FindByPhone(ctx context.Context, phone string) (*model.User, error)
		Create(ctx context.Context, req *model.RegisterRequest) (*model.User, error)
	},
	mealRepo interface {
		CountRecordsInRange(ctx context.Context, userID int, start, end time.Time) (int64, error)
		GetLastActivity(ctx context.Context, userID int) (time.Time, error)
		GetEnergyTrend(ctx context.Context, userID int, days int) ([]model.TrendPoint, error)
	},
	authService *AuthService,
) *UserService {
	return &UserService{
		userRepo:    userRepo,
		mealRepo:    mealRepo,
		authService: authService,
	}
}

// GetProfile 获取用户画像
func (s *UserService) GetProfile(ctx context.Context, userID int) (*model.UserProfile, error) {
	profile := &model.UserProfile{UserID: userID}
	query := `
		SELECT gender, age, height_cm, weight_kg, health_goal, allergies, medical_reports, created_at, updated_at
		FROM user_profiles WHERE user_id = $1`
	row := database.Pool.QueryRow(ctx, query, userID)

	// 使用中间变量避免 numeric/NULL -> 非 pointer 类型 scan 失败
	var gender string
	var healthGoal *string   // 可为 NULL
	var age *int             // 可为 NULL
	var heightCm, weightKg *float64 // numeric + 可为 NULL
	var allergiesJSON, medicalReportsJSON []byte
	var createdAt, updatedAt time.Time

	err := row.Scan(
		&gender, &age, &heightCm, &weightKg,
		&healthGoal, &allergiesJSON, &medicalReportsJSON,
		&createdAt, &updatedAt,
	)
	if err != nil {
		logrus.Errorf("[DEBUG] GetProfile Scan error for user_id=%d: %v", userID, err)
		if errors.Is(err, pgx.ErrNoRows) {
			profile.Allergies = []string{}
			profile.MedicalReports = map[string]interface{}{}
			return profile, nil
		}
		return nil, fmt.Errorf("failed to get user profile: %w", err)
	}

	// 赋值到 profile
	profile.Gender = gender
	profile.Age = age
	profile.HeightCm = heightCm
	profile.WeightKg = weightKg
	if healthGoal != nil {
		profile.HealthGoal = *healthGoal
	}
	profile.CreatedAt = createdAt
	profile.UpdatedAt = updatedAt

	if len(allergiesJSON) > 0 {
		json.Unmarshal(allergiesJSON, &profile.Allergies)
	}
	if len(medicalReportsJSON) > 0 {
		json.Unmarshal(medicalReportsJSON, &profile.MedicalReports)
	}
	if profile.Allergies == nil {
		profile.Allergies = []string{}
	}
	if profile.MedicalReports == nil {
		profile.MedicalReports = map[string]interface{}{}
	}

	return profile, nil
}

// UpdateProfile 更新用户画像（UPSERT）
func (s *UserService) UpdateProfile(ctx context.Context, userID int, req *model.UpdateProfileRequest) error {
	allergiesJSON, _ := json.Marshal(req.Allergies)

	// 使用 UPSERT：不存在则插入，已存在则更新
	query := `INSERT INTO user_profiles (user_id, gender, age, height_cm, weight_kg, health_goal, allergies, medical_reports, created_at, updated_at)
	          VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6, $7::jsonb, '{}'::jsonb, NOW(), NOW())
	          ON CONFLICT (user_id) DO UPDATE SET
	            gender = COALESCE($2, user_profiles.gender),
	            age = COALESCE($3::int, user_profiles.age),
	            height_cm = COALESCE($4::numeric, user_profiles.height_cm),
	            weight_kg = COALESCE($5::numeric, user_profiles.weight_kg),
	            health_goal = COALESCE($6, user_profiles.health_goal),
	            allergies = COALESCE($7::jsonb, user_profiles.allergies),
	            updated_at = NOW()`

	_, err := database.Pool.Exec(ctx, query,
		userID, req.Gender, req.Age, req.HeightCm, req.WeightKg,
		req.HealthGoal, allergiesJSON)
	if err != nil {
		return fmt.Errorf("failed to upsert profile: %w", err)
	}

	logrus.Infof("User profile upserted for user_id=%d", userID)
	return nil
}

// UploadMedicalReport 上传体检报告
func (s *UserService) UploadMedicalReport(ctx context.Context, userID int, req *model.MedicalReportUploadRequest) error {
	// 使用默认值
	if req.ReportType == "" {
		req.ReportType = "ai_parsed"
	}
	if req.ReportDate == "" {
		req.ReportDate = time.Now().Format("2006-01-02")
	}
	_, err := time.Parse("2006-01-02", req.ReportDate)
	if err != nil {
		return fmt.Errorf("invalid report date format: %w", err)
	}

	// 获取现有报告
	var existingReportsJSON json.RawMessage
	database.Pool.QueryRow(ctx, `SELECT medical_reports FROM user_profiles WHERE user_id = $1`).
		Scan(&existingReportsJSON)

	var reports map[string]interface{}
	if len(existingReportsJSON) > 0 {
		json.Unmarshal(existingReportsJSON, &reports)
	}
	if reports == nil {
		reports = make(map[string]interface{})
	}

	// 添加/更新报告
	reports[req.ReportType] = map[string]interface{}{
		"report_date": req.ReportDate,
		"report_data": req.ReportData,
		"file_url":    req.FileURL,
		"uploaded_at": time.Now().Format(time.RFC3339),
	}

	reportsJSON, _ := json.Marshal(reports)
	query := `INSERT INTO user_profiles (user_id, medical_reports, created_at, updated_at)
	          VALUES ($1, $2::jsonb, NOW(), NOW())
	          ON CONFLICT (user_id) DO UPDATE SET medical_reports = $2::jsonb, updated_at = NOW()`
	_, err = database.Pool.Exec(ctx, query, userID, reportsJSON)
	if err != nil {
		return fmt.Errorf("failed to upload medical report: %w", err)
	}

	logrus.Infof("Medical report uploaded: user_id=%d, type=%s", userID, req.ReportType)
	return nil
}

// GetUserStats 获取用户统计信息
func (s *UserService) GetUserStats(ctx context.Context, userID int) (map[string]interface{}, error) {
	totalMeals, _ := s.mealRepo.CountRecordsInRange(ctx, userID,
		time.Now().AddDate(0, -1, 0), time.Now())
	lastActivity, _ := s.mealRepo.GetLastActivity(ctx, userID)

	lastAct := "never"
	if !lastActivity.IsZero() {
		lastAct = lastActivity.Format(time.RFC3339)
	}

	stats := map[string]interface{}{
		"total_meals_30d": totalMeals,
		"last_activity":   lastAct,
	}
	return stats, nil
}

// CalculateBMI 计算BMI
func (s *UserService) CalculateBMI(heightCm float64, weightKg float64) float64 {
	if heightCm <= 0 || weightKg <= 0 {
		return 0
	}
	heightM := heightCm / 100.0
	bmi := weightKg / (heightM * heightM)
	// 保留1位小数
	bmi = float64(int(bmi*10)) / 10
	return bmi
}

// GetHealthScore 计算健康评分（基于近期营养数据）
func (s *UserService) GetHealthScore(ctx context.Context, userID int) (int, error) {
	trend, err := s.mealRepo.GetEnergyTrend(ctx, userID, 7)
	if err != nil || len(trend) == 0 {
		return 0, nil // 无数据时返回0
	}

	var totalEnergy float64
	for _, t := range trend {
		totalEnergy += t.Value
	}
	avgEnergy := totalEnergy / float64(len(trend))

	score := 100
	// 根据平均热量调整分数（假设目标1800-2200kcal/天）
	switch {
	case avgEnergy < 1200:
		score -= 30 // 过低
	case avgEnergy < 1500:
		score -= 15 // 偏低
	case avgEnergy >= 2000 && avgEnergy <= 2500:
		score = score // 理想范围
	case avgEnergy > 3000:
		score -= 25 // 过高
	case avgEnergy > 2500:
		score -= 10 // 偏高
	}

	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return score, nil
}
