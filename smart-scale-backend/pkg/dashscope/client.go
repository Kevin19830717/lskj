package dashscope

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// 阿里云百炼 OpenAI 兼容模式 — Responses API
// 文档: https://help.aliyun.com/zh/model-studio/compatibility-with-openai-responses-api
// Responses API 支持 previous_response_id 自动关联多轮对话上下文（7天有效）
const (
	BaseURL       = "https://dashscope.aliyuncs.com/compatible-mode/v1"
	ResponsesURL  = BaseURL + "/responses"
	EmbeddingsURL = BaseURL + "/embeddings"
	ChatURL       = BaseURL + "/chat/completions"
)

type Client struct {
	APIKey     string
	HTTPClient *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey: apiKey,
		HTTPClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// ==================== Responses API ====================

// ResponsesRequest — Responses API 请求
// input 可以是消息数组（兼容 Chat 格式），previous_response_id 用于多轮记忆
type ResponsesRequest struct {
	Model              string    `json:"model"`
	Input              []Message `json:"input"`
	PreviousResponseID string    `json:"previous_response_id,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ResponsesResponse — Responses API 响应
type ResponsesResponse struct {
	ID     string           `json:"id"`
	Model  string           `json:"model"`
	Status string           `json:"status"`
	Output []ResponseOutput `json:"output"`
	Usage  ResponsesUsage   `json:"usage"`
}

type ResponseOutput struct {
	Type    string              `json:"type"` // "message" | "reasoning"
	Role    string              `json:"role"`
	Status  string              `json:"status"`
	Content []ResponseContent   `json:"content"`
}

type ResponseContent struct {
	Type string `json:"type"` // "output_text"
	Text string `json:"text"`
}

type ResponsesUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
	TotalTokens  int `json:"total_tokens"`
}

// Responses 调用 Responses API（支持 previous_response_id 多轮记忆）
func (c *Client) Responses(req *ResponsesRequest) (*ResponsesResponse, error) {
	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest("POST", ResponsesURL, bytes.NewReader(bodyBytes))
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("responses API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("responses API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result ResponsesResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse responses API response: %w", err)
	}
	return &result, nil
}

// ExtractText 从 Responses 响应中提取文本内容
func (r *ResponsesResponse) ExtractText() string {
	for _, out := range r.Output {
		if out.Type == "message" {
			for _, c := range out.Content {
				if c.Type == "output_text" && c.Text != "" {
					return c.Text
				}
			}
		}
	}
	return ""
}

// ==================== Embeddings (OpenAI 兼容) ====================

type EmbeddingRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type EmbeddingResponse struct {
	Data []EmbeddingData `json:"data"`
	Usage EmbeddingUsage `json:"usage"`
}

type EmbeddingData struct {
	Index     int       `json:"index"`
	Embedding []float64 `json:"embedding"`
}

type EmbeddingUsage struct {
	TotalTokens int `json:"total_tokens"`
}

// GenerateEmbedding 调用 OpenAI 兼容的 embeddings 接口
// model 参数指定使用的 embedding 模型（如 "qwen3.7-text-embedding"）
func (c *Client) GenerateEmbedding(texts []string, model string) (*EmbeddingResponse, error) {
	if model == "" {
		model = "qwen3.7-text-embedding" // 兜底默认值
	}
	req := &EmbeddingRequest{
		Model: model,
		Input: texts,
	}

	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest("POST", EmbeddingsURL, bytes.NewReader(bodyBytes))
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

// ==================== Chat Completions (多模态，支持图片) ====================

// ChatContentPart — 多模态消息内容片段（文本或图片）
type ChatContentPart struct {
	Type     string         `json:"type"` // "text" | "image_url"
	Text     string         `json:"text,omitempty"`
	ImageURL *ChatImageURL  `json:"image_url,omitempty"`
}

// ChatImageURL — 图片URL（支持 data URI base64）
type ChatImageURL struct {
	URL string `json:"url"`
}

// ChatMessage — 多模态消息（Content 可以是字符串或内容片段数组）
type ChatMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"` // string 或 []ChatContentPart
}

// ChatCompletionRequest — Chat Completions 请求
type ChatCompletionRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	// 可选优化参数
	MaxTokens      int     `json:"max_tokens,omitempty"`
	Temperature    float64 `json:"temperature,omitempty"`
	EnableThinking *bool   `json:"enable_thinking,omitempty"`
}

// ChatCompletionResponse — Chat Completions 响应
type ChatCompletionResponse struct {
	Choices []ChatChoice `json:"choices"`
	Usage   ChatUsage    `json:"usage"`
}

type ChatChoice struct {
	Index   int         `json:"index"`
	Message ChatRespMsg `json:"message"`
}

type ChatRespMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatUsage struct {
	TotalTokens int `json:"total_tokens"`
}

// ChatCompletion 调用 Chat Completions API（支持多模态图片输入）
func (c *Client) ChatCompletion(req *ChatCompletionRequest) (*ChatCompletionResponse, error) {
	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest("POST", ChatURL, bytes.NewReader(bodyBytes))
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("chat completion request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("chat completion API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result ChatCompletionResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse chat completion response: %w", err)
	}
	return &result, nil
}

// ExtractContent 从 Chat 响应中提取文本内容
func (r *ChatCompletionResponse) ExtractContent() string {
	if len(r.Choices) == 0 {
		return ""
	}
	return r.Choices[0].Message.Content
}
