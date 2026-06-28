package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/repository"
	"smart-scale-backend/pkg/dashscope"

	"github.com/sirupsen/logrus"
)

type SummaryService struct {
	mealRepo       *repository.MealRepository
	summaryRepo    *repository.SummaryRepository
	embedRepo      *repository.EmbeddingRepository
	embeddingSvc   *EmbeddingService
	foodRepo       *repository.FoodRepository
	cfg            *config.Config
}

func NewSummaryService(
	mealRepo *repository.MealRepository,
	summaryRepo *repository.SummaryRepository,
	embedRepo *repository.EmbeddingRepository,
	embeddingSvc *EmbeddingService,
	foodRepo *repository.FoodRepository,
	cfg *config.Config,
) *SummaryService {
	return &SummaryService{
		mealRepo:     mealRepo,
		summaryRepo:  summaryRepo,
		embedRepo:    embedRepo,
		embeddingSvc: embeddingSvc,
		foodRepo:     foodRepo,
		cfg:          cfg,
	}
}

// GenerateSummary 生成营养分析摘要
func (s *SummaryService) GenerateSummary(ctx context.Context, userID int, summaryType string) (*model.AnalysisSummary, error) {
	now := time.Now()
	var periodStart, periodEnd time.Time
	var summaryDate time.Time

	// 根据类型计算时间范围
	switch summaryType {
	case "daily":
		periodStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		periodEnd = periodStart.AddDate(0, 0, 1)
		summaryDate = periodStart
	case "weekly":
		weekday := now.Weekday()
		daysSinceMonday := (int(weekday) + 6) % 7 // 周一为第0天
		periodStart = time.Date(now.Year(), now.Month(), now.Day()-daysSinceMonday, 0, 0, 0, 0, now.Location())
		periodEnd = periodStart.AddDate(0, 0, 7)
		summaryDate = periodStart
	case "monthly":
		periodStart = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		periodEnd = periodStart.AddDate(0, 1, 0)
		summaryDate = periodStart
	case "yearly":
		periodStart = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		periodEnd = periodStart.AddDate(1, 0, 0)
		summaryDate = periodStart
	default:
		return nil, fmt.Errorf("unsupported summary type: %s", summaryType)
	}

	// 获取时间范围内的称重记录
	records, err := s.mealRepo.QueryRecordsByDateRange(ctx, userID, periodStart, periodEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to query records: %w", err)
	}

	// 构建摘要洞察数据
	insights := s.buildInsights(ctx, records, periodStart, periodEnd, summaryType)

	// 创建摘要对象
	summary := &model.AnalysisSummary{
		UserID:      userID,
		SummaryDate: summaryDate,
		SummaryType: summaryType,
		Source:      "manual",
		Insights:    insights,
	}

	// 保存到数据库
	if err := s.summaryRepo.Create(ctx, summary); err != nil {
		return nil, fmt.Errorf("failed to save summary: %w", err)
	}

	// 异步向量化并存储嵌入（用于RAG检索）
	go func() {
		bgCtx := context.Background()
		contentText := s.formatSummaryAsText(userID, insights, summaryType)
		embedding, embErr := s.embeddingSvc.GenerateEmbedding(contentText)
		if embErr != nil {
			logrus.WithError(embErr).Warn("Failed to generate embedding for summary")
			return
		}

		emb := &model.UserHealthEmbedding{
			UserID:      userID,
			SourceType:  summaryType + "_summary",
			SourceDate:  summaryDate,
			ContentText: contentText,
			Embedding:   embedding,
			Metadata: map[string]interface{}{
				"type":           summaryType,
				"record_count":   len(records),
				"total_energy":   insights["total_energy_kcal"],
				"generated_at":   time.Now().Format(time.RFC3339),
			},
		}
		if embErr := s.embedRepo.Save(bgCtx, emb); embErr != nil {
			logrus.WithError(embErr).Warn("Failed to save summary embedding")
		} else {
			logrus.Infof("Saved embedding for %s summary of user %d", summaryType, userID)
		}
	}()

	return summary, nil
}

// buildInsights 从称重记录构建洞察数据
func (s *SummaryService) buildInsights(ctx context.Context, records []*model.WeighRecord, start, end time.Time, summaryType string) map[string]interface{} {
	insights := make(map[string]interface{})
	insights["period_start"] = start.Format("2006-01-02")
	insights["period_end"] = end.Format("2006-01-02")
	insights["total_meals"] = len(records)

	var totalEnergy, totalProtein, totalFat, totalCarb float64
	var totalSodium, totalCholesterol, totalVitaminC, totalCalcium, totalIron, totalPotassium float64
	foodFreq := make(map[string]int)
	foodWeight := make(map[string]float64)

	for _, rec := range records {
		if rec.CookedEnergyKcal != nil {
			totalEnergy += *rec.CookedEnergyKcal
		}
		if rec.CookedProteinG != nil {
			totalProtein += *rec.CookedProteinG
		}
		if rec.CookedFatG != nil {
			totalFat += *rec.CookedFatG
		}
		if rec.CookedCarbohydrateG != nil {
			totalCarb += *rec.CookedCarbohydrateG
		}
		if rec.CookedSodiumMg != nil {
			totalSodium += *rec.CookedSodiumMg
		}
		if rec.CookedCholesterolMg != nil {
			totalCholesterol += *rec.CookedCholesterolMg
		}
		if rec.CookedVitaminCMg != nil {
			totalVitaminC += *rec.CookedVitaminCMg
		}
		if rec.CookedCalciumMg != nil {
			totalCalcium += *rec.CookedCalciumMg
		}
		if rec.CookedIronMg != nil {
			totalIron += *rec.CookedIronMg
		}
		if rec.CookedPotassiumMg != nil {
			totalPotassium += *rec.CookedPotassiumMg
		}
		for i, ing := range rec.Ingredients {
			foodFreq[ing]++
			if i < len(rec.RawWeightsG) {
				foodWeight[ing] += rec.RawWeightsG[i]
			}
		}
	}

	insights["total_energy_kcal"] = math.Round(totalEnergy*100) / 100
	insights["total_protein_g"] = math.Round(totalProtein*100) / 100
	insights["total_fat_g"] = math.Round(totalFat*100) / 100
	insights["total_carbohydrate_g"] = math.Round(totalCarb*100) / 100
	insights["total_sodium_mg"] = math.Round(totalSodium*100) / 100
	insights["total_cholesterol_mg"] = math.Round(totalCholesterol*100) / 100
	insights["total_vitamin_c_mg"] = math.Round(totalVitaminC*100) / 100
	insights["total_calcium_mg"] = math.Round(totalCalcium*100) / 100
	insights["total_iron_mg"] = math.Round(totalIron*100) / 100
	insights["total_potassium_mg"] = math.Round(totalPotassium*100) / 100

	// 计算日均热量
	durationDays := end.Sub(start).Hours() / 24
	if durationDays > 0 {
		insights["avg_daily_energy_kcal"] = math.Round((totalEnergy/durationDays)*100) / 100
	}

	// Top Foods 排行
	nameMap, _ := s.foodRepo.GetAllNameMappings(ctx)
	topFoods := make([]model.FoodFrequency, 0, min(10, len(foodFreq)))
	for name, count := range foodFreq {
		cnName := name
		if n, ok := nameMap[name]; ok && n != "" {
			cnName = n
		}
		topFoods = append(topFoods, model.FoodFrequency{
			NameEn:       name,
			Name:         cnName,
			Count:        count,
			TotalWeightG: math.Round(foodWeight[name]*100) / 100,
		})
	}
	// 按出现次数排序
	sortFoods(topFoods)
	if len(topFoods) > 10 {
		topFoods = topFoods[:10]
	}
	insights["top_foods"] = topFoods

	// 生成简单建议
	insights["recommendations"] = s.generateRecommendations(totalEnergy, totalProtein, totalFat, totalCarb, durationDays)

	return insights
}

// formatSummaryAsText 将摘要格式化为文本用于向量化
func (s *SummaryService) formatSummaryAsText(userID int, insights map[string]interface{}, summaryType string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【%s营养分析摘要】用户%d\n", summaryType, userID))
	sb.WriteString(fmt.Sprintf("时间段: %s ~ %s\n", insights["period_start"], insights["period_end"]))
	sb.WriteString(fmt.Sprintf("餐次总数: %d\n", insights["total_meals"]))
	if e, ok := insights["total_energy_kcal"].(float64); ok {
		sb.WriteString(fmt.Sprintf("总热量: %.1fkcal\n", e))
	}
	if p, ok := insights["total_protein_g"].(float64); ok {
		sb.WriteString(fmt.Sprintf("总蛋白质: %.1fg\n", p))
	}
	if f, ok := insights["total_fat_g"].(float64); ok {
		sb.WriteString(fmt.Sprintf("总脂肪: %.1fg\n", f))
	}
	if c, ok := insights["total_carbohydrate_g"].(float64); ok {
		sb.WriteString(fmt.Sprintf("总碳水: %.1fg\n", c))
	}
	if a, ok := insights["avg_daily_energy_kcal"].(float64); ok {
		sb.WriteString(fmt.Sprintf("日均热量: %.1fkcal\n", a))
	}
	if tf, ok := insights["top_foods"].([]model.FoodFrequency); ok {
		sb.WriteString("常吃食物: ")
		for i, f := range tf {
			if i > 0 {
				sb.WriteString(", ")
			}
			sb.WriteString(fmt.Sprintf("%s(%d次)", f.NameEn, f.Count))
		}
		sb.WriteString("\n")
	}
	return sb.String()
}

// generateRecommendations 基于营养数据的简单建议
func (s *SummaryService) generateRecommendations(energy, protein, fat, carb float64, durationDays float64) []string {
	var recs []string
	if durationDays > 0 {
		avgEnergy := energy / durationDays
		switch {
		case avgEnergy < 1400:
			recs = append(recs, "日均热量偏低，建议适当增加优质蛋白质和健康脂肪的摄入")
		case avgEnergy > 2800:
			recs = append(recs, "日均热量偏高，建议控制高油高糖食物的份量，增加蔬菜摄入")
		}
	}
	totalMacro := protein + fat + carb
	if totalMacro > 0 {
		proteinPct := protein / totalMacro * 100
		fatPct := fat / totalMacro * 100
		carbPct := carb / totalMacro * 100
		if proteinPct < 15 {
			recs = append(recs, "蛋白质占比偏低，建议增加鱼、肉、蛋、奶、豆制品等优质蛋白来源")
		}
		if fatPct > 35 {
			recs = append(recs, "脂肪占比偏高，建议减少油炸食品和肥肉的摄入")
		}
		if carbPct > 65 {
			recs = append(recs, "碳水化合物占比偏高，建议将部分精制主食替换为全谷物")
		}
	}
	if len(recs) == 0 {
		recs = append(recs, "当前饮食结构较为均衡，请继续保持良好饮食习惯")
	}
	return recs
}

// GetSummaries 获取用户的摘要列表
func (s *SummaryService) GetSummaries(ctx context.Context, userID int, summaryType string, limit int) ([]*model.AnalysisSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	return s.summaryRepo.FindByUserAndType(ctx, userID, summaryType, limit)
}

// GetSummariesPaged 分页获取摘要列表
func (s *SummaryService) GetSummariesPaged(ctx context.Context, userID int, summaryType string, page, pageSize int) ([]*model.AnalysisSummary, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 10
	}
	return s.summaryRepo.FindByUserAndTypePaged(ctx, userID, summaryType, page, pageSize)
}

// DeleteAllSummaries 清除用户全部报告（测试用）
func (s *SummaryService) DeleteAllSummaries(ctx context.Context, userID int) (int64, error) {
	return s.summaryRepo.DeleteAllByUser(ctx, userID)
}

// RunArchiveJob 分层归档任务
// 规则：原始>1月 -> daily汇总; daily>3月 -> weekly; weekly>1年 -> monthly; monthly>3年 -> yearly
func (s *SummaryService) RunArchiveJob(ctx context.Context) error {
	logrus.Info("Starting archive job...")

	now := time.Now()
	oneMonthAgo := now.AddDate(0, -1, 0)
	threeMonthsAgo := now.AddDate(0, -3, 0)
	oneYearAgo := now.AddDate(-1, 0, 0)
	threeYearsAgo := now.AddDate(-3, 0, 0)

	// Step 1: 原始称重记录 > 1月 -> 聚合为日度汇总
	if err := s.archiveRawToDaily(ctx, oneMonthAgo); err != nil {
		logrus.WithError(err).Error("Failed to archive raw -> daily")
	}

	// Step 2: 日度汇总 > 3月 -> 聚合为周度汇总
	if err := s.archiveDailyToWeekly(ctx, threeMonthsAgo); err != nil {
		logrus.WithError(err).Error("Failed to archive daily -> weekly")
	}

	// Step 3: 周度汇总 > 1年 -> 聚合为月度汇总
	if err := s.archiveWeeklyToMonthly(ctx, oneYearAgo); err != nil {
		logrus.WithError(err).Error("Failed to archive weekly -> monthly")
	}

	// Step 4: 月度汇总 > 3年 -> 聚合为年度汇总
	if err := s.archiveMonthlyToYearly(ctx, threeYearsAgo); err != nil {
		logrus.WithError(err).Error("Failed to archive monthly -> yearly")
	}

	logrus.Info("Archive job completed")
	return nil
}

// archiveRawToDaily 将超过1个月的原始称重记录聚合为日度汇总
func (s *SummaryService) archiveRawToDaily(ctx context.Context, threshold time.Time) error {
	// 获取需要归档的用户列表（有超过1个月未归档记录的用户）
	users, err := s.mealRepo.GetUsersWithRecordsBefore(ctx, threshold)
	if err != nil {
		return fmt.Errorf("failed to get users for raw->daily archive: %w", err)
	}

	for _, userID := range users {
		// 获取该用户在归档阈值之前的记录，按天聚合
		records, err := s.mealRepo.QueryRecordsByDateRange(ctx, userID, threshold.AddDate(-1, 0, 0), threshold)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to query records for user %d", userID)
			continue
		}

		// 按天分组聚合
		dayMap := make(map[string][]*model.WeighRecord)
		for _, r := range records {
			date := r.CreatedAt.Format("2006-01-02")
			dayMap[date] = append(dayMap[date], r)
		}

		// 为每一天创建 daily summary
		for dateStr, dayRecords := range dayMap {
			date, _ := time.Parse("2006-01-02", dateStr)
			// 检查是否已存在
			existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, date, "daily")
			if existing != nil {
				continue // 已有日度汇总，跳过
			}

			insights := s.buildInsights(ctx, dayRecords, date, date.AddDate(0, 0, 1), "daily")
			summary := &model.AnalysisSummary{
				UserID:      userID,
				SummaryDate: date,
				SummaryType: "daily",
				Source:      "auto",
				Insights:    insights,
			}
			if err := s.summaryRepo.Create(ctx, summary); err != nil {
				logrus.WithError(err).Warnf("Failed to save daily summary for user %d date %s", userID, dateStr)
			}
		}

		logrus.Infof("Archived raw -> daily for user %d: %d days", userID, len(dayMap))
	}
	return nil
}

// archiveDailyToWeekly 将超过3个月的日度汇总聚合为周度汇总
func (s *SummaryService) archiveDailyToWeekly(ctx context.Context, threshold time.Time) error {
	users, err := s.mealRepo.GetUsersWithSummariesBefore(ctx, threshold, "daily")
	if err != nil {
		return fmt.Errorf("failed to get users for daily->weekly archive: %w", err)
	}

	for _, userID := range users {
		dailySummaries, err := s.summaryRepo.FindByUserAndType(ctx, userID, "daily", 100)
		if err != nil {
			continue
		}

		// 过滤出超过阈值的
		var oldSummaries []*model.AnalysisSummary
		for _, sum := range dailySummaries {
			if sum.SummaryDate.Before(threshold) {
				oldSummaries = append(oldSummaries, sum)
			}
		}
		if len(oldSummaries) == 0 {
			continue
		}

		// 按周分组
		weekMap := make(map[string][]*model.AnalysisSummary)
		for _, sum := range oldSummaries {
			weekday := sum.SummaryDate.Weekday()
			daysSinceMonday := (int(weekday) + 6) % 7
			weekStart := sum.SummaryDate.AddDate(0, 0, -daysSinceMonday)
			weekKey := weekStart.Format("2006-01-02")
			weekMap[weekKey] = append(weekMap[weekKey], sum)
		}

		for weekKey, weekSummaries := range weekMap {
			weekStart, _ := time.Parse("2006-01-02", weekKey)
			existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, weekStart, "weekly")
			if existing != nil {
				continue
			}

			// 聚合这一周的所有日度数据
			mergedInsights := s.mergeInsights(ctx, weekSummaries, "weekly")
			weekEnd := periodEndInclusive(weekStart, "weekly")
			mergedInsights["period_start"] = weekStart.Format("2006-01-02")
			mergedInsights["period_end"] = weekEnd.Format("2006-01-02")
			summary := &model.AnalysisSummary{
				UserID:      userID,
				SummaryDate: weekStart,
				SummaryType: "weekly",
				Source:      "auto",
				Insights:    mergedInsights,
			}
			if err := s.summaryRepo.Create(ctx, summary); err != nil {
				logrus.WithError(err).Warnf("Failed to save weekly summary for user %d week %s", userID, weekKey)
			}
		}

		logrus.Infof("Archived daily -> weekly for user %d: %d weeks", userID, len(weekMap))
	}
	return nil
}

// archiveWeeklyToMonthly 将超过1年的周度汇总聚合为月度汇总
func (s *SummaryService) archiveWeeklyToMonthly(ctx context.Context, threshold time.Time) error {
	users, err := s.mealRepo.GetUsersWithSummariesBefore(ctx, threshold, "weekly")
	if err != nil {
		return fmt.Errorf("failed to get users for weekly->monthly archive: %w", err)
	}

	for _, userID := range users {
		weeklySummaries, err := s.summaryRepo.FindByUserAndType(ctx, userID, "weekly", 100)
		if err != nil {
			continue
		}

		var oldSummaries []*model.AnalysisSummary
		for _, sum := range weeklySummaries {
			if sum.SummaryDate.Before(threshold) {
				oldSummaries = append(oldSummaries, sum)
			}
		}
		if len(oldSummaries) == 0 {
			continue
		}

		// 按月分组
		monthMap := make(map[string][]*model.AnalysisSummary)
		for _, sum := range oldSummaries {
			monthStart := time.Date(sum.SummaryDate.Year(), sum.SummaryDate.Month(), 1, 0, 0, 0, 0, sum.SummaryDate.Location())
			monthKey := monthStart.Format("2006-01")
			monthMap[monthKey] = append(monthMap[monthKey], sum)
		}

		for monthKey, monthSummaries := range monthMap {
			monthStart, _ := time.Parse("2006-01", monthKey)
			existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, monthStart, "monthly")
			if existing != nil {
				continue
			}

			mergedInsights := s.mergeInsights(ctx, monthSummaries, "monthly")
			monthEnd := periodEndInclusive(monthStart, "monthly")
			mergedInsights["period_start"] = monthStart.Format("2006-01-02")
			mergedInsights["period_end"] = monthEnd.Format("2006-01-02")
			summary := &model.AnalysisSummary{
				UserID:      userID,
				SummaryDate: monthStart,
				SummaryType: "monthly",
				Source:      "auto",
				Insights:    mergedInsights,
			}
			if err := s.summaryRepo.Create(ctx, summary); err != nil {
				logrus.WithError(err).Warnf("Failed to save monthly summary for user %d month %s", userID, monthKey)
			}
		}

		logrus.Infof("Archived weekly -> monthly for user %d: %d months", userID, len(monthMap))
	}
	return nil
}

// archiveMonthlyToYearly 将超过3年的月度汇总聚合为年度汇总
func (s *SummaryService) archiveMonthlyToYearly(ctx context.Context, threshold time.Time) error {
	users, err := s.mealRepo.GetUsersWithSummariesBefore(ctx, threshold, "monthly")
	if err != nil {
		return fmt.Errorf("failed to get users for monthly->yearly archive: %w", err)
	}

	for _, userID := range users {
		monthlySummaries, err := s.summaryRepo.FindByUserAndType(ctx, userID, "monthly", 100)
		if err != nil {
			continue
		}

		var oldSummaries []*model.AnalysisSummary
		for _, sum := range monthlySummaries {
			if sum.SummaryDate.Before(threshold) {
				oldSummaries = append(oldSummaries, sum)
			}
		}
		if len(oldSummaries) == 0 {
			continue
		}

		// 按年分组
		yearMap := make(map[int][]*model.AnalysisSummary)
		for _, sum := range oldSummaries {
			yearMap[sum.SummaryDate.Year()] = append(yearMap[sum.SummaryDate.Year()], sum)
		}

		for year, yearSummaries := range yearMap {
			yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.Now().Location())
			existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, yearStart, "yearly")
			if existing != nil {
				continue
			}

			mergedInsights := s.mergeInsights(ctx, yearSummaries, "yearly")
			yearEnd := periodEndInclusive(yearStart, "yearly")
			mergedInsights["period_start"] = yearStart.Format("2006-01-02")
			mergedInsights["period_end"] = yearEnd.Format("2006-01-02")
			summary := &model.AnalysisSummary{
				UserID:      userID,
				SummaryDate: yearStart,
				SummaryType: "yearly",
				Source:      "auto",
				Insights:    mergedInsights,
			}
			if err := s.summaryRepo.Create(ctx, summary); err != nil {
				logrus.WithError(err).Warnf("Failed to save yearly summary for user %d year %d", userID, year)
			}
		}

		logrus.Infof("Archived monthly -> yearly for user %d: %d years", userID, len(yearMap))
	}
	return nil
}

// periodEndInclusive 计算周期的结束日期（inclusive：包含当天）
// weekly: start + 6 天（周一到周日，共7天）
// monthly: 当月最后一天
// yearly: 当年12月31日
func periodEndInclusive(start time.Time, summaryType string) time.Time {
	switch summaryType {
	case "weekly":
		return start.AddDate(0, 0, 6)
	case "monthly":
		return start.AddDate(0, 1, -1)
	case "yearly":
		return time.Date(start.Year(), 12, 31, 0, 0, 0, 0, start.Location())
	default:
		return start
	}
}

// isPeriodComplete 判断周期是否已完整结束（即当前日期已超过周期结束日）
func isPeriodComplete(periodEnd time.Time) bool {
	return time.Now().After(periodEnd)
}

// mergeInsights 将多条摘要的 insights 合并
func (s *SummaryService) mergeInsights(ctx context.Context, summaries []*model.AnalysisSummary, targetType string) map[string]interface{} {
	insights := make(map[string]interface{})

	var totalEnergy, totalProtein, totalFat, totalCarb float64
	var totalSodium, totalCholesterol, totalVitaminC, totalCalcium, totalIron, totalPotassium float64
	var totalMeals int
	foodFreq := make(map[string]int)
	var earliestStart, latestEnd string // 真正的最早开始和最晚结束

	for _, sum := range summaries {
		ins := sum.Insights
		if ins == nil {
			continue
		}
		if v, ok := ins["total_energy_kcal"].(float64); ok {
			totalEnergy += v
		}
		if v, ok := ins["total_protein_g"].(float64); ok {
			totalProtein += v
		}
		if v, ok := ins["total_fat_g"].(float64); ok {
			totalFat += v
		}
		if v, ok := ins["total_carbohydrate_g"].(float64); ok {
			totalCarb += v
		}
		if v, ok := ins["total_sodium_mg"].(float64); ok {
			totalSodium += v
		}
		if v, ok := ins["total_cholesterol_mg"].(float64); ok {
			totalCholesterol += v
		}
		if v, ok := ins["total_vitamin_c_mg"].(float64); ok {
			totalVitaminC += v
		}
		if v, ok := ins["total_calcium_mg"].(float64); ok {
			totalCalcium += v
		}
		if v, ok := ins["total_iron_mg"].(float64); ok {
			totalIron += v
		}
		if v, ok := ins["total_potassium_mg"].(float64); ok {
			totalPotassium += v
		}
		if v, ok := ins["total_meals"].(float64); ok {
			totalMeals += int(v)
		} else if v, ok := ins["total_meals"].(int); ok {
			totalMeals += v
		}
		// 合并高频食物（优先用英文名作为 key，避免中英文混用）
		if tf, ok := ins["top_foods"].([]interface{}); ok {
			for _, item := range tf {
				if m, ok := item.(map[string]interface{}); ok {
					nameEn := ""
					if n, ok := m["name_en"].(string); ok && n != "" {
						nameEn = n
					} else if n, ok := m["name"].(string); ok {
						nameEn = n
					}
					if nameEn != "" {
						if cnt, ok := m["count"].(float64); ok {
							foodFreq[nameEn] += int(cnt)
						}
					}
				}
			}
		}

		// 正确追踪最早/最晚日期（不管排序方向）
		if ps, ok := ins["period_start"].(string); ok && ps != "" {
			if earliestStart == "" || ps < earliestStart {
				earliestStart = ps
			}
		}
		if pe, ok := ins["period_end"].(string); ok && pe != "" {
			if latestEnd == "" || pe > latestEnd {
				latestEnd = pe
			}
		}
	}

	insights["period_start"] = earliestStart
	insights["period_end"] = latestEnd
	insights["total_meals"] = totalMeals
	insights["total_energy_kcal"] = math.Round(totalEnergy*100) / 100
	insights["total_protein_g"] = math.Round(totalProtein*100) / 100
	insights["total_fat_g"] = math.Round(totalFat*100) / 100
	insights["total_carbohydrate_g"] = math.Round(totalCarb*100) / 100
	insights["total_sodium_mg"] = math.Round(totalSodium*100) / 100
	insights["total_cholesterol_mg"] = math.Round(totalCholesterol*100) / 100
	insights["total_vitamin_c_mg"] = math.Round(totalVitaminC*100) / 100
	insights["total_calcium_mg"] = math.Round(totalCalcium*100) / 100
	insights["total_iron_mg"] = math.Round(totalIron*100) / 100
	insights["total_potassium_mg"] = math.Round(totalPotassium*100) / 100

	// 计算日均
	durationDays := 1.0
	switch targetType {
	case "weekly":
		durationDays = 7
	case "monthly":
		durationDays = 30
	case "yearly":
		durationDays = 365
	}
	if len(summaries) > 0 {
		durationDays = float64(len(summaries)) * durationDays / float64(len(summaries))
	}
	if durationDays > 0 {
		insights["avg_daily_energy_kcal"] = math.Round((totalEnergy/durationDays)*100) / 100
	}

	// Top foods
	nameMap, _ := s.foodRepo.GetAllNameMappings(ctx)
	topFoods := make([]model.FoodFrequency, 0, 10)
	for name, count := range foodFreq {
		cnName := name
		if n, ok := nameMap[name]; ok && n != "" {
			cnName = n
		}
		topFoods = append(topFoods, model.FoodFrequency{NameEn: name, Name: cnName, Count: count})
	}
	sortFoods(topFoods)
	if len(topFoods) > 10 {
		topFoods = topFoods[:10]
	}
	insights["top_foods"] = topFoods
	insights["recommendations"] = s.generateRecommendations(totalEnergy, totalProtein, totalFat, totalCarb, durationDays)

	return insights
}

// sortFoods 按频率排序（简单冒泡排序）
func sortFoods(foods []model.FoodFrequency) {
	n := len(foods)
	for i := 0; i < n-1; i++ {
		for j := 0; j < n-i-1; j++ {
			if foods[j].Count < foods[j+1].Count {
				foods[j], foods[j+1] = foods[j+1], foods[j]
			}
		}
	}
}

// DeleteSummary 删除指定ID的摘要
func (s *SummaryService) DeleteSummary(ctx context.Context, userID int, summaryID int64) error {
	// 先查出归属确认
	existing, err := s.summaryRepo.FindByID(ctx, summaryID)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("summary not found")
	}
	if existing.UserID != userID {
		return fmt.Errorf("summary does not belong to this user")
	}
	return s.summaryRepo.DeleteByID(ctx, summaryID)
}

// DeleteAllExceptDaily 删除用户除日报外的全部摘要
func (s *SummaryService) DeleteAllExceptDaily(ctx context.Context, userID int) (int64, error) {
	return s.summaryRepo.DeleteAllByUserExceptDaily(ctx, userID)
}

// GenerateNextMissingSummary 生成下一条缺失的摘要（从最远到最近）
func (s *SummaryService) GenerateNextMissingSummary(ctx context.Context, userID int, summaryType string) (*model.AnalysisSummary, error) {
	switch summaryType {
	case "daily":
		return s.GenerateSummary(ctx, userID, "daily")
	case "weekly":
		return s.generateNextMissingWeekly(ctx, userID)
	case "monthly":
		return s.generateNextMissingMonthly(ctx, userID)
	case "yearly":
		return s.generateNextMissingYearly(ctx, userID)
	default:
		return nil, fmt.Errorf("unsupported summary type: %s", summaryType)
	}
}

// generateNextMissingWeekly 生成最旧的缺失周报（跳过未满7天的不完整周期）
func (s *SummaryService) generateNextMissingWeekly(ctx context.Context, userID int) (*model.AnalysisSummary, error) {
	oldest, err := s.mealRepo.GetOldestRecordDate(ctx, userID)
	if err != nil || oldest == nil {
		return nil, fmt.Errorf("no records found")
	}

	// 多取几个候选，跳过尚未结束的周期
	weekStarts, _ := s.summaryRepo.GetWeekStartsWithoutWeeklySummary(ctx, userID, *oldest, 20)
	for _, ws := range weekStarts {
		weekEnd := periodEndInclusive(ws, "weekly") // 周一到周日（inclusive）
		if !isPeriodComplete(weekEnd) {
			continue // 周期未结束，跳过避免数据失真
		}
		dailies, _ := s.summaryRepo.FindByDateRange(ctx, userID, "daily", ws, weekEnd)
		if len(dailies) == 0 {
			continue
		}

		merged := s.mergeInsights(ctx, dailies, "weekly")
		merged["period_start"] = ws.Format("2006-01-02")
		merged["period_end"] = weekEnd.Format("2006-01-02")
		wSummary := &model.AnalysisSummary{
			UserID: userID, SummaryDate: ws, SummaryType: "weekly", Source: "auto", Insights: merged,
		}
		if err := s.summaryRepo.Create(ctx, wSummary); err != nil {
			return nil, fmt.Errorf("failed to save weekly summary: %w", err)
		}
		logrus.Infof("Generated next missing weekly summary for user %d starting %s", userID, ws.Format("2006-01-02"))
		return wSummary, nil
	}
	return nil, nil
}

// generateNextMissingMonthly 生成最旧的缺失月报（跳过未满月的不完整周期）
func (s *SummaryService) generateNextMissingMonthly(ctx context.Context, userID int) (*model.AnalysisSummary, error) {
	oldest, err := s.mealRepo.GetOldestRecordDate(ctx, userID)
	if err != nil || oldest == nil {
		return nil, fmt.Errorf("no records found")
	}

	monthStarts, _ := s.summaryRepo.GetMonthStartsWithoutMonthlySummary(ctx, userID, *oldest, 20)
	for _, ms := range monthStarts {
		monthEnd := periodEndInclusive(ms, "monthly") // 月初到月末（inclusive）
		if !isPeriodComplete(monthEnd) {
			continue
		}
		weeklies, _ := s.summaryRepo.FindByDateRange(ctx, userID, "weekly", ms, monthEnd)
		if len(weeklies) == 0 {
			continue
		}

		merged := s.mergeInsights(ctx, weeklies, "monthly")
		merged["period_start"] = ms.Format("2006-01-02")
		merged["period_end"] = monthEnd.Format("2006-01-02")
		mSummary := &model.AnalysisSummary{
			UserID: userID, SummaryDate: ms, SummaryType: "monthly", Source: "auto", Insights: merged,
		}
		if err := s.summaryRepo.Create(ctx, mSummary); err != nil {
			return nil, fmt.Errorf("failed to save monthly summary: %w", err)
		}
		logrus.Infof("Generated next missing monthly summary for user %d starting %s", userID, ms.Format("2006-01"))
		return mSummary, nil
	}
	return nil, nil
}

// generateNextMissingYearly 生成最旧的缺失年报（跳过未满年的不完整周期）
func (s *SummaryService) generateNextMissingYearly(ctx context.Context, userID int) (*model.AnalysisSummary, error) {
	oldest, err := s.mealRepo.GetOldestRecordDate(ctx, userID)
	if err != nil || oldest == nil {
		return nil, fmt.Errorf("no records found")
	}

	yearStarts, _ := s.summaryRepo.GetYearStartsWithoutYearlySummary(ctx, userID, *oldest, 20)
	for _, ys := range yearStarts {
		yearEnd := periodEndInclusive(ys, "yearly") // 1月1日到12月31日（inclusive）
		if !isPeriodComplete(yearEnd) {
			continue
		}
		monthlies, _ := s.summaryRepo.FindByDateRange(ctx, userID, "monthly", ys, yearEnd)
		if len(monthlies) == 0 {
			continue
		}

		merged := s.mergeInsights(ctx, monthlies, "yearly")
		merged["period_start"] = ys.Format("2006-01-02")
		merged["period_end"] = yearEnd.Format("2006-01-02")
		ySummary := &model.AnalysisSummary{
			UserID: userID, SummaryDate: ys, SummaryType: "yearly", Source: "auto", Insights: merged,
		}
		if err := s.summaryRepo.Create(ctx, ySummary); err != nil {
			return nil, fmt.Errorf("failed to save yearly summary: %w", err)
		}

		logrus.Infof("Generated next missing yearly summary for user %d starting %s", userID, ys.Format("2006"))
		return ySummary, nil
	}
	return nil, nil
}

// ==================== AI 总结页生成 ====================

// GenerateNextMissingSummaryWithAI 智能生成：
// 1. 若有缺失的数据报告（周/月/年），先生成最旧的那条（不含AI）
// 2. 若数据报告齐全，找到最近一条缺AI总结的报告，生成AI总结并覆盖insights
func (s *SummaryService) GenerateNextMissingSummaryWithAI(ctx context.Context, userID int, summaryType string) (*model.AnalysisSummary, string, error) {
	// Step 1: 先尝试生成缺失的数据报告
	summary, err := s.GenerateNextMissingSummary(ctx, userID, summaryType)
	if err != nil {
		// "no records found"表示没有缺失的数据报告，继续生成AI总结
		if !strings.Contains(err.Error(), "no records found") {
			return nil, "", err
		}
	}
	if summary != nil {
		return summary, "data", nil // 生成了新的数据报告（尚无AI总结）
	}

	// Step 2: 数据报告齐全，找最近一条缺AI总结的报告
	target, err := s.findNearestReportWithoutAISummary(ctx, userID, summaryType)
	if err != nil {
		return nil, "", err
	}
	if target == nil {
		return nil, "complete", nil // 所有报告都有AI总结了
	}

	// Step 2.5: 修复周期日期（旧数据可能使用了错误的AddDate逻辑）
	if target.Insights == nil {
		target.Insights = make(map[string]interface{})
	}
	correctEnd := periodEndInclusive(target.SummaryDate, summaryType)
	correctEndStr := correctEnd.Format("2006-01-02")
	startStr := target.SummaryDate.Format("2006-01-02")
	// 如果当前period_end错误（不是inclusive end），修正它
	if currentEnd, ok := target.Insights["period_end"].(string); !ok || currentEnd != correctEndStr {
		target.Insights["period_start"] = startStr
		target.Insights["period_end"] = correctEndStr
	}

	// Step 3: 生成AI总结
	aiSummary, aiAdvice, err := s.generateAISummaryForReport(ctx, userID, target)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate AI summary: %w", err)
	}

	// Step 4: 将AI总结写入insights并更新
	target.Insights["ai_summary"] = aiSummary
	target.Insights["ai_advice"] = aiAdvice
	if err := s.summaryRepo.UpdateByID(ctx, target.ID, target.Insights); err != nil {
		return nil, "", fmt.Errorf("failed to save AI summary: %w", err)
	}

	logrus.Infof("Generated AI summary for user %d %s report %s", userID, summaryType, target.SummaryDate.Format("2006-01-02"))
	return target, "ai", nil
}

// findNearestReportWithoutAISummary 从近到远找第一条没有ai_summary字段的周/月/年报
func (s *SummaryService) findNearestReportWithoutAISummary(ctx context.Context, userID int, summaryType string) (*model.AnalysisSummary, error) {
	if summaryType == "daily" {
		return nil, nil // 日报不需要AI总结
	}
	reports, err := s.summaryRepo.FindByUserAndType(ctx, userID, summaryType, 100)
	if err != nil {
		return nil, err
	}
	// reports 已按 summary_date DESC 排序（从近到远）
	for _, r := range reports {
		if r.Insights == nil {
			return r, nil
		}
		if _, hasAI := r.Insights["ai_summary"]; !hasAI {
			return r, nil
		}
	}
	return nil, nil
}

// generateAISummaryForReport 调用 qwen3.6flash 生成AI总结
// 输入：用户个人信息 + 当期饮食数据 + 前一期报告内容（如有）
// 输出：当期总结 + 下期建议
func (s *SummaryService) generateAISummaryForReport(ctx context.Context, userID int, report *model.AnalysisSummary) (string, string, error) {
	// 1. 获取用户画像
	profile, err := s.getUserProfile(ctx, userID)
	if err != nil {
		logrus.WithError(err).Warn("Failed to get user profile, proceeding without it")
	}

	// 2. 获取前一期报告
	prevReport := s.getPreviousPeriodReport(ctx, userID, report.SummaryType, report.SummaryDate)

	// 3. 构建prompt
	prompt := s.buildAISummaryPrompt(report, profile, prevReport)

	// 4. 调用 DashScope
	client := dashscope.NewClient(s.cfg.Aliyun.APIKey)
	model := s.cfg.Aliyun.TextModel
	if model == "" {
		model = "qwen-plus"
	}

	resp, err := client.Responses(&dashscope.ResponsesRequest{
		Model: model,
		Input: []dashscope.Message{
			{Role: "system", Content: "你是专业的营养师AI助手。请根据用户的健康数据和饮食记录，生成简洁、专业、有建设性的营养总结和饮食建议。用中文回答，不要使用emoji。"},
			{Role: "user", Content: prompt},
		},
	})
	if err != nil {
		return "", "", fmt.Errorf("dashscope API call failed: %w", err)
	}

	result := resp.ExtractText()
	if result == "" {
		return "", "", fmt.Errorf("empty response from LLM")
	}

	// 5. 解析返回：尝试分离总结和建议
	summary, advice := parseAIResponse(result)
	return summary, advice, nil
}

// getUserProfile 直接查询用户画像
func (s *SummaryService) getUserProfile(ctx context.Context, userID int) (*model.UserProfile, error) {
	query := `SELECT user_id, gender, age, height_cm, weight_kg, health_goal, allergies
	          FROM user_profiles WHERE user_id = $1`
	var p model.UserProfile
	var age *int
	var heightCm, weightKg *float64
	var healthGoal *string
	var allergiesJSON []byte

	err := database.Pool.QueryRow(ctx, query, userID).Scan(
		&p.UserID, &p.Gender, &age, &heightCm, &weightKg, &healthGoal, &allergiesJSON,
	)
	if err != nil {
		return nil, err
	}
	p.Age = age
	p.HeightCm = heightCm
	p.WeightKg = weightKg
	if healthGoal != nil {
		p.HealthGoal = *healthGoal
	}
	if allergiesJSON != nil {
		_ = json.Unmarshal(allergiesJSON, &p.Allergies)
	}
	return &p, nil
}

// getPreviousPeriodReport 获取前一期同类型报告
func (s *SummaryService) getPreviousPeriodReport(ctx context.Context, userID int, summaryType string, currentDate time.Time) *model.AnalysisSummary {
	var prevDate time.Time
	switch summaryType {
	case "weekly":
		prevDate = currentDate.AddDate(0, 0, -7)
	case "monthly":
		prevDate = currentDate.AddDate(0, -1, 0)
	case "yearly":
		prevDate = currentDate.AddDate(-1, 0, 0)
	default:
		return nil
	}
	report, _ := s.summaryRepo.FindByUserDateType(ctx, userID, prevDate, summaryType)
	return report
}

// buildAISummaryPrompt 构建AI总结的prompt
func (s *SummaryService) buildAISummaryPrompt(report *model.AnalysisSummary, profile *model.UserProfile, prevReport *model.AnalysisSummary) string {
	typeLabel := map[string]string{"weekly": "周报", "monthly": "月报", "yearly": "年报"}[report.SummaryType]
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("请为以下%s生成营养总结和下期饮食建议。\n\n", typeLabel))

	// 用户信息
	if profile != nil {
		sb.WriteString("## 用户信息\n")
		genderMap := map[string]string{"male": "男", "female": "女"}
		goalMap := map[string]string{"lose_weight": "减脂", "gain_weight": "增重", "maintain": "维持", "muscle_gain": "增肌", "health_maintenance": "健康管理"}
		sb.WriteString(fmt.Sprintf("- 性别：%s，年龄：%d岁，身高：%.0fcm，体重：%.1fkg\n",
			genderMap[profile.Gender], func() int { if profile.Age != nil { return *profile.Age }; return 0 }(),
			func() float64 { if profile.HeightCm != nil { return *profile.HeightCm }; return 0 }(),
			func() float64 { if profile.WeightKg != nil { return *profile.WeightKg }; return 0 }()))
		if profile.HealthGoal != "" {
			sb.WriteString(fmt.Sprintf("- 健康目标：%s\n", goalMap[profile.HealthGoal]))
		}
		if len(profile.Allergies) > 0 {
			sb.WriteString(fmt.Sprintf("- 过敏原：%s\n", strings.Join(profile.Allergies, "、")))
		}
		sb.WriteString("\n")
	}

	// 当期饮食数据
	sb.WriteString(fmt.Sprintf("## 本期饮食数据（%s）\n", typeLabel))
	ins := report.Insights
	if ps, ok := ins["period_start"].(string); ok {
		sb.WriteString(fmt.Sprintf("- 周期：%s ~ ", ps))
		if pe, ok := ins["period_end"].(string); ok {
			sb.WriteString(pe)
		}
		sb.WriteString("\n")
	}
	if v, ok := ins["total_meals"]; ok {
		sb.WriteString(fmt.Sprintf("- 总餐次：%v\n", v))
	}
	if v, ok := ins["total_energy_kcal"]; ok {
		sb.WriteString(fmt.Sprintf("- 总热量：%.1f kcal\n", toFloat(v)))
	}
	if v, ok := ins["avg_daily_energy_kcal"]; ok {
		sb.WriteString(fmt.Sprintf("- 日均热量：%.1f kcal\n", toFloat(v)))
	}
	if v, ok := ins["total_protein_g"]; ok {
		sb.WriteString(fmt.Sprintf("- 总蛋白质：%.1f g\n", toFloat(v)))
	}
	if v, ok := ins["total_fat_g"]; ok {
		sb.WriteString(fmt.Sprintf("- 总脂肪：%.1f g\n", toFloat(v)))
	}
	if v, ok := ins["total_carbohydrate_g"]; ok {
		sb.WriteString(fmt.Sprintf("- 总碳水：%.1f g\n", toFloat(v)))
	}
	// 微量元素
	if v, ok := ins["total_sodium_mg"]; ok {
		sb.WriteString(fmt.Sprintf("- 钠：%.1f mg\n", toFloat(v)))
	}
	if v, ok := ins["total_calcium_mg"]; ok {
		sb.WriteString(fmt.Sprintf("- 钙：%.1f mg\n", toFloat(v)))
	}
	if v, ok := ins["total_iron_mg"]; ok {
		sb.WriteString(fmt.Sprintf("- 铁：%.1f mg\n", toFloat(v)))
	}
	if v, ok := ins["total_potassium_mg"]; ok {
		sb.WriteString(fmt.Sprintf("- 钾：%.1f mg\n", toFloat(v)))
	}
	if v, ok := ins["total_vitamin_c_mg"]; ok {
		sb.WriteString(fmt.Sprintf("- 维生素C：%.1f mg\n", toFloat(v)))
	}
	if v, ok := ins["total_cholesterol_mg"]; ok {
		sb.WriteString(fmt.Sprintf("- 胆固醇：%.1f mg\n", toFloat(v)))
	}
	// 常吃食物
	if tf, ok := ins["top_foods"]; ok {
		sb.WriteString("- 常吃食物：")
		if arr, ok := tf.([]interface{}); ok {
			names := make([]string, 0, len(arr))
			for _, f := range arr {
				if m, ok := f.(map[string]interface{}); ok {
					if name, ok := m["name"].(string); ok && name != "" {
						names = append(names, name)
					}
				}
			}
			if len(names) > 5 {
				names = names[:5]
			}
			sb.WriteString(strings.Join(names, "、"))
		}
		sb.WriteString("\n")
	}
	sb.WriteString("\n")

	// 前一期报告内容
	if prevReport != nil && prevReport.Insights != nil {
		sb.WriteString(fmt.Sprintf("## 前一期%s内容\n", typeLabel))
		pIns := prevReport.Insights
		if v, ok := pIns["avg_daily_energy_kcal"]; ok {
			sb.WriteString(fmt.Sprintf("- 前期日均热量：%.1f kcal\n", toFloat(v)))
		}
		if v, ok := pIns["total_meals"]; ok {
			sb.WriteString(fmt.Sprintf("- 前期总餐次：%v\n", v))
		}
		if prevAI, ok := pIns["ai_summary"].(string); ok && prevAI != "" {
			sb.WriteString(fmt.Sprintf("- 前期AI总结摘要：%s\n", truncate(prevAI, 300)))
		}
		sb.WriteString("\n")
	}

	sb.WriteString(fmt.Sprintf("## 输出要求\n"))
	sb.WriteString(fmt.Sprintf("请输出两部分，用【本期总结】和【下期建议】标记分隔：\n"))
	sb.WriteString(fmt.Sprintf("1.【本期总结】：总结本期饮食的营养状况、存在的问题、与前期对比的变化趋势（约150字）\n"))
	sb.WriteString(fmt.Sprintf("2.【下期建议】：针对下一个%s的饮食改善建议，结合用户健康目标（约150字）\n", typeLabel))

	return sb.String()
}

// parseAIResponse 解析AI返回，分离总结和建议
func parseAIResponse(text string) (summary, advice string) {
	// 尝试按标记分割
	summaryMark := "【本期总结】"
	adviceMark := "【下期建议】"
	sIdx := strings.Index(text, summaryMark)
	aIdx := strings.Index(text, adviceMark)

	if sIdx >= 0 && aIdx >= 0 && aIdx > sIdx {
		summary = strings.TrimSpace(text[sIdx+len(summaryMark) : aIdx])
		advice = strings.TrimSpace(text[aIdx+len(adviceMark):])
	} else {
		// 没找到标记，整体作为总结
		summary = strings.TrimSpace(text)
		advice = ""
	}
	return
}

// toFloat 将 interface{} 转为 float64
func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}

// truncate 截断字符串到指定长度
func truncate(s string, maxLen int) string {
	r := []rune(s)
	if len(r) <= maxLen {
		return s
	}
	return string(r[:maxLen]) + "..."
}

// UpdateSummary 更新指定摘要的 insights
func (s *SummaryService) UpdateSummary(ctx context.Context, userID int, summaryID int64, insights map[string]interface{}) error {
	existing, err := s.summaryRepo.FindByID(ctx, summaryID)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("summary not found")
	}
	if existing.UserID != userID {
		return fmt.Errorf("summary does not belong to this user")
	}
	return s.summaryRepo.UpdateByID(ctx, summaryID, insights)
}
func (s *SummaryService) GetAllActiveUserIDs(ctx context.Context) ([]int, error) {
	return s.mealRepo.GetAllActiveUserIDs(ctx)
}

// GenerateDailyForDate 为指定日期生成日报（如果已存在则跳过）
// 这是定时任务和 backfill 的核心方法——给定一个日期，查那天的原始记录，聚合为 daily summary
func (s *SummaryService) GenerateDailyForDate(ctx context.Context, userID int, date time.Time) (*model.AnalysisSummary, error) {
	date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())

	// 检查是否已存在（防止重复生成）
	existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, date, "daily")
	if existing != nil {
		return existing, nil
	}

	periodStart := date
	periodEnd := date.AddDate(0, 0, 1)
	records, err := s.mealRepo.QueryRecordsByDateRange(ctx, userID, periodStart, periodEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to query records: %w", err)
	}
	if len(records) == 0 {
		return nil, nil // 当天无记录，不生成空日报
	}

	insights := s.buildInsights(ctx, records, periodStart, periodEnd, "daily")
	summary := &model.AnalysisSummary{
		UserID:      userID,
		SummaryDate: date,
		SummaryType: "daily",
		Source:      "auto",
		Insights:    insights,
	}
	if err := s.summaryRepo.Create(ctx, summary); err != nil {
		return nil, fmt.Errorf("failed to save daily summary: %w", err)
	}

	logrus.Infof("Auto-generated daily summary for user %d on %s", userID, date.Format("2006-01-02"))
	return summary, nil
}

// GenerateWeeklySummary 根据本周日度摘要聚合生成周报
// 从本周一的日报中聚合，如果已存在则跳过
func (s *SummaryService) GenerateWeeklySummary(ctx context.Context, userID int) (*model.AnalysisSummary, error) {
	now := time.Now()
	weekday := now.Weekday()
	daysSinceMonday := (int(weekday) + 6) % 7
	weekStart := time.Date(now.Year(), now.Month(), now.Day()-daysSinceMonday, 0, 0, 0, 0, now.Location())

	// 检查是否已存在
	existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, weekStart, "weekly")
	if existing != nil {
		return existing, nil
	}

	// 查本周已有的日报
	weekEnd := periodEndInclusive(weekStart, "weekly")
	dailySummaries, err := s.summaryRepo.FindByDateRange(ctx, userID, "daily", weekStart, weekEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to query daily summaries: %w", err)
	}
	if len(dailySummaries) == 0 {
		return nil, nil // 本周无日报，不生成空周报
	}

	mergedInsights := s.mergeInsights(ctx, dailySummaries, "weekly")
	// 强制使用完整周范围（周一~周日），不管是否有日报缺漏
	mergedInsights["period_start"] = weekStart.Format("2006-01-02")
	mergedInsights["period_end"] = weekEnd.Format("2006-01-02")
	summary := &model.AnalysisSummary{
		UserID:      userID,
		SummaryDate: weekStart,
		SummaryType: "weekly",
		Source:      "auto",
		Insights:    mergedInsights,
	}
	if err := s.summaryRepo.Create(ctx, summary); err != nil {
		return nil, fmt.Errorf("failed to save weekly summary: %w", err)
	}

	logrus.Infof("Auto-generated weekly summary for user %d starting %s", userID, weekStart.Format("2006-01-02"))
	return summary, nil
}

// GenerateMonthlySummary 根据本月周度摘要聚合生成月报
func (s *SummaryService) GenerateMonthlySummary(ctx context.Context, userID int) (*model.AnalysisSummary, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, monthStart, "monthly")
	if existing != nil {
		return existing, nil
	}

	monthEnd := periodEndInclusive(monthStart, "monthly")
	weeklySummaries, err := s.summaryRepo.FindByDateRange(ctx, userID, "weekly", monthStart, monthEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to query weekly summaries: %w", err)
	}
	if len(weeklySummaries) == 0 {
		return nil, nil
	}

	mergedInsights := s.mergeInsights(ctx, weeklySummaries, "monthly")
	// 强制使用整月范围
	mergedInsights["period_start"] = monthStart.Format("2006-01-02")
	mergedInsights["period_end"] = monthEnd.Format("2006-01-02")
	summary := &model.AnalysisSummary{
		UserID:      userID,
		SummaryDate: monthStart,
		SummaryType: "monthly",
		Source:      "auto",
		Insights:    mergedInsights,
	}
	if err := s.summaryRepo.Create(ctx, summary); err != nil {
		return nil, fmt.Errorf("failed to save monthly summary: %w", err)
	}

	logrus.Infof("Auto-generated monthly summary for user %d starting %s", userID, monthStart.Format("2006-01"))
	return summary, nil
}

// BackfillSummaries 批量补填指定日期范围内的日报和周报（测试 + 比赛演示用）
// 优化版：一次查询全量原始数据，内存按天分组，避免 N 次 DB 查询
// 返回生成的日报数、周报数
func (s *SummaryService) BackfillSummaries(ctx context.Context, userID int, startDate, endDate time.Time) (dailyCount int, weeklyCount int, err error) {
	startDate = time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location())
	endDate = time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 23, 59, 59, 999999999, endDate.Location())

	// Step 1: 一次查询整个日期范围的全部原始记录
	allRecords, err := s.mealRepo.QueryRecordsByDateRange(ctx, userID, startDate, endDate.AddDate(0, 0, 1))
	if err != nil {
		return 0, 0, fmt.Errorf("failed to query records: %w", err)
	}

	if len(allRecords) == 0 {
		logrus.Infof("Backfill: no records found for user %d in [%s, %s]", userID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
		return 0, 0, nil
	}

	// Step 2: 按天分组（内存中完成，零 DB 查询）
	dayMap := make(map[string][]*model.WeighRecord)
	for _, r := range allRecords {
		dateKey := r.CreatedAt.Format("2006-01-02")
		dayMap[dateKey] = append(dayMap[dateKey], r)
	}

	logrus.Infof("Backfill: %d records split into %d days for user %d", len(allRecords), len(dayMap), userID)

	// Step 3: 遍历每一天，检查是否已有日报，没有则创建
	for dateKey, dayRecords := range dayMap {
		date, _ := time.Parse("2006-01-02", dateKey)
		existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, date, "daily")
		if existing != nil {
			continue // 已有日报，跳过
		}

		dayStart := date
		dayEnd := date.AddDate(0, 0, 1)
		insights := s.buildInsights(ctx, dayRecords, dayStart, dayEnd, "daily")
		summary := &model.AnalysisSummary{
			UserID:      userID,
			SummaryDate: date,
			SummaryType: "daily",
			Source:      "auto",
			Insights:    insights,
		}
		if err := s.summaryRepo.Create(ctx, summary); err != nil {
			logrus.WithError(err).Warnf("Backfill daily failed for user %d on %s", userID, dateKey)
			continue
		}
		dailyCount++
	}

	// Step 4: 遍历涉及的周，聚合生成周报
	weekSet := make(map[string]bool)
	for dateKey := range dayMap {
		date, _ := time.Parse("2006-01-02", dateKey)
		weekday := date.Weekday()
		daysSinceMonday := (int(weekday) + 6) % 7
		weekStart := date.AddDate(0, 0, -daysSinceMonday)
		weekSet[weekStart.Format("2006-01-02")] = true
	}

	for weekKey := range weekSet {
		weekStart, _ := time.Parse("2006-01-02", weekKey)
		existing, _ := s.summaryRepo.FindByUserDateType(ctx, userID, weekStart, "weekly")
		if existing != nil {
			continue
		}

		weekEnd := weekStart.AddDate(0, 0, 7)
		dailySummaries, err := s.summaryRepo.FindByDateRange(ctx, userID, "daily", weekStart, weekEnd)
		if err != nil || len(dailySummaries) == 0 {
			continue
		}

		mergedInsights := s.mergeInsights(ctx, dailySummaries, "weekly")
		wSummary := &model.AnalysisSummary{
			UserID:      userID,
			SummaryDate: weekStart,
			SummaryType: "weekly",
			Source:      "auto",
			Insights:    mergedInsights,
		}
		if err := s.summaryRepo.Create(ctx, wSummary); err != nil {
			logrus.WithError(err).Warnf("Backfill weekly failed for user %d on week %s", userID, weekKey)
			continue
		}
		weeklyCount++
	}

	logrus.Infof("Backfill completed for user %d: %d daily + %d weekly summaries", userID, dailyCount, weeklyCount)
	return dailyCount, weeklyCount, nil
}

type BackfillResult struct {
	Daily    int `json:"daily"`
	Weekly   int `json:"weekly"`
	Monthly  int `json:"monthly"`
	Yearly   int `json:"yearly"`
}

// IncrementalBackfill 增量生成报告：每次生成10周报+6月报+2年报（日报由称重时自动生成）
func (s *SummaryService) IncrementalBackfill(ctx context.Context, userID int) (*BackfillResult, error) {
	const (
		maxWeekly  = 10
		maxMonthly = 6
		maxYearly  = 2
	)
	result := &BackfillResult{}

	oldest, err := s.mealRepo.GetOldestRecordDate(ctx, userID)
	if err != nil || oldest == nil {
		return result, nil
	}

	// 日报由称重时自动生成，这里只聚合上层报告
	// ---- Step 1: 周报（最多10周） ----
	weekStarts, _ := s.summaryRepo.GetWeekStartsWithoutWeeklySummary(ctx, userID, *oldest, maxWeekly)
	for _, ws := range weekStarts {
		weekEnd := periodEndInclusive(ws, "weekly")
		dailies, _ := s.summaryRepo.FindByDateRange(ctx, userID, "daily", ws, weekEnd)
		if len(dailies) == 0 {
			continue
		}
		merged := s.mergeInsights(ctx, dailies, "weekly")
		merged["period_start"] = ws.Format("2006-01-02")
		merged["period_end"] = weekEnd.Format("2006-01-02")
		wSummary := &model.AnalysisSummary{
			UserID: userID, SummaryDate: ws, SummaryType: "weekly", Source: "auto", Insights: merged,
		}
		if err := s.summaryRepo.Create(ctx, wSummary); err != nil {
			continue
		}
		result.Weekly++
	}

	// ---- Step 2: 月报（最多6月） ----
	monthStarts, _ := s.summaryRepo.GetMonthStartsWithoutMonthlySummary(ctx, userID, *oldest, maxMonthly)
	for _, ms := range monthStarts {
		monthEnd := periodEndInclusive(ms, "monthly")
		weeklies, _ := s.summaryRepo.FindByDateRange(ctx, userID, "weekly", ms, monthEnd)
		if len(weeklies) == 0 {
			continue
		}
		merged := s.mergeInsights(ctx, weeklies, "monthly")
		merged["period_start"] = ms.Format("2006-01-02")
		merged["period_end"] = monthEnd.Format("2006-01-02")
		mSummary := &model.AnalysisSummary{
			UserID: userID, SummaryDate: ms, SummaryType: "monthly", Source: "auto", Insights: merged,
		}
		if err := s.summaryRepo.Create(ctx, mSummary); err != nil {
			continue
		}
		result.Monthly++
	}

	// ---- Step 3: 年报（最多2年） ----
	yearStarts, _ := s.summaryRepo.GetYearStartsWithoutYearlySummary(ctx, userID, *oldest, maxYearly)
	for _, ys := range yearStarts {
		yearEnd := periodEndInclusive(ys, "yearly")
		monthlies, _ := s.summaryRepo.FindByDateRange(ctx, userID, "monthly", ys, yearEnd)
		if len(monthlies) == 0 {
			continue
		}
		merged := s.mergeInsights(ctx, monthlies, "yearly")
		merged["period_start"] = ys.Format("2006-01-02")
		merged["period_end"] = yearEnd.Format("2006-01-02")
		ySummary := &model.AnalysisSummary{
			UserID: userID, SummaryDate: ys, SummaryType: "yearly", Source: "auto", Insights: merged,
		}
		if err := s.summaryRepo.Create(ctx, ySummary); err != nil {
			continue
		}
		result.Yearly++
	}

	total := result.Daily + result.Weekly + result.Monthly + result.Yearly
	logrus.Infof("Incremental backfill for user %d: %d daily + %d weekly + %d monthly + %d yearly = %d total",
		userID, result.Daily, result.Weekly, result.Monthly, result.Yearly, total)
	return result, nil
}
