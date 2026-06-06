package dashscope

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	BaseURL      = "https://dashscope.aliyuncs.com/api/v1/services"
	TextGenURL   = BaseURL + "/aigc/text-generation/generation"
	MultimodalURL = BaseURL + "/aigc/multimodal-generation/generation"
	EmbeddingURL = BaseURL + "/embeddings/text-embedding/text-embedding"
)

type Client struct {
	APIKey     string
	HTTPClient *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey: apiKey,
		HTTPClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// ==================== 文本生成 ====================

type TextGenerationRequest struct {
	Model      string        `json:"model"`
	Input      TextInput     `json:"input"`
	Parameters *TextParameters `json:"parameters,omitempty"`
}

type TextInput struct {
	Messages []Message `json:"messages"`
	Prompt   string    `json:"prompt,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type TextParameters struct {
	Temperature  float64 `json:"temperature,omitempty"`
	TopP         float64 `json:"top_p,omitempty"`
	MaxTokens    int     `json:"max_tokens,omitempty"`
	ResultFormat string  `json:"result_format,omitempty"`
	EnableSearch bool    `json:"enable_search,omitempty"`
}

type TextGenerationResponse struct {
	Output TextOutput `json:"output"`
	Usage  UsageInfo   `json:"usage"`
}

type TextOutput struct {
	Text           string          `json:"text"`
	FinishReason   string          `json:"finish_reason"`
	Choices        []ChoiceOutput  `json:"choices,omitempty"`
}

type ChoiceOutput struct {
	Message MessageContent `json:"message"`
}

type MessageContent struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// TextGenerate 调用文本生成 API (qwen-plus)
func (c *Client) TextGenerate(req *TextGenerationRequest) (*TextGenerationResponse, error) {
	if req.Parameters == nil {
		req.Parameters = &TextParameters{
			Temperature:  0.7,
			TopP:         0.9,
			MaxTokens:    2048,
			ResultFormat: "message",
		}
	}

	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest("POST", TextGenURL, bytes.NewReader(bodyBytes))
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("text generation request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("text generation API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result TextGenerationResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse text generation response: %w", err)
	}

	// 兼容 message 格式
	if result.Output.Text == "" && len(result.Output.Choices) > 0 {
		result.Output.Text = result.Output.Choices[0].Message.Content
	}

	return &result, nil
}

// ==================== 多模态 ====================

type MultimodalRequest struct {
	Model      string             `json:"model"`
	Input      MultimodalInput    `json:"input"`
	Parameters *TextParameters    `json:"parameters,omitempty"`
}

type MultimodalInput struct {
	Messages []MultimodalMessage `json:"messages"`
}

type MultimodalMessage struct {
	Role    string            `json:"role"`
	Content []ContentPart     `json:"content"`
}

type ContentPart struct {
	Image string `json:"image,omitempty"` // URL 或 base64
	Text  string `json:"text,omitempty"`
}

type MultimodalResponse struct {
	Output MultimodalOutput `json:"output"`
	Usage  UsageInfo        `json:"usage"`
}

type MultimodalOutput struct {
	Choices []ChoiceOutput `json:"choices"`
}

// GenerateMultimodal 调用多模态 API (qwen-vl-flash)
func (c *Client) GenerateMultimodal(req *MultimodalRequest) (*MultimodalResponse, error) {
	if req.Parameters == nil {
		req.Parameters = &TextParameters{
			Temperature:  0.7,
			MaxTokens:    2048,
			ResultFormat: "message",
		}
	}

	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest("POST", MultimodalURL, bytes.NewReader(bodyBytes))
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("multimodal request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("multimodal API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result MultimodalResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse multimodal response: %w", err)
	}

	return &result, nil
}

// ==================== 向量化 ====================

type EmbeddingRequest struct {
	Model string       `json:"model"`
 Input EmbedInput   `json:"input"`
}

type EmbedInput struct {
	Texts []string `json:"texts"`
}

type EmbeddingResponse struct {
	Output EmbedOutput `json:"output"`
	Usage  UsageInfo   `json:"usage"`
}

type EmbedOutput struct {
	Embeddings []EmbeddingItem `json:"embeddings"`
}

type EmbeddingItem struct {
	TextIndex int       `json:"text_index"`
	Embedding []float64 `json:"embedding"`
}

// GenerateEmbedding 调用文本向量化 API (text-embedding-v2)
func (c *Client) GenerateEmbedding(texts []string) (*EmbeddingResponse, error) {
	req := &EmbeddingRequest{
		Model: "text-embedding-v2",
		Input: EmbedInput{Texts: texts},
	}

	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest("POST", EmbeddingURL, bytes.NewReader(bodyBytes))
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("embedding request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("embedding API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result EmbeddingResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse embedding response: %w", err)
	}

	return &result, nil
}

// ==================== 通用 ====================

type UsageInfo struct {
	InputTokens  int `json:"input_tokens,omitempty"`
	OutputTokens int `json:"output_tokens,omitempty"`
	TotalTokens  int `json:"total_tokens,omitempty"`
}
