package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

// getEmbeddingDimension 从配置获取向量维度，默认 1024
func getEmbeddingDimension() int {
	if cfg := config.Get(); cfg != nil && cfg.Aliyun.EmbeddingDimension > 0 {
		return cfg.Aliyun.EmbeddingDimension
	}
	return 1024
}

type EmbeddingRepository struct {
	pool *pgxpool.Pool
}

func NewEmbeddingRepository() *EmbeddingRepository {
	return &EmbeddingRepository{pool: database.Pool}
}

// Save 保存向量嵌入
func (r *EmbeddingRepository) Save(ctx context.Context, emb *model.UserHealthEmbedding) error {
	metadataJSON, _ := json.Marshal(emb.Metadata)

	// pgvector 需要 "[0.1,0.2,...]" 格式的字符串
	vecStr := floatsToVectorStr(emb.Embedding)

	query := `INSERT INTO user_health_embeddings 
		(user_id, source_type, source_date, content_text, embedding, metadata, created_at)
		VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb, NOW())
		RETURNING id, created_at`

	err := r.pool.QueryRow(ctx, query,
		emb.UserID, emb.SourceType, emb.SourceDate, emb.ContentText,
		vecStr, metadataJSON,
	).Scan(&emb.ID, &emb.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to save embedding: %w", err)
	}
	return nil
}

// floatsToVectorStr 将 []float64 转为 pgvector 格式字符串 "[0.1,0.2,...]"
func floatsToVectorStr(vec []float64) string {
	strs := make([]string, len(vec))
	for i, v := range vec {
		strs[i] = fmt.Sprintf("%v", v)
	}
	return "[" + strings.Join(strs, ",") + "]"
}

// SearchSimilar 检索最相似的向量（Top-K，余弦相似度）
func (r *EmbeddingRepository) SearchSimilar(ctx context.Context, userID int, queryVec []float64, topK int) ([]model.EmbeddingSearchResult, error) {
	query := fmt.Sprintf(`
		SELECT id, user_id, source_type, source_date, content_text, embedding, metadata, created_at,
			   1 - (embedding <=> $1::vector) as similarity
		FROM user_health_embeddings
		WHERE user_id = $2
		ORDER BY embedding <=> $1::vector
		LIMIT %d`, topK)

	rows, err := r.pool.Query(ctx, query, floatsToVectorStr(queryVec), userID)
	if err != nil {
		return nil, fmt.Errorf("failed to search similar embeddings: %w", err)
	}
	defer rows.Close()

	var results []model.EmbeddingSearchResult
	for rows.Next() {
		var esr model.EmbeddingSearchResult
		var metaJSON []byte
		embVec := make([]float64, getEmbeddingDimension())

		if err := rows.Scan(
			&esr.Embedding.ID, &esr.Embedding.UserID, &esr.Embedding.SourceType,
			&esr.Embedding.SourceDate, &esr.Embedding.ContentText, &embVec,
			&metaJSON, &esr.Embedding.CreatedAt, &esr.Similarity,
		); err != nil {
			continue
		}

		esr.Embedding.Embedding = embVec
		json.Unmarshal(metaJSON, &esr.Embedding.Metadata)
		results = append(results, esr)
	}
	return results, nil
}

// SearchGlobalSimilar 全局相似检索（跨用户，用于发现模式）
func (r *EmbeddingRepository) SearchGlobalSimilar(ctx context.Context, queryVec []float64, topK int, excludeUserID int) ([]model.EmbeddingSearchResult, error) {
	query := fmt.Sprintf(`
		SELECT id, user_id, source_type, source_date, content_text, embedding, metadata, created_at,
			   1 - (embedding <=> $1::vector) as similarity
		FROM user_health_embeddings
		WHERE user_id != $2
		ORDER BY embedding <=> $1::vector
		LIMIT %d`, topK)

	rows, err := r.pool.Query(ctx, query, queryVec, excludeUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to search global similar embeddings: %w", err)
	}
	defer rows.Close()

	var results []model.EmbeddingSearchResult
	for rows.Next() {
		var esr model.EmbeddingSearchResult
		var metaJSON []byte
		embVec := make([]float64, getEmbeddingDimension())

		if err := rows.Scan(
			&esr.Embedding.ID, &esr.Embedding.UserID, &esr.Embedding.SourceType,
			&esr.Embedding.SourceDate, &esr.Embedding.ContentText, &embVec,
			&metaJSON, &esr.Embedding.CreatedAt, &esr.Similarity,
		); err != nil {
			continue
		}
		esr.Embedding.Embedding = embVec
		json.Unmarshal(metaJSON, &esr.Embedding.Metadata)
		results = append(results, esr)
	}
	return results, nil
}

// DeleteBySourceAndDate 删除指定来源和日期的嵌入
func (r *EmbeddingRepository) DeleteBySourceAndDate(ctx context.Context, userID int, sourceType string, date interface{}) (int64, error) {
	query := `DELETE FROM user_health_embeddings WHERE user_id = $1 AND source_type = $2 AND source_date = $3`
	result, err := r.pool.Exec(ctx, query, userID, sourceType, date)
	if err != nil {
		return 0, fmt.Errorf("failed to delete embeddings: %w", err)
	}
	return result.RowsAffected(), nil
}

// CountByUser 统计用户的嵌入数量
func (r *EmbeddingRepository) CountByUser(ctx context.Context, userID int) (int64, error) {
	var count int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM user_health_embeddings WHERE user_id = $1`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count embeddings: %w", err)
	}
	return count, nil
}

// GetUserHistoryTexts 获取用户的历史文本数据（用于构建RAG上下文）
func (r *EmbeddingRepository) GetUserHistoryTexts(ctx context.Context, userID int, sourceTypes []string, limit int) ([]string, error) {
	query := `
		SELECT content_text FROM user_health_embeddings
		WHERE user_id = $1 AND source_type = ANY($2)
		ORDER BY source_date DESC LIMIT $3`

	rows, err := r.pool.Query(ctx, query, userID, sourceTypes, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get user history texts: %w", err)
	}
	defer rows.Close()

	var texts []string
	for rows.Next() {
		var text string
		if err := rows.Scan(&text); err != nil {
			continue
		}
		texts = append(texts, text)
	}
	return texts, nil
}
