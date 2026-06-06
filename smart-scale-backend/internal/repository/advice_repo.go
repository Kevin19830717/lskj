package repository

import (
	"context"
	"fmt"
	"time"

	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type AdviceRepository struct{}

func NewAdviceRepository() *AdviceRepository {
	return &AdviceRepository{}
}

// Create 创建健康建议记录
func (r *AdviceRepository) Create(ctx context.Context, advice *model.HealthAdvice) error {
	query := `INSERT INTO health_advice_records (user_id, week_start_date, advice_content, advice_type, generated_at)
	          VALUES ($1, $2, $3, $4, NOW())
	          RETURNING id, generated_at`

	err := database.Pool.QueryRow(ctx, query,
		advice.UserID, advice.WeekStartDate, advice.AdviceContent, advice.AdviceType,
	).Scan(&advice.ID, &advice.GeneratedAt)

	if err != nil {
		return fmt.Errorf("failed to create health advice: %w", err)
	}
	return nil
}

// FindLatestByType 获取用户最新的建议
func (r *AdviceRepository) FindLatestByType(ctx context.Context, userID int, adviceType string) (*model.HealthAdvice, error) {
	var a model.HealthAdvice

	query := `SELECT id, user_id, week_start_date, advice_content, advice_type, generated_at 
	          FROM health_advice_records 
	          WHERE user_id = $1 AND advice_type = $2 
	          ORDER BY generated_at DESC LIMIT 1`

	err := database.Pool.QueryRow(ctx, query, userID, adviceType).Scan(
		&a.ID, &a.UserID, &a.WeekStartDate, &a.AdviceContent, &a.AdviceType, &a.GeneratedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find latest health advice: %w", err)
	}
	return &a, nil
}

// FindByUserAndDateRange 按用户和日期范围查询建议
func (r *AdviceRepository) FindByUserAndDateRange(ctx context.Context, userID int, adviceType string, start, end time.Time) ([]*model.HealthAdvice, error) {
	query := `SELECT id, user_id, week_start_date, advice_content, advice_type, generated_at 
	          FROM health_advice_records 
	          WHERE user_id = $1 AND advice_type = $2 AND generated_at >= $3 AND generated_at <= $4
	          ORDER BY generated_at DESC`

	rows, err := database.Pool.Query(ctx, query, userID, adviceType, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to find advices: %w", err)
	}
	defer rows.Close()

	var advices []*model.HealthAdvice
	for rows.Next() {
		var a model.HealthAdvice
		if err := rows.Scan(&a.ID, &a.UserID, &a.WeekStartDate, &a.AdviceContent, &a.AdviceType, &a.GeneratedAt); err != nil {
			continue
		}
		advices = append(advices, &a)
	}
	return advices, nil
}

// ListRecent 获取最近的建议列表
func (r *AdviceRepository) ListRecent(ctx context.Context, userID int, limit int) ([]*model.HealthAdvice, error) {
	query := `SELECT id, user_id, week_start_date, advice_content, advice_type, generated_at 
	          FROM health_advice_records 
	          WHERE user_id = $1 
	          ORDER BY generated_at DESC LIMIT $2`

	rows, err := database.Pool.Query(ctx, query, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list recent advices: %w", err)
	}
	defer rows.Close()

	var advices []*model.HealthAdvice
	for rows.Next() {
		var a model.HealthAdvice
		if err := rows.Scan(&a.ID, &a.UserID, &a.WeekStartDate, &a.AdviceContent, &a.AdviceType, &a.GeneratedAt); err != nil {
			continue
		}
		advices = append(advices, &a)
	}
	return advices, nil
}

// CountByUser 统计用户建议数量
func (r *AdviceRepository) CountByUser(ctx context.Context, userID int) (int64, error) {
	var count int64
	err := database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM health_advice_records WHERE user_id = $1`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count advices: %w", err)
	}
	return count, nil
}
