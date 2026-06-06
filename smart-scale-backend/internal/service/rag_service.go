package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/internal/model"
	"smart-scale-backend/internal/repository"
	"smart-scale-backend/pkg/dashscope"

	"github.com/sirupsen/logrus"
)

type RAGService struct {
	summaryRepo  *repository.SummaryRepository
	adviceRepo   *repository.AdviceRepository
	embedRepo    *repository.EmbeddingRepository
	embeddingSvc *EmbeddingService
	dashClient   *dashscope.Client
	cfg          *config.Config
}

func NewRAGService(
	summaryRepo *repository.SummaryRepository,
	adviceRepo *repository.AdviceRepository,
	embedRepo *repository.EmbeddingRepository,
	embeddingSvc *EmbeddingService,
	dashClient *dashscope.Client,
	cfg *config.Config,
) *RAGService {
	return &RAGService{
		summaryRepo:  summaryRepo,
		adviceRepo:   adviceRepo,
		embedRepo:    embedRepo,
		embeddingSvc: embeddingSvc,
		dashClient:   dashClient,
		cfg:          cfg,
	}
}

// GenerateAdvice 生成AI健康建议（RAG流程）
// 流程：1)获取最近摘要 -> 2)向量化查询文本 -> 3)检索Top5相似历史 -> 4)构建prompt -> 5)调qwen-plus生成
func (s *RAGService) GenerateAdvice(ctx context.Context, userID int, adviceType string, weekDateStr string) (*model.HealthAdvice, error) {
	// 1. 获取最近的摘要数据作为基础上下文
	summaries, err := s.getRecentContext(ctx, userID)
	if err != nil {
		logrus.WithError(err).Warn("Failed to get recent summaries for RAG context")
		summaries = []*model.AnalysisSummary{} // 允许继续执行
	}

	// 2. 构建查询文本（基于最新摘要的关键特征）
	queryText := s.buildQueryText(summaries, adviceType)

	// 3. 向量化查询文本
	queryEmbedding, err := s.embeddingSvc.GenerateEmbedding(queryText)
	if err != nil {
		return nil, fmt.Errorf("failed to generate query embedding: %w", err)
	}

	// 4. 检索Top5相似历史嵌入
	similarResults, err := s.embedRepo.SearchSimilar(ctx, userID, queryEmbedding, 5)
	if err != nil {
		logrus.WithError(err).Warn("Failed to search similar embeddings, proceeding without RAG context")
		similarResults = []model.EmbeddingSearchResult{}
	}

	// 5. 构建带RAG上下文的Prompt
	prompt := s.buildRAGPrompt(summaries, similarResults, adviceType)

	// 6. 调用DashScope qwen-plus生成建议
	response, err := s.dashClient.TextGenerate(&dashscope.TextGenerationRequest{
		Model: s.cfg.Aliyun.TextModel,
		Input: dashscope.TextInput{
			Prompt: prompt,
		},
		Parameters: &dashscope.TextParameters{
			Temperature:     0.7,
			MaxTokens:       2048,
			TopP:            0.9,
			EnableSearch:    true,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate advice via LLM: %w", err)
	}

	// 解析LLM返回内容
	adviceContent := response.Output.Text
	if adviceContent == "" {
		return nil, fmt.Errorf("empty advice content from LLM")
	}

	// 清理可能的markdown标记
	adviceContent = strings.TrimSpace(adviceContent)

	// 7. 确定周起始日期
	var weekStartDate time.Time
	if weekDateStr != "" {
		weekStartDate, err = time.Parse("2006-01-02", weekDateStr)
		if err != nil {
			weekStartDate = time.Now()
		}
	} else {
		// 默认使用本周一
		weekday := time.Now().Weekday()
		daysSinceMonday := (int(weekday) + 6) % 7
		weekStartDate = time.Date(time.Now().Year(), time.Now().Month(),
			time.Now().Day()-daysSinceMonday, 0, 0, 0, 0, time.Now().Location())
	}

	// 8. 保存建议记录
	advice := &model.HealthAdvice{
		UserID:        userID,
		WeekStartDate: weekStartDate,
		AdviceContent: adviceContent,
		AdviceType:    adviceType,
	}

	if err := s.adviceRepo.Create(ctx, advice); err != nil {
		return nil, fmt.Errorf("failed to save health advice: %w", err)
	}

	logrus.Infof("Generated %s health advice for user %d, length=%d chars", adviceType, userID, len(adviceContent))
	return advice, nil
}

// GetLatestAdvice 获取最新建议
func (s *RAGService) GetLatestAdvice(ctx context.Context, userID int, adviceType string) (*model.HealthAdvice, error) {
	return s.adviceRepo.FindLatestByType(ctx, userID, adviceType)
}

// getRecentContext 获取最近的摘要作为上下文
func (s *RAGService) getRecentContext(ctx context.Context, userID int) ([]*model.AnalysisSummary, error) {
	var allSummaries []*model.AnalysisSummary

	// 获取最近的daily summaries（最近4周）
	dailySummaries, err := s.summaryRepo.FindByUserAndType(ctx, userID, "daily", 28)
	if err != nil {
		return nil, err
	}
	allSummaries = append(allSummaries, dailySummaries...)

	// 获取最近的weekly summaries（最近12周）
	weeklySummaries, err := s.summaryRepo.FindByUserAndType(ctx, userID, "weekly", 12)
	if err != nil {
		return nil, err
	}
	allSummaries = append(allSummaries, weeklySummaries...)

	return allSummaries, nil
}

// buildQueryText 基于摘要构建向量检索查询文本
func (s *RAGService) buildQueryText(summaries []*model.AnalysisSummary, adviceType string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("用户%s健康饮食分析请求。", adviceType))

	if len(summaries) > 0 {
		latest := summaries[0]
		insights := latest.Insights
	if insights != nil {
			if e, ok := insights["total_energy_kcal"].(float64); ok {
				sb.WriteString(fmt.Sprintf("近期总热量%.0fkcal，", e))
			}
			if a, ok := insights["avg_daily_energy_kcal"].(float64); ok {
				sb.WriteString(fmt.Sprintf("日均%.0fkcal，", a))
			}
			if p, ok := insights["total_protein_g"].(float64); ok {
				sb.WriteString(fmt.Sprintf("蛋白质%.0fg，", p))
			}
			if f, ok := insights["total_fat_g"].(float64); ok {
				sb.WriteString(fmt.Sprintf("脂肪%.0fg，", f))
			}
			if tf, ok := insights["top_foods"].([]interface{}); ok && len(tf) > 0 {
				sb.WriteString("常吃:")
				for i, item := range tf {
					if i >= 5 {
						break
					}
					if m, ok := item.(map[string]interface{}); ok {
						if name, ok := m["name_en"].(string); ok {
							sb.WriteString(name + " ")
						}
					}
				}
			}
		}
	}
	return sb.String()
}

// buildRAGPrompt 构建包含RAG检索结果的Prompt
func (s *RAGService) buildRAGPrompt(summaries []*model.AnalysisSummary, similarResults []model.EmbeddingSearchResult, adviceType string) string {
	var sb strings.Builder

	// 系统角色定义
	sb.WriteString(`你是一位专业的注册营养师和健康管理顾问，擅长基于数据分析给出个性化、可操作的饮食健康建议。

## 任务
请根据以下用户提供的历史饮食数据和相似案例参考，生成一份详细、专业且易于理解的` + adviceType + `健康建议。

## 用户近期饮食概况
`)

	// 注入最新的摘要数据
	if len(summaries) > 0 {
		for i, sum := range summaries[:min(5, len(summaries))] {
			if i >= 3 { // 只取最近3条避免prompt过长
				sb.WriteString("\n...(更多历史数据已省略)\n")
				break
			}
			sb.WriteString(fmt.Sprintf("\n### %s摘要 (%s)\n", sum.SummaryType, sum.SummaryDate.Format("2006-01-02")))
			if insightsJSON, err := json.MarshalIndent(sum.Insights, "", "  "); err == nil {
				sb.WriteString(string(insightsJSON))
			}
		}
	} else {
		sb.WriteString("\n暂无足够历史数据，请给出通用的健康饮食建议。\n")
	}

	// 注入RAG检索到的相似历史案例
	if len(similarResults) > 0 {
		sb.WriteString("\n\n## 相似历史案例参考（来自其他用户的类似情况）\n")
		for i, result := range similarResults {
			sb.WriteString(fmt.Sprintf("\n### 案例%d (相似度: %.2f)\n", i+1, result.Similarity))
			sb.WriteString(result.Embedding.ContentText)
			sb.WriteString("\n")
		}
	}

	// 输出格式要求
	sb.WriteString(`

## 输出要求
1. 用中文输出，语气亲切专业
2. 结构清晰，使用以下格式：
   - **总体评估**: 对用户当前饮食状况的整体评价
   - **营养亮点**: 做得好的方面
   - **改进建议**: 具体可行的改善措施（至少3条，每条都要有具体操作指导）
   - **本周推荐食谱**: 给出1-2个适合的健康食谱搭配
   - **注意事项**: 特别提醒事项
3. 如果数据不足，请明确说明并在建议中体现
4. 建议要具体可操作，不要泛泛而谈
5. 字数控制在500-800字之间
`)

	return sb.String()
}
