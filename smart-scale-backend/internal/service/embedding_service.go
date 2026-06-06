package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

// GenerateEmbedding 生成文本向量嵌入（调用DashScope text-embedding-v2）
func (s *EmbeddingService) GenerateEmbedding(text string) ([]float64, error) {
	resp, err := s.client.GenerateEmbedding([]string{text})
	if err != nil {
		return nil, fmt.Errorf("embedding API call failed: %w", err)
	}

	if len(resp.Output.Embeddings) == 0 {
		return nil, fmt.Errorf("no embeddings returned from API")
	}

	return resp.Output.Embeddings[0].Embedding, nil
}

// BatchGenerateEmbedding 批量生成向量嵌入
func (s *EmbeddingService) BatchGenerateEmbedding(texts []string) ([][]float64, error) {
	if len(texts) == 0 {
		return [][]float64{}, nil
	}

	// DashScope 单次最多支持25条
	const batchSize = 25
	var allEmbeddings [][]float64

	for i := 0; i < len(texts); i += batchSize {
		end := i + batchSize
		if end > len(texts) {
			end = len(texts)
		}
		batch := texts[i:end]

		resp, err := s.client.GenerateEmbedding(batch)
		if err != nil {
			logrus.WithError(err).Warnf("Batch embedding failed at batch starting index %d", i)
			continue
		}

		for _, emb := range resp.Output.Embeddings {
			allEmbeddings = append(allEmbeddings, emb.Embedding)
		}

		// 避免触发速率限制
		if end < len(texts) {
			time.Sleep(100 * time.Millisecond)
		}
	}

	return allEmbeddings, nil
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
	// Newton's method
	if x == 0 {
		return 0
	}
	z := x
	for i := 0; i < 20; i++ {
		z = z - (z*z-x)/(2*z)
	}
	return z
}

// TextGenerate 直接调用文本生成API（通用方法）
func (s *EmbeddingService) TextGenerate(prompt string, temperature float64) (string, error) {
	req := &dashscope.TextGenerationRequest{
		Model: s.cfg.TextModel,
		Input: dashscope.TextInput{Prompt: prompt},
		Parameters: &dashscope.TextParameters{
			Temperature: temperature,
			MaxTokens:   2048,
			TopP:        0.9,
		},
	}

	resp, err := s.client.TextGenerate(req)
	if err != nil {
		return "", fmt.Errorf("text generation failed: %w", err)
	}
	return resp.Output.Text, nil
}

// HTTPHelper HTTP请求封装
func httpPost(url string, apiKey string, body interface{}) ([]byte, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &httpClient{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// httpClient 简单HTTP客户端（避免循环依赖）
type httpClient struct {
	Timeout time.Duration
}

func (c *httpClient) Do(req *http.Request) (*http.Response, error) {
	return http.DefaultClient.Do(req)
}
