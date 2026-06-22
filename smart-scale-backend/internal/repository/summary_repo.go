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

type SummaryRepository struct{}

func NewSummaryRepository() *SummaryRepository {
	return &SummaryRepository{}
}

// Create 创建分析摘要
func (r *SummaryRepository) Create(ctx context.Context, summary *model.AnalysisSummary) error {
	insightsJSON, _ := json.Marshal(summary.Insights)

	query := `INSERT INTO user_analysis_summaries 
		(user_id, summary_date, summary_type, source, insights, created_at) 
		VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
		ON CONFLICT (user_id, summary_date, summary_type, source) 
		DO UPDATE SET insights = EXCLUDED.insights, created_at = NOW()
		RETURNING id, created_at`

	err := database.Pool.QueryRow(ctx, query,
		summary.UserID, summary.SummaryDate, summary.SummaryType,
		summary.Source, insightsJSON,
	).Scan(&summary.ID, &summary.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to create summary: %w", err)
	}
	return nil
}

// FindByUserAndType 查询用户的摘要列表
func (r *SummaryRepository) FindByUserAndType(ctx context.Context, userID int, summaryType string, limit int) ([]*model.AnalysisSummary, error) {
	query := `SELECT id, user_id, summary_date, summary_type, source, insights, created_at 
	          FROM user_analysis_summaries 
	          WHERE user_id = $1 AND summary_type = $2 
	          ORDER BY summary_date DESC NULLS LAST LIMIT $3`

	rows, err := database.Pool.Query(ctx, query, userID, summaryType, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to find summaries: %w", err)
	}
	defer rows.Close()

	var summaries []*model.AnalysisSummary
	for rows.Next() {
		var s model.AnalysisSummary
		var insightsJSON []byte

		if err := rows.Scan(&s.ID, &s.UserID, &s.SummaryDate, &s.SummaryType, &s.Source, &insightsJSON, &s.CreatedAt); err != nil {
			continue
		}

		json.Unmarshal(insightsJSON, &s.Insights)
		summaries = append(summaries, &s)
	}
	return summaries, nil
}

// FindLatestByType 获取某类型的最新摘要
func (r *SummaryRepository) FindLatestByType(ctx context.Context, userID int, summaryType string) (*model.AnalysisSummary, error) {
	var s model.AnalysisSummary
	var insightsJSON []byte

	query := `SELECT id, user_id, summary_date, summary_type, source, insights, created_at 
	          FROM user_analysis_summaries 
	          WHERE user_id = $1 AND summary_type = $2 
	          ORDER BY summary_date DESC NULLS LAST LIMIT 1`

	err := database.Pool.QueryRow(ctx, query, userID, summaryType).Scan(
		&s.ID, &s.UserID, &s.SummaryDate, &s.SummaryType, &s.Source, &insightsJSON, &s.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find latest summary: %w", err)
	}
	json.Unmarshal(insightsJSON, &s.Insights)
	return &s, nil
}

// FindByDateRange 按日期范围查询摘要
func (r *SummaryRepository) FindByDateRange(ctx context.Context, userID int, summaryType string, start, end time.Time) ([]*model.AnalysisSummary, error) {
	query := `SELECT id, user_id, summary_date, summary_type, source, insights, created_at 
	          FROM user_analysis_summaries 
	          WHERE user_id = $1 AND summary_type = $2 AND summary_date >= $3 AND summary_date <= $4
	          ORDER BY summary_date DESC`

	rows, err := database.Pool.Query(ctx, query, userID, summaryType, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to find summaries by range: %w", err)
	}
	defer rows.Close()

	var summaries []*model.AnalysisSummary
	for rows.Next() {
		var s model.AnalysisSummary
		var insightsJSON []byte
		if err := rows.Scan(&s.ID, &s.UserID, &s.SummaryDate, &s.SummaryType, &s.Source, &insightsJSON, &s.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal(insightsJSON, &s.Insights)
		summaries = append(summaries, &s)
	}
	return summaries, nil
}

// CountByType 统计某类型摘要数量
func (r *SummaryRepository) CountByType(ctx context.Context, userID int, summaryType string) (int64, error) {
	var count int64
	query := `SELECT COUNT(*) FROM user_analysis_summaries WHERE user_id = $1 AND summary_type = $2`
	err := database.Pool.QueryRow(ctx, query, userID, summaryType).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count summaries: %w", err)
	}
	return count, nil
}

// DeleteBeforeDate 删除指定日期之前的原始级别摘要（用于归档升级）
func (r *SummaryRepository) DeleteBeforeDate(ctx context.Context, userID int, summaryType string, beforeDate time.Time) (int64, error) {
	query := `DELETE FROM user_analysis_summaries 
	          WHERE user_id = $1 AND summary_type = $2 AND summary_date < $3`
	result, err := database.Pool.Exec(ctx, query, userID, summaryType, beforeDate)
	if err != nil {
		return 0, fmt.Errorf("failed to delete old summaries: %w", err)
	}
	return result.RowsAffected(), nil
}

// Exists 检查摘要是否已存在
func (r *SummaryRepository) Exists(ctx context.Context, userID int, date time.Time, summaryType string) (bool, error) {
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM user_analysis_summaries 
	          WHERE user_id = $1 AND summary_date = $2 AND summary_type = $3)`
	err := database.Pool.QueryRow(ctx, query, userID, date, summaryType).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check summary existence: %w", err)
	}
	return exists, nil
}

// GetEarliestDate 获取最早的摘要日期
func (r *SummaryRepository) GetEarliestDate(ctx context.Context, userID int, summaryType string) (*time.Time, error) {
	var d time.Time
	query := `SELECT MIN(summary_date) FROM user_analysis_summaries WHERE user_id = $1 AND summary_type = $2`
	err := database.Pool.QueryRow(ctx, query, userID, summaryType).Scan(&d)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get earliest summary date: %w", err)
	}
	return &d, nil
}

// FindByUserDateType 按用户+日期+类型查找单条摘要
func (r *SummaryRepository) FindByUserDateType(ctx context.Context, userID int, date time.Time, summaryType string) (*model.AnalysisSummary, error) {
	query := `SELECT id, user_id, summary_date, summary_type, source, insights, created_at
		FROM user_analysis_summaries
		WHERE user_id = $1 AND summary_date = $2 AND summary_type = $3 LIMIT 1`

	row := database.Pool.QueryRow(ctx, query, userID, date, summaryType)
	var s model.AnalysisSummary
	var insightsJSON []byte
	err := row.Scan(&s.ID, &s.UserID, &s.SummaryDate, &s.SummaryType, &s.Source, &insightsJSON, &s.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find summary: %w", err)
	}
	json.Unmarshal(insightsJSON, &s.Insights)
	return &s, nil
}
