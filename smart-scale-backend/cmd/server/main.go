package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/internal/database"
	"smart-scale-backend/internal/handler"
	"smart-scale-backend/internal/middleware"
	"smart-scale-backend/internal/repository"
	"smart-scale-backend/internal/service"
	"smart-scale-backend/internal/cron"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

func main() {
	// 1. 加载配置
	cfg, err := config.Load("configs/config.yaml")
	if err != nil {
		logrus.Fatalf("Failed to load config: %v", err)
	}

	// 2. 设置日志级别和Gin模式
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
		logrus.SetLevel(logrus.InfoLevel)
	} else {
		gin.SetMode(gin.DebugMode)
		logrus.SetLevel(logrus.DebugLevel)
	}
	logrus.Infof("Server mode: %s, port: %d", cfg.Server.Mode, cfg.Server.Port)

	// 3. 初始化数据库连接池
	if err := database.Init(&cfg.Database); err != nil {
		logrus.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// 4. 执行数据库迁移
	if err := runMigrations(&cfg.Database); err != nil {
		logrus.Warnf("Migration warning: %v", err)
	}

	// 5. 初始化 Repository 层
	userRepo := repository.NewUserRepository()
	mealRepo := repository.NewMealRepository()
	foodRepo := repository.NewFoodRepository()
	summaryRepo := repository.NewSummaryRepository()
	adviceRepo := repository.NewAdviceRepository()
	embedRepo := repository.NewEmbeddingRepository()

	// 6. 初始化 Service 层
	authSvc := service.NewAuthService(userRepo, &cfg.JWT)
	userSvc := service.NewUserService(userRepo, mealRepo, authSvc)
	mealSvc := service.NewMealService(mealRepo, foodRepo)
	foodSvc := service.NewFoodService(foodRepo)
	summarSvc := service.NewSummaryService(mealRepo, summaryRepo, embedRepo, nil, nil)
	embedSvc := service.NewEmbeddingService(&cfg.Aliyun)
	ragSvc := service.NewRAGService(summaryRepo, adviceRepo, embedRepo, embedSvc, nil, cfg)

	// 7. 初始化 Handler 层
	authHandler := handler.NewAuthHandler(authSvc)
	userHandler := handler.NewUserHandler(userSvc, authSvc)
	mealHandler := handler.NewMealHandler(mealSvc)
	foodHandler := handler.NewFoodHandler(foodSvc)
	summaryHandler := handler.NewSummaryHandler(summarSvc)
	adviceHandler := handler.NewHealthAdviceHandler(ragSvc)
	dashboardHandler := handler.NewDashboardHandler(mealSvc, userSvc, foodSvc, ragSvc)

	// 8. 创建 Gin 引擎并注册路由
	r := gin.New()
	r.Use(middleware.Logger())
	r.Use(middleware.CORS())
	r.Use(gin.Recovery())

	// 注册所有路由
	setupRoutes(r, authHandler, userHandler, mealHandler, foodHandler,
		summaryHandler, adviceHandler, dashboardHandler, authSvc)

	// 9. 启动定时任务（归档 + 周报RAG建议）
	cronScheduler := cron.NewScheduler(summarSvc, ragSvc, &cfg.Cron)
	go cronScheduler.Start()

	// 10. 启动 HTTP 服务器
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Server.Port),
		Handler: r,
	}

	go func() {
		logrus.Infof("Starting server on :%d", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatalf("Server failed to start: %v", err)
		}
	}()

	// 11. 优雅关闭
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logrus.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logrus.Errorf("Server forced to shutdown: %v", err)
	}
	cronScheduler.Stop()
	logrus.Info("Server exited")
}

// runMigrations 执行数据库迁移SQL
func runMigrations(cfg *config.DatabaseConfig) error {
	migrationFile := "migrations/001_init.sql"
	if _, err := os.Stat(migrationFile); os.IsNotExist(err) {
		return fmt.Errorf("migration file not found: %s", migrationFile)
	}

	content, err := os.ReadFile(migrationFile)
	if err != nil {
		return fmt.Errorf("failed to read migration file: %w", err)
	}

	ctx := context.Background()
	pool := database.GetPool()
	_, err = pool.Exec(ctx, string(content))
	if err != nil {
		return fmt.Errorf("failed to execute migration: %w", err)
	}

	logrus.Info("Database migrations executed successfully")
	return nil
}

// setupRoutes 注册所有API路由
func setupRoutes(
	r *gin.Engine,
	authH *handler.AuthHandler,
	userH *handler.UserHandler,
	mealH *handler.MealHandler,
	foodH *handler.FoodHandler,
	summaryH *handler.SummaryHandler,
	adviceH *handler.HealthAdviceHandler,
	dashboardH *handler.DashboardHandler,
	authSvc *service.AuthService,
) {
	api := r.Group("/api/v1")

	// === 认证（无需JWT）===
	api.POST("/auth/register", authH.Register)
	api.POST("/auth/login", authH.Login)

	// === 受保护的API（需要JWT）===
	protected := api.Group("")
	protected.Use(middleware.JWTAuth(authSvc))

	// 用户相关
	protected.GET("/user/me", authH.GetCurrentUser)
	protected.GET("/user/profile", userH.GetProfile)
	protected.PUT("/user/profile", userH.UpdateProfile)
	protected.POST("/user/medical-report", userH.UploadMedicalReport)

	// 称重记录
	protected.POST("/weigh-in", mealH.RecordWeighIn)
	protected.GET("/records", mealH.GetHistoryRecords)

	// 食物库
	protected.POST("/foods", foodH.AddFood)
	protected.GET("/foods", foodH.ListFoods)
	protected.GET("/foods/search", foodH.SearchFoods)

	// 营养摘要
	protected.POST("/summaries/generate", summaryH.GenerateSummary)
	protected.GET("/summaries", summaryH.GetSummaries)

	// AI健康建议 (RAG)
	protected.POST("/health-advice/generate", adviceH.GenerateAdvice)
	protected.GET("/health-advice/latest", adviceH.GetLatestAdvice)

	// 仪表盘
	protected.GET("/dashboard/stats", dashboardH.GetStats)
	protected.GET("/dashboard/recent-meals", dashboardH.GetRecentMeals)

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "smart-scale-backend",
			"version": "1.0.0",
		})
	})
}
