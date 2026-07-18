package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"smart-scale-backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

type ChatHandler struct {
	ragBaseURL string
}

func NewChatHandler(ragBaseURL string) *ChatHandler {
	return &ChatHandler{ragBaseURL: ragBaseURL}
}

// Chat AI 健康对话（转发到 RAG service，带 JWT 鉴权）
// POST /api/v1/ai/chat
func (h *ChatHandler) Chat(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req struct {
		Message string `json:"message" binding:"required"`
		History []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"history"`
		Mode string `json:"mode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}

	if req.Mode == "" {
		req.Mode = "fast"
	}
	if req.Mode != "fast" && req.Mode != "expert" {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid mode. Must be 'fast' or 'expert'"))
		return
	}

	// 组装转发到 RAG service 的请求体
	history := req.History
	if history == nil {
		history = []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}{}
	}
	payload := map[string]interface{}{
		"user_id": userID,
		"message": req.Message,
		"history": history,
		"mode":    req.Mode,
	}
	body, _ := json.Marshal(payload)

	ragURL := h.ragBaseURL + "/api/v1/rag/chat"
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", ragURL, bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to create request"))
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		logrus.WithError(err).Error("Failed to call RAG chat service")
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务暂时不可用，请稍后重试"))
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		logrus.Errorf("RAG chat returned %d: %s", resp.StatusCode, string(respBody))
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应异常"))
		return
	}

	// 解析 RAG 响应并包装为统一格式 {code, message, data}
	var ragData map[string]interface{}
	if err := json.Unmarshal(respBody, &ragData); err != nil {
		logrus.Errorf("Failed to parse RAG chat response: %v, body: %s", err, string(respBody))
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应格式异常"))
		return
	}
	c.JSON(http.StatusOK, model.Success(ragData))
}

// ChatStream AI 健康对话流式输出（SSE 转发到 RAG service）
// POST /api/v1/ai/chat/stream
func (h *ChatHandler) ChatStream(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req struct {
		Message string   `json:"message"`
		History []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"history"`
		Mode   string   `json:"mode"`
		Images []string `json:"images"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request: "+err.Error()))
		return
	}
	// message 和 images 至少有一个非空
	if req.Message == "" && len(req.Images) == 0 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "message 和 images 至少需要一个"))
		return
	}

	if req.Mode == "" {
		req.Mode = "fast"
	}
	if req.Mode != "fast" && req.Mode != "expert" {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid mode. Must be 'fast' or 'expert'"))
		return
	}

	payload := map[string]interface{}{
		"user_id": userID,
		"message": req.Message,
		"history": req.History,
		"mode":    req.Mode,
		"images":  req.Images,
	}
	body, _ := json.Marshal(payload)

	ragURL := h.ragBaseURL + "/api/v1/rag/chat/stream"
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", ragURL, bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to create request"))
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		logrus.WithError(err).Error("Failed to call RAG stream chat service")
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务暂时不可用，请稍后重试"))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		logrus.Errorf("RAG stream chat returned %d: %s", resp.StatusCode, string(respBody))
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应异常"))
		return
	}

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Streaming not supported"))
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		// 透传 SSE 数据行
		if strings.HasPrefix(line, "data:") {
			fmt.Fprintf(c.Writer, "%s\n\n", line)
			flusher.Flush()
		}
	}

	if err := scanner.Err(); err != nil {
		logrus.WithError(err).Error("Error reading stream from RAG service")
	}
	// 发送标准 SSE 结束标记
	fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
	flusher.Flush()
}

// ChatHistory 获取用户聊天历史记录
// GET /api/v1/ai/chat/history
func (h *ChatHandler) ChatHistory(c *gin.Context) {
	userID := c.GetInt64("user_id")

	ragURL := fmt.Sprintf("%s/api/v1/rag/chat/history?user_id=%d&limit=100", h.ragBaseURL, userID)
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "GET", ragURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to create request"))
		return
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务暂时不可用"))
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应异常"))
		return
	}

	var ragData map[string]interface{}
	if err := json.Unmarshal(respBody, &ragData); err != nil {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应格式异常"))
		return
	}
	c.JSON(http.StatusOK, model.Success(ragData))
}

// ResetChat 重置对话（删除聊天记录+清空状态）
// POST /api/v1/ai/chat/reset
func (h *ChatHandler) ResetChat(c *gin.Context) {
	userID := c.GetInt64("user_id")

	ragURL := fmt.Sprintf("%s/api/v1/rag/chat/reset?user_id=%d", h.ragBaseURL, userID)
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", ragURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to create request"))
		return
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务暂时不可用"))
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应异常"))
		return
	}

	var ragData map[string]interface{}
	json.Unmarshal(respBody, &ragData)
	c.JSON(http.StatusOK, model.Success(ragData))
}

// SaveInterruptedMessage 保存中断的对话消息
// POST /api/v1/ai/chat/save-interrupted
func (h *ChatHandler) SaveInterruptedMessage(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req struct {
		Message string `json:"message"`
		Reply   string `json:"reply"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "Invalid request"))
		return
	}

	payload := map[string]interface{}{
		"user_id": userID,
		"message": req.Message,
		"reply":   req.Reply,
	}
	body, _ := json.Marshal(payload)

	ragURL := h.ragBaseURL + "/api/v1/rag/chat/save-interrupted"
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", ragURL, bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to create request"))
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务暂时不可用"))
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应异常"))
		return
	}

	var ragData map[string]interface{}
	json.Unmarshal(respBody, &ragData)
	c.JSON(http.StatusOK, model.Success(ragData))
}

// DeleteLastUserMessage 删除最后一条孤立的 user 消息（前端重发前去重用）
// POST /api/v1/ai/chat/delete-last-user
func (h *ChatHandler) DeleteLastUserMessage(c *gin.Context) {
	userID := c.GetInt64("user_id")

	ragURL := fmt.Sprintf("%s/api/v1/rag/chat/delete-last-user?user_id=%d", h.ragBaseURL, userID)
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", ragURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to create request"))
		return
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务暂时不可用"))
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI服务响应异常"))
		return
	}

	var ragData map[string]interface{}
	json.Unmarshal(respBody, &ragData)
	c.JSON(http.StatusOK, model.Success(ragData))
}

// ChatUploadFile 上传文件并解析为文本（转发到 RAG service）
// POST /api/v1/ai/chat/upload-file
func (h *ChatHandler) ChatUploadFile(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "文件上传失败: "+err.Error()))
		return
	}
	defer file.Close()

	// 限制 10MB
	if header.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "文件大小不能超过10MB"))
		return
	}

	// 组装转发到 RAG service 的 multipart 请求
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "创建请求失败"))
		return
	}
	if _, err := io.Copy(part, file); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "读取文件失败"))
		return
	}
	writer.Close()

	ragURL := h.ragBaseURL + "/api/v1/rag/chat/upload-file"
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", ragURL, &buf)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "Failed to create request"))
		return
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		logrus.WithError(err).Error("Failed to call RAG upload-file service")
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "AI文件解析服务暂时不可用"))
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		logrus.Errorf("RAG upload-file returned %d: %s", resp.StatusCode, string(respBody))
		c.JSON(http.StatusBadGateway, model.ErrorResp(502, "文件解析服务响应异常"))
		return
	}

	var ragData map[string]interface{}
	json.Unmarshal(respBody, &ragData)
	c.JSON(http.StatusOK, model.Success(ragData))
}

// ChatUploadImage 上传聊天图片到服务器（用于跨端显示）
// POST /api/v1/ai/chat/upload-image
func (h *ChatHandler) ChatUploadImage(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "图片上传失败: "+err.Error()))
		return
	}

	// 限制 10MB
	if file.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, model.ErrorResp(400, "图片大小不能超过10MB"))
		return
	}

	// 生成唯一文件名: chat-images/{timestamp}_{随机数}.ext
	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("chat-images/%d_%d%s", time.Now().Unix(), time.Now().UnixNano()%100000, ext)
	savePath := filepath.Join("uploads", filename)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResp(500, "保存图片失败"))
		return
	}

	imageURL := "/uploads/" + filename
	c.JSON(http.StatusOK, model.Success(map[string]string{"url": imageURL}))
}
