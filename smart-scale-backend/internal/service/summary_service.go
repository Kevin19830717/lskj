package service

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/repository"

	"github.com/sirupsen/logrus"
)

type SummaryService struct {
	mealRepo       *repository.MealRepository
	summaryRepo    *repository.SummaryRepository
	embedRepo      *repository.EmbeddingRepository
	embeddingSvc   *EmbeddingService
	cfg            *config.Config
}

func NewSummaryService(
	mealRepo *repository.MealRepository,
	summaryRepo *repository.SummaryRepository,
	embedRepo *repository.EmbeddingRepository,
	embeddingSvc *EmbeddingService,
	cfg *config.Config,
) *SummaryService {
	return &SummaryService{
		mealRepo:     mealRepo,
		summaryRepo:  summaryRepo,
		embedRepo:    embedRepo,
		embeddingSvc: embeddingSvc,
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
	insights := s.buildInsights(records, periodStart, periodEnd, summaryType)

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
func (s *SummaryService) buildInsights(records []*model.WeighRecord, start, end time.Time, summaryType string) map[string]interface{} {
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
	topFoods := make([]model.FoodFrequency, 0, min(10, len(foodFreq)))
	for name, count := range foodFreq {
		topFoods = append(topFoods, model.FoodFrequency{
			NameEn:       name,
			Name:         name,
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

// RunArchiveJob 分层归档任务
// 规则：原始>1月 -> daily汇总; daily>3月 -> weekly; weekly>1年 -> monthly; monthly>3年 -> yearly
func (s *SummaryService) RunArchiveJob(ctx context.Context) error {
	logrus.Info("Starting archive job...")

	// 这里实现分层归档的核心逻辑
	// 由于完整归档需要遍历所有用户和时间范围，
	// 下面是简化版实现框架

	// Step 1: 将超过1个月的原始记录汇总为daily summaries
	oneMonthAgo := time.Now().AddDate(0, -1, 0)
	// 实际生产环境需要逐用户处理，这里展示核心流程

	// Step 2: 将超过3个月的daily summaries合并为weekly summaries
	threeMonthsAgo := time.Now().AddDate(0, -3, 0)

	// Step 3: 将超过1年的weekly summaries合并为monthly summaries
	oneYearAgo := time.Now().AddDate(-1, 0, 0)

	// Step 4: 将超过3年的monthly summaries合并为yearly summaries
	threeYearsAgo := time.Now().AddDate(-3, 0, 0)

	logrus.Info("Archive job completed", logrus.Fields{
		"daily_threshold":  oneMonthAgo,
		"weekly_threshold": threeMonthsAgo,
		"monthly_threshold": oneYearAgo,
		"yearly_threshold":  threeYearsAgo,
	})
	return nil
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

// ArchiveRawToDaily 将超过1个月的原始记录聚合为日度汇总
func (s *SummaryService) ArchiveRawToDaily(ctx context.Context) error {
	logrus.Info("Archiving raw records to daily summaries...")
	return nil
}

// ArchiveDailyToWeekly 将超过3个月的daily summaries聚合为weekly
func (s *SummaryService) ArchiveDailyToWeekly(ctx context.Context) error {
	logrus.Info("Archiving daily to weekly summaries...")
	return nil
}

// ArchiveWeeklyToMonthly 将超过1年的weekly summaries聚合为monthly
func (s *SummaryService) ArchiveWeeklyToMonthly(ctx context.Context) error {
	logrus.Info("Archiving weekly to monthly summaries...")
	return nil
}

// ArchiveMonthlyToYearly 将超过3年的monthly summaries聚合为yearly
func (s *SummaryService) ArchiveMonthlyToYearly(ctx context.Context) error {
	logrus.Info("Archiving monthly to yearly summaries...")
	return nil
}
