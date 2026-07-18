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

// FindByUserAndTypePaged 分页查询摘要列表
func (r *SummaryRepository) FindByUserAndTypePaged(ctx context.Context, userID int, summaryType string, page, pageSize int) ([]*model.AnalysisSummary, int64, error) {
	// 计数
	var total int64
	countQuery := `SELECT COUNT(*) FROM user_analysis_summaries WHERE user_id = $1 AND summary_type = $2`
	if err := database.Pool.QueryRow(ctx, countQuery, userID, summaryType).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count summaries: %w", err)
	}

	offset := (page - 1) * pageSize
	query := `SELECT id, user_id, summary_date, summary_type, source, insights, created_at 
	          FROM user_analysis_summaries 
	          WHERE user_id = $1 AND summary_type = $2 
	          ORDER BY summary_date DESC NULLS LAST LIMIT $3 OFFSET $4`

	rows, err := database.Pool.Query(ctx, query, userID, summaryType, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to find summaries paged: %w", err)
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
	return summaries, total, nil
}

// DeleteAllByUserType 删除用户某类型全部摘要（测试用）
func (r *SummaryRepository) DeleteAllByUserType(ctx context.Context, userID int, summaryType string) (int64, error) {
	query := `DELETE FROM user_analysis_summaries WHERE user_id = $1 AND summary_type = $2`
	result, err := database.Pool.Exec(ctx, query, userID, summaryType)
	if err != nil {
		return 0, fmt.Errorf("failed to delete all summaries by type: %w", err)
	}
	return result.RowsAffected(), nil
}

// DeleteAllByUser 删除用户全部类型的摘要（测试用）
func (r *SummaryRepository) DeleteAllByUser(ctx context.Context, userID int) (int64, error) {
	query := `DELETE FROM user_analysis_summaries WHERE user_id = $1`
	result, err := database.Pool.Exec(ctx, query, userID)
	if err != nil {
		return 0, fmt.Errorf("failed to delete all summaries: %w", err)
	}
	return result.RowsAffected(), nil
}

// DeleteAllByUserExceptDaily 删除用户除日报外的全部摘要
func (r *SummaryRepository) DeleteAllByUserExceptDaily(ctx context.Context, userID int) (int64, error) {
	query := `DELETE FROM user_analysis_summaries WHERE user_id = $1 AND summary_type != 'daily'`
	result, err := database.Pool.Exec(ctx, query, userID)
	if err != nil {
		return 0, fmt.Errorf("failed to delete summaries except daily: %w", err)
	}
	return result.RowsAffected(), nil
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

// CountByDateRange 统计指定日期范围内某类型摘要数量
func (r *SummaryRepository) CountByDateRange(ctx context.Context, userID int, summaryType string, start, end time.Time) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM user_analysis_summaries 
	          WHERE user_id = $1 AND summary_type = $2 AND summary_date >= $3 AND summary_date <= $4`
	err := database.Pool.QueryRow(ctx, query, userID, summaryType, start, end).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count summaries by range: %w", err)
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

// FindByID 按ID查询单条摘要
func (r *SummaryRepository) FindByID(ctx context.Context, id int64) (*model.AnalysisSummary, error) {
	query := `SELECT id, user_id, summary_date, summary_type, source, insights, created_at
		FROM user_analysis_summaries WHERE id = $1`

	row := database.Pool.QueryRow(ctx, query, id)
	var s model.AnalysisSummary
	var insightsJSON []byte
	err := row.Scan(&s.ID, &s.UserID, &s.SummaryDate, &s.SummaryType, &s.Source, &insightsJSON, &s.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find summary by id: %w", err)
	}
	json.Unmarshal(insightsJSON, &s.Insights)
	return &s, nil
}

// DeleteByID 按ID删除摘要
func (r *SummaryRepository) DeleteByID(ctx context.Context, id int64) error {
	query := `DELETE FROM user_analysis_summaries WHERE id = $1`
	result, err := database.Pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete summary: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("summary not found")
	}
	return nil
}

// UpdateByID 按ID更新摘要的 insights
func (r *SummaryRepository) UpdateByID(ctx context.Context, id int64, insights map[string]interface{}) error {
	insightsJSON, _ := json.Marshal(insights)
	query := `UPDATE user_analysis_summaries SET insights = $1::jsonb, created_at = NOW() WHERE id = $2`
	result, err := database.Pool.Exec(ctx, query, insightsJSON, id)
	if err != nil {
		return fmt.Errorf("failed to update summary: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("summary not found")
	}
	return nil
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

// GetDatesWithoutDailySummary 获取用户有称重记录但还没有日报的日期列表（按日期倒序）
func (r *SummaryRepository) GetDatesWithoutDailySummary(ctx context.Context, userID int, since time.Time, limit int) ([]time.Time, error) {
	query := `
		SELECT d.record_date
		FROM (
			SELECT DISTINCT DATE(created_at) AS record_date
			FROM weigh_records
			WHERE user_id = $1 AND created_at >= $2
		) d
		LEFT JOIN user_analysis_summaries s
			ON s.user_id = $1 AND s.summary_date = d.record_date AND s.summary_type = 'daily'
		WHERE s.id IS NULL
		ORDER BY d.record_date DESC
		LIMIT $3`

	rows, err := database.Pool.Query(ctx, query, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get dates without daily summary: %w", err)
	}
	defer rows.Close()

	var dates []time.Time
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			continue
		}
		dates = append(dates, t)
	}
	return dates, nil
}

// GetWeekStartsWithoutWeeklySummary 获取有日报但没有周报的周起始日期
func (r *SummaryRepository) GetWeekStartsWithoutWeeklySummary(ctx context.Context, userID int, since time.Time, limit int) ([]time.Time, error) {
	query := `
		SELECT d.week_start
		FROM (
			SELECT DISTINCT
				(DATE_TRUNC('week', summary_date)::date) AS week_start
			FROM user_analysis_summaries
			WHERE user_id = $1 AND summary_type = 'daily' AND summary_date >= $2
		) d
		LEFT JOIN user_analysis_summaries s
			ON s.user_id = $1 AND s.summary_date = d.week_start AND s.summary_type = 'weekly'
		WHERE s.id IS NULL
		ORDER BY d.week_start ASC
		LIMIT $3`

	rows, err := database.Pool.Query(ctx, query, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get weeks without weekly summary: %w", err)
	}
	defer rows.Close()

	var weeks []time.Time
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			continue
		}
		weeks = append(weeks, t)
	}
	return weeks, nil
}

// GetMonthStartsWithoutMonthlySummary 获取有周报但没有月报的月起始日期
func (r *SummaryRepository) GetMonthStartsWithoutMonthlySummary(ctx context.Context, userID int, since time.Time, limit int) ([]time.Time, error) {
	query := `
		SELECT d.month_start
		FROM (
			SELECT DISTINCT
				(DATE_TRUNC('month', summary_date)::date) AS month_start
			FROM user_analysis_summaries
			WHERE user_id = $1 AND summary_type = 'weekly' AND summary_date >= $2
		) d
		LEFT JOIN user_analysis_summaries s
			ON s.user_id = $1 AND s.summary_date = d.month_start AND s.summary_type = 'monthly'
		WHERE s.id IS NULL
		ORDER BY d.month_start ASC
		LIMIT $3`

	rows, err := database.Pool.Query(ctx, query, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get months without monthly summary: %w", err)
	}
	defer rows.Close()

	var months []time.Time
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			continue
		}
		months = append(months, t)
	}
	return months, nil
}

// GetYearStartsWithoutYearlySummary 获取有月报但没有年报的年起止日期
func (r *SummaryRepository) GetYearStartsWithoutYearlySummary(ctx context.Context, userID int, since time.Time, limit int) ([]time.Time, error) {
	query := `
		SELECT d.year_start
		FROM (
			SELECT DISTINCT
				(DATE_TRUNC('year', summary_date)::date) AS year_start
			FROM user_analysis_summaries
			WHERE user_id = $1 AND summary_type = 'monthly' AND summary_date >= $2
		) d
		LEFT JOIN user_analysis_summaries s
			ON s.user_id = $1 AND s.summary_date = d.year_start AND s.summary_type = 'yearly'
		WHERE s.id IS NULL
		ORDER BY d.year_start ASC
		LIMIT $3`

	rows, err := database.Pool.Query(ctx, query, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get years without yearly summary: %w", err)
	}
	defer rows.Close()

	var years []time.Time
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			continue
		}
		years = append(years, t)
	}
	return years, nil
}
