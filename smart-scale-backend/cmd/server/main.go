package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
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
	deviceRepo := repository.NewDeviceRepository()

	// 6. 初始化 Service 层
	authSvc := service.NewAuthService(userRepo, &cfg.JWT)
	userSvc := service.NewUserService(userRepo, mealRepo, authSvc)
	mealSvc := service.NewMealService(mealRepo, foodRepo)
	foodSvc := service.NewFoodService(foodRepo)
	embedSvc := service.NewEmbeddingService(&cfg.Aliyun)
	summarSvc := service.NewSummaryService(mealRepo, summaryRepo, embedRepo, embedSvc, foodRepo, cfg)
	ragSvc := service.NewRAGService(summaryRepo, adviceRepo, embedRepo, embedSvc, nil, cfg)
	deviceSvc := service.NewDeviceService(deviceRepo)

	// 7. 初始化 Handler 层
	authHandler := handler.NewAuthHandler(authSvc)
	userHandler := handler.NewUserHandler(userSvc, authSvc)
	mealHandler := handler.NewMealHandler(mealSvc)
	foodHandler := handler.NewFoodHandler(foodSvc)
	summaryHandler := handler.NewSummaryHandler(summarSvc)
	adviceHandler := handler.NewHealthAdviceHandler(ragSvc)
	dashboardHandler := handler.NewDashboardHandler(mealSvc, userSvc, foodSvc, ragSvc)
	deviceHandler := handler.NewDeviceHandler(deviceSvc, cfg.Admin.Key)
	chatHandler := handler.NewChatHandler(cfg.RAG.BaseURL)

	// 8. 创建 Gin 引擎并注册路由
	r := gin.New()
	r.Use(middleware.Logger())
	r.Use(middleware.CORS())
	r.Use(gin.Recovery())

	// 注册所有路由
	setupRoutes(r, authHandler, userHandler, mealHandler, foodHandler,
		summaryHandler, adviceHandler, dashboardHandler, authSvc, deviceHandler, deviceSvc, chatHandler)

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

// runMigrations 执行数据库迁移SQL（按文件名顺序遍历 migrations 目录下所有 .sql）
func runMigrations(cfg *config.DatabaseConfig) error {
	entries, err := os.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("failed to read migrations dir: %w", err)
	}

	ctx := context.Background()
	pool := database.GetPool()
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		path := "migrations/" + e.Name()
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", path, err)
		}
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			// 单个迁移文件失败不中断后续（如既有文件的语法瑕疵），仅警告并跳过
			logrus.WithError(err).Warnf("failed to execute %s, skipping", e.Name())
			continue
		}
		logrus.Infof("Migration applied: %s", e.Name())
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
	deviceH *handler.DeviceHandler,
	deviceSvc *service.DeviceService,
	chatH *handler.ChatHandler,
) {
	api := r.Group("/api/v1")

	// === 认证（无需JWT）===
	api.POST("/auth/register", authH.Register)
	api.POST("/auth/login", authH.Login)

	// === 测试接口（免JWT，仅供嵌入式端联调，勿用于生产）===
	api.POST("/test/weigh-in", mealH.RecordWeighInTest)

	// === 后台管理（需 X-Admin-Key，在 handler 内校验）===
	api.POST("/admin/devices", deviceH.Provision)      // 批量预登记设备
	api.POST("/admin/devices/revoke", deviceH.Revoke)  // 吊销设备

	// === 设备数据上报（设备认证：X-Device-Id + X-Device-Secret）===
	// 设备认证中间件校验通过后，注入 user_id（即设备绑定用户），复用 RecordWeighIn 逻辑
	deviceAPI := api.Group("/device")
	deviceAPI.Use(middleware.DeviceAuth(deviceSvc))
	{
		deviceAPI.POST("/weigh-in", mealH.RecordWeighIn)
	}

	// === 受保护的API（需要JWT）===
	protected := api.Group("")
	protected.Use(middleware.JWTAuth(authSvc))

	// 用户相关
	protected.GET("/user/me", authH.GetCurrentUser)
	protected.GET("/user/profile", userH.GetProfile)
	protected.PUT("/user/profile", userH.UpdateProfile)
	protected.POST("/user/medical-report", userH.UploadMedicalReport)
	protected.GET("/user/stats", userH.GetUserStats)
	protected.GET("/user/health-score", userH.GetHealthScore)
	protected.POST("/user/avatar", userH.UpdateAvatar)

	// 设备绑定管理（用户扫码绑定/解绑/查看自己的秤）
	protected.POST("/devices/bind", deviceH.Bind)
	protected.POST("/devices/unbind", deviceH.Unbind)
	protected.GET("/devices/mine", deviceH.ListMine)

	// 称重记录
	protected.POST("/weigh-in", mealH.RecordWeighIn)
	protected.GET("/records", mealH.GetHistoryRecords)
	protected.GET("/daily-summary", mealH.GetDailySummary)

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
	protected.GET("/health-advice", adviceH.ListAdvices)

	// AI 助手对话
	protected.POST("/ai/chat", chatH.Chat)
	protected.POST("/ai/chat/stream", chatH.ChatStream)
	protected.GET("/ai/chat/history", chatH.ChatHistory)

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

	// 前端静态文件服务
	r.Static("/uploads", "./uploads")
	r.Static("/assets", "./frontend/assets")
	r.Static("/frontend", "./frontend")

	// SPA路由：所有非API、非静态文件的GET请求都返回index.html
	r.NoRoute(func(c *gin.Context) {
		// 只对GET请求且非API路径返回index.html
		if c.Request.Method == "GET" && !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.File("./frontend/index.html")
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	// 首页也返回index.html
	r.GET("/", func(c *gin.Context) {
		c.File("./frontend/index.html")
	})
}
