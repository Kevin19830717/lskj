package service

import (
	"fmt"
	"time"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/pkg/dashscope"

	"github.com/sirupsen/logrus"
)

type EmbeddingService struct {
	client *dashscope.Client
	cfg    *config.AliyunConfig
}

func NewEmbeddingService(cfg *config.AliyunConfig) *EmbeddingService {
	return &EmbeddingService{
		client: dashscope.NewClient(cfg.APIKey),
		cfg:    cfg,
	}
}

// GenerateEmbedding 生成文本向量嵌入
func (s *EmbeddingService) GenerateEmbedding(text string) ([]float64, error) {
	resp, err := s.client.GenerateEmbedding([]string{text}, s.cfg.EmbeddingModel)
	if err != nil {
		return nil, fmt.Errorf("embedding API call failed: %w", err)
	}
	if len(resp.Data) == 0 {
		return nil, fmt.Errorf("no embeddings returned from API")
	}
	return resp.Data[0].Embedding, nil
}

// BatchGenerateEmbedding 批量生成向量嵌入
func (s *EmbeddingService) BatchGenerateEmbedding(texts []string) ([][]float64, error) {
	if len(texts) == 0 {
		return [][]float64{}, nil
	}
	const batchSize = 25
	var allEmbeddings [][]float64
	for i := 0; i < len(texts); i += batchSize {
		end := i + batchSize
		if end > len(texts) {
			end = len(texts)
		}
		batch := texts[i:end]
		resp, err := s.client.GenerateEmbedding(batch, s.cfg.EmbeddingModel)
		if err != nil {
			logrus.WithError(err).Warnf("Batch embedding failed at batch starting index %d", i)
			continue
		}
		for _, emb := range resp.Data {
			allEmbeddings = append(allEmbeddings, emb.Embedding)
		}
		if end < len(texts) {
			time.Sleep(100 * time.Millisecond)
		}
	}
	return allEmbeddings, nil
}

// ResponsesGenerate 使用 Responses API 生成文本（支持 previous_response_id 多轮记忆）
func (s *EmbeddingService) ResponsesGenerate(messages []dashscope.Message, previousResponseID string) (string, string, error) {
	req := &dashscope.ResponsesRequest{
		Model: s.cfg.TextModel,
		Input: messages,
	}
	if previousResponseID != "" {
		req.PreviousResponseID = previousResponseID
	}

	resp, err := s.client.Responses(req)
	if err != nil {
		return "", "", fmt.Errorf("responses API failed: %w", err)
	}

	text := resp.ExtractText()
	if text == "" {
		return "", "", fmt.Errorf("empty response from LLM")
	}
	return text, resp.ID, nil
}

// ComputeCosineSimilarity 计算余弦相似度
func (s *EmbeddingService) ComputeCosineSimilarity(a, b []float64) (float64, error) {
	if len(a) != len(b) {
		return 0, fmt.Errorf("vector dimension mismatch: %d vs %d", len(a), len(b))
	}
	var dotProduct, normA, normB float64
	for i := range a {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0, nil
	}
	return dotProduct / (sqrt(normA) * sqrt(normB)), nil
}

func sqrt(x float64) float64 {
	if x == 0 {
		return 0
	}
	z := x
	for i := 0; i < 20; i++ {
		z = z - (z*z-x)/(2*z)
	}
	return z
}
