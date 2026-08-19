package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"strings"
	"time"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/pkg/dashscope"

	"github.com/sirupsen/logrus"
)

// PhotoRecognitionService 图片识别服务（调用阿里云 qwen3-vl-flash 多模态模型）
type PhotoRecognitionService struct {
	client *dashscope.Client
	cfg    *config.AliyunConfig
}

func NewPhotoRecognitionService(cfg *config.AliyunConfig) *PhotoRecognitionService {
	return &PhotoRecognitionService{
		client: dashscope.NewClient(cfg.APIKey),
		cfg:    cfg,
	}
}

// PhotoFoodItem 识别出的单个食物
type PhotoFoodItem struct {
	Name    string  `json:"name"`     // 食物/菜品名称
	Count   int     `json:"count"`    // 数量
	WeightG float64 `json:"weight_g"` // 估算克重
}

// PhotoNutrients 识别出的营养素（11项）
type PhotoNutrients struct {
	EnergyKcal      float64 `json:"energy_kcal"`
	ProteinG        float64 `json:"protein_g"`
	FatG            float64 `json:"fat_g"`
	CarbohydrateG   float64 `json:"carbohydrate_g"`
	SodiumMg        float64 `json:"sodium_mg"`
	CholesterolMg   float64 `json:"cholesterol_mg"`
	VitaminCMg      float64 `json:"vitamin_c_mg"`
	CalciumMg       float64 `json:"calcium_mg"`
	IronMg          float64 `json:"iron_mg"`
	PotassiumMg     float64 `json:"potassium_mg"`
}

// PhotoRecognitionResult 图片识别结果
type PhotoRecognitionResult struct {
	Foods        []PhotoFoodItem `json:"foods"`
	TotalWeightG float64         `json:"total_weight_g"`
	Nutrients    PhotoNutrients  `json:"nutrients"`
	RawText      string          `json:"raw_text,omitempty"` // AI 原始返回文本（调试用）
}

// RecognizeFoodFromImage 调用多模态模型识别图片中的食物
// imageBytes: 图片字节；mimeType: 如 "image/jpeg"
func (s *PhotoRecognitionService) RecognizeFoodFromImage(imageBytes []byte, mimeType string) (*PhotoRecognitionResult, error) {
	start := time.Now()

	// 1. 图片压缩到 512px 宽以内，减少传输和推理时间
	imageBytes = resizeImage(imageBytes, 384)

	// 2. 图片转 base64 data URI
	if mimeType == "" {
		mimeType = "image/jpeg"
	}
	dataURI := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(imageBytes))

	// 2. 构建提示词 — 识别图片中的食物为一道菜
	prompt := `你是一位专业的营养分析师。请分析图片中的食物，识别出这是什么菜（一道完整的菜品名称，如"红烧肉""番茄炒蛋""清蒸鱼"），并估算总重量和11项营养素。

严格规则：
1. 如果图片中是烹饪完成的成品菜，请给出这道菜的完整名称（不要拆分成单个食材）。如果是生水果蔬菜，直接说出最主要的水果/蔬菜名（如"苹果""番茄"），不要合并成"水果拼盘"之类笼统名称
2. foods数组只包含一个元素：{"name": "食物名称", "count": 1, "weight_g": 估算总克重}
3. 名称要简洁准确，禁止使用"混合""拼盘""杂"等笼统词汇
4. 图片中如果有碟子、托盘、包装等容器，那容器重量不算在内

请严格按照以下JSON格式返回（不要包含markdown代码块标记、不要包含任何其他文字解释，只返回纯JSON）：
{
  "foods": [{"name": "食物名称", "count": 1, "weight_g": 总克重}],
  "total_weight_g": 总克重,
  "nutrients": {
    "energy_kcal": 热量,
    "protein_g": 蛋白质,
    "fat_g": 脂肪,
    "carbohydrate_g": 碳水,
    "sodium_mg": 钠,
    "cholesterol_mg": 胆固醇,
    "vitamin_c_mg": 维生素C,
    "calcium_mg": 钙,
    "iron_mg": 铁,
    "potassium_mg": 钾
  }
}

注意：
- 所有数值用数字类型，不要用字符串
- 如果图片中没有食物，返回 {"foods":[],"total_weight_g":0,"nutrients":{"energy_kcal":0,"protein_g":0,"fat_g":0,"carbohydrate_g":0,"sodium_mg":0,"cholesterol_mg":0,"vitamin_c_mg":0,"calcium_mg":0,"iron_mg":0,"potassium_mg":0}}
- 营养素是基于食物类型和克重的合理估算`

	// 3. 构建多模态消息
	disableThinking := false
	req := &dashscope.ChatCompletionRequest{
		Model:    s.cfg.VLModel,
		MaxTokens: 800,
		Temperature: 0.1,
		EnableThinking: &disableThinking, // 关闭思考链
		Messages: []dashscope.ChatMessage{
			{
				Role: "user",
				Content: []dashscope.ChatContentPart{
					{Type: "text", Text: prompt},
					{Type: "image_url", ImageURL: &dashscope.ChatImageURL{URL: dataURI}},
				},
			},
		},
	}

	// 4. 调用模型
	resp, err := s.client.ChatCompletion(req)
	if err != nil {
		logrus.WithError(err).Error("Photo recognition API call failed")
		return nil, fmt.Errorf("图片识别服务调用失败: %w", err)
	}

	rawText := resp.ExtractContent()
	logrus.WithFields(logrus.Fields{
		"duration_ms": time.Since(start).Milliseconds(),
		"tokens":      resp.Usage.TotalTokens,
		"raw_len":     len(rawText),
	}).Info("Photo recognition completed")

	// 5. 解析 JSON（模型可能返回带 markdown 代码块的文本，需清理）
	result, err := parsePhotoJSON(rawText)
	if err != nil {
		logrus.WithError(err).WithField("raw_text", rawText).Warn("Failed to parse photo recognition JSON")
		return nil, fmt.Errorf("识别结果解析失败: %w", err)
	}
	result.RawText = rawText
	return result, nil
}

// RecognizeIngredientsFromImage 食材模式识别：逐项识别图中的食物
func (s *PhotoRecognitionService) RecognizeIngredientsFromImage(imageBytes []byte, mimeType string) (*PhotoRecognitionResult, error) {
	start := time.Now()

	imageBytes = resizeImage(imageBytes, 384)

	if mimeType == "" {
		mimeType = "image/jpeg"
	}
	dataURI := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(imageBytes))

	prompt := `你是一位专业的营养分析师。请仔细扫描整张图片，找出图中所有食物，逐个识别每种食物的名称和估算重量（克）。必须逐一列出，不要合并。

规则：
1. 必须逐个识别图中每一种食物（如"苹果""橙子""番茄""鸡蛋""猪肉""米饭"），严禁合并成一个名称（如"混合水果""水果拼盘"）
2. 如果图中是已经做好的菜（如番茄炒蛋），请反向拆解出其中的主要食材（如"鸡蛋""番茄"）
3. foods数组每个元素对应一种食材：{"name": "食材名", "count": 个数, "weight_g": 估算克重}
4. total_weight_g 为所有食材总克重
5. 食材名称用中文，简洁准确
6. 忽略容器、包装袋、餐具等非食物物品
7. 根据形状、颜色判断，不确定是什么食物就推断最可能的

请严格按照以下JSON格式返回（不要包含markdown代码块，只返回纯JSON）：
{
  "foods": [{"name": "食材名", "count": 个数, "weight_g": 克重}],
  "total_weight_g": 总克重,
  "nutrients": {
    "energy_kcal": 热量, "protein_g": 蛋白质, "fat_g": 脂肪, "carbohydrate_g": 碳水,
    "sodium_mg": 钠, "cholesterol_mg": 胆固醇, "vitamin_c_mg": 维生素C,
    "calcium_mg": 钙, "iron_mg": 铁, "potassium_mg": 钾
  }
}

注意：
- 所有数值用数字类型，不要用字符串
- 图中没有食物时返回空的foods数组
- 营养素是基于食材类型和克重的合理估算`

	disableThinking := false
	req := &dashscope.ChatCompletionRequest{
		Model:       s.cfg.VLModel,
		MaxTokens:   800,
		Temperature: 0.3,
		EnableThinking: &disableThinking, // 关闭思考链
		Messages: []dashscope.ChatMessage{
			{
				Role: "user",
				Content: []dashscope.ChatContentPart{
					{Type: "text", Text: prompt},
					{Type: "image_url", ImageURL: &dashscope.ChatImageURL{URL: dataURI}},
				},
			},
		},
	}

	resp, err := s.client.ChatCompletion(req)
	if err != nil {
		logrus.WithError(err).Error("Ingredient recognition API call failed")
		return nil, fmt.Errorf("食材识别服务调用失败: %w", err)
	}

	rawText := resp.ExtractContent()
	logrus.WithFields(logrus.Fields{
		"duration_ms": time.Since(start).Milliseconds(),
		"tokens":      resp.Usage.TotalTokens,
		"raw_len":     len(rawText),
	}).Info("Ingredient recognition completed")

	result, err := parsePhotoJSON(rawText)
	if err != nil {
		logrus.WithError(err).WithField("raw_text", rawText).Warn("Failed to parse ingredient recognition JSON")
		return nil, fmt.Errorf("食材识别结果解析失败: %w", err)
	}
	result.RawText = rawText
	return result, nil
}

// RecognizeCookedDishFromImage 器件端正餐识别：图像 + 秤测得的已知重量 → AI 识别菜名 + 计算营养素
func (s *PhotoRecognitionService) RecognizeCookedDishFromImage(imageBytes []byte, mimeType string, weightG float64) (*PhotoRecognitionResult, error) {
	start := time.Now()

	if mimeType == "" {
		mimeType = "image/jpeg"
	}
	// 压缩图片到512px宽，减少传输体积和token消耗
	imageBytes = resizeImage(imageBytes, 512)
	dataURI := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(imageBytes))

	prompt := fmt.Sprintf(`你是一位专业的营养分析师。请分析图片中的菜品，识别出这是什么菜（一道完整的菜品名称，如"红烧肉""番茄炒蛋""清蒸鱼"），并根据给定的总重量计算11项营养素。

已知：这道菜的总重量是 %.1f 克。不需要你估算重量，直接用这个重量计算营养素。

严格规则：
1. 图片显示的是一道已经烹饪完成的成品菜，请给出这道菜的完整名称（不要拆分成单个食材）
2. foods数组只包含一个元素：{"name": "完整菜品名称", "count": 1, "weight_g": %.1f}
3. total_weight_g 仍为 %.1f
4. 菜品名称要简洁准确——红烧肉不要写成"红烧五花肉"，火腿炒蛋不要写成"炒鸡蛋、火腿肠"
5. nutrients里的数值是基于菜品类型和 %.1f 克的营养计算，不要用100g基准

请严格按照以下JSON格式返回（不要包含markdown代码块标记，只返回纯JSON）：
{
  "foods": [{"name": "菜品名称", "count": 1, "weight_g": %.1f}],
  "total_weight_g": %.1f,
  "nutrients": {
    "energy_kcal": 热量, "protein_g": 蛋白质, "fat_g": 脂肪, "carbohydrate_g": 碳水,
    "sodium_mg": 钠, "cholesterol_mg": 胆固醇, "vitamin_c_mg": 维生素C,
    "calcium_mg": 钙, "iron_mg": 铁, "potassium_mg": 钾
  }
}`, weightG, weightG, weightG, weightG, weightG, weightG)

	disableThinking := false
	req := &dashscope.ChatCompletionRequest{
		Model:    s.cfg.VLModel,
		MaxTokens: 800,
		Temperature: 0.1,
		EnableThinking: &disableThinking, // 关闭思考链，加速响应
		Messages: []dashscope.ChatMessage{
			{
				Role: "user",
				Content: []dashscope.ChatContentPart{
					{Type: "text", Text: prompt},
					{Type: "image_url", ImageURL: &dashscope.ChatImageURL{URL: dataURI}},
				},
			},
		},
	}

	resp, err := s.client.ChatCompletion(req)
	if err != nil {
		logrus.WithError(err).Error("Cooked dish recognition API call failed")
		return nil, fmt.Errorf("正餐识别服务调用失败: %w", err)
	}

	rawText := resp.ExtractContent()
	logrus.WithFields(logrus.Fields{
		"duration_ms": time.Since(start).Milliseconds(),
		"tokens":      resp.Usage.TotalTokens,
		"weight_g":    weightG,
	}).Info("Cooked dish recognition completed")

	result, err := parsePhotoJSON(rawText)
	if err != nil {
		logrus.WithError(err).WithField("raw_text", rawText).Warn("Failed to parse cooked dish JSON")
		return nil, fmt.Errorf("识别结果解析失败: %w", err)
	}
	result.RawText = rawText
	return result, nil
}

// parsePhotoJSON 从模型返回的文本中提取并解析 JSON
func parsePhotoJSON(text string) (*PhotoRecognitionResult, error) {
	cleaned := strings.TrimSpace(text)

	// 去除可能的 markdown 代码块标记 ```json ... ``` 或 ``` ... ```
	if strings.HasPrefix(cleaned, "```") {
		// 去掉开头的 ```json 或 ```
		if idx := strings.Index(cleaned, "\n"); idx > 0 {
			cleaned = cleaned[idx+1:]
		}
		// 去掉结尾的 ```
		cleaned = strings.TrimSuffix(cleaned, "```")
		cleaned = strings.TrimSpace(cleaned)
	}

	// 提取第一个 { 到最后一个 } 之间的内容
	start := strings.Index(cleaned, "{")
	end := strings.LastIndex(cleaned, "}")
	if start < 0 || end < 0 || end <= start {
		return nil, fmt.Errorf("no JSON object found in response")
	}
	jsonStr := cleaned[start : end+1]

	var result PhotoRecognitionResult
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return nil, fmt.Errorf("JSON unmarshal failed: %w", err)
	}

	// 确保 foods 数组不为 nil
	if result.Foods == nil {
		result.Foods = []PhotoFoodItem{}
	}

	return &result, nil
}

// resizeImage 将图片缩放到指定最大宽度，保持比例，返回 JPEG 字节
func resizeImage(imgBytes []byte, maxWidth int) []byte {
	src, _, err := image.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return imgBytes
	}
	bounds := src.Bounds()
	w := bounds.Dx()
	if w <= maxWidth {
		return imgBytes
	}
	h := bounds.Dy() * maxWidth / w
	dst := image.NewRGBA(image.Rect(0, 0, maxWidth, h))
	for y := 0; y < h; y++ {
		for x := 0; x < maxWidth; x++ {
			sx := x * w / maxWidth
			sy := y * bounds.Dy() / h
			dst.Set(x, y, src.At(sx+bounds.Min.X, sy+bounds.Min.Y))
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 40}); err != nil {
		return imgBytes
	}
	return buf.Bytes()
}
