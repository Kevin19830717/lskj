package database

import (
	"context"
	"fmt"

	"smart-scale-backend/internal/config"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sirupsen/logrus"
)

var (
 Pool *pgxpool.Pool
)

// Init 初始化数据库连接池
func Init(cfg *config.DatabaseConfig) error {
	poolConfig, err := pgxpool.ParseConfig(cfg.DSN())
	if err != nil {
		return fmt.Errorf("failed to parse database config: %w", err)
	}

	// 连接池配置
	poolConfig.MaxConns = 25
	poolConfig.MinConns = 5
	poolConfig.MaxConnLifetime = 0 // 无过期时间

	Pool, err = pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	// 测试连接
	if err := Pool.Ping(context.Background()); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	logrus.Info("Database connection pool initialized successfully")
	return nil
}

// Close 关闭连接池
func Close() {
	if Pool != nil {
		Pool.Close()
		logrus.Info("Database connection pool closed")
	}
}

// GetPool 获取连接池实例
func GetPool() *pgxpool.Pool {
	return Pool
}

// InTransaction 在事务中执行操作
func InTransaction(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p) // re-throw panic after rollback
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			logrus.WithError(rbErr).Error("failed to rollback transaction")
		}
		return err
	}

	return tx.Commit(ctx)
}
