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
		summaryHandler, adviceHandler, dashboardHandler, authSvc, deviceHandler, deviceSvc, chatHandler, cfg, summarSvc)

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
	cfg *config.Config,
	summarSvc *service.SummaryService,
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
	// 管理员批量补填日报/周报（测试/比赛演示用）
	adminKey := cfg.Admin.Key
	api.POST("/admin/summaries/backfill", func(c *gin.Context) {
		if adminKey == "" || c.GetHeader("X-Admin-Key") != adminKey {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "无效的管理员密钥"})
			return
		}
		// user_id: 必传; start_date / end_date: 可选，默认最近7天
		var req struct {
			UserID    int    `json:"user_id"`
			StartDate string `json:"start_date"`
			EndDate   string `json:"end_date"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.UserID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的 user_id"})
			return
		}
		now := time.Now()
		endDate := now
		startDate := now.AddDate(0, 0, -7)
		if req.StartDate != "" {
			if t, err := time.Parse("2006-01-02", req.StartDate); err == nil {
				startDate = t
			}
		}
		if req.EndDate != "" {
			if t, err := time.Parse("2006-01-02", req.EndDate); err == nil {
				endDate = t
			}
		}
		daily, weekly, err := summarSvc.BackfillSummaries(c.Request.Context(), req.UserID, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":      "补填完成",
			"user_id":      req.UserID,
			"start_date":   startDate.Format("2006-01-02"),
			"end_date":     endDate.Format("2006-01-02"),
			"daily_count":  daily,
			"weekly_count": weekly,
		})
	})
	// 管理员批量生成周/月/年报（用于补填历史数据）
	api.POST("/admin/summaries/incremental-backfill", func(c *gin.Context) {
		if adminKey == "" || c.GetHeader("X-Admin-Key") != adminKey {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "无效的管理员密钥"})
			return
		}
		var req struct {
			UserID int `json:"user_id"`
			Rounds int `json:"rounds"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.UserID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的 user_id"})
			return
		}
		if req.Rounds <= 0 {
			req.Rounds = 5
		}
		total := service.BackfillResult{}
		for i := 0; i < req.Rounds; i++ {
			r, err := summarSvc.IncrementalBackfill(c.Request.Context(), req.UserID)
			if err != nil {
				break
			}
			total.Weekly += r.Weekly
			total.Monthly += r.Monthly
			total.Yearly += r.Yearly
			if r.Weekly+r.Monthly+r.Yearly == 0 {
				break
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"message":     "完成",
			"user_id":     req.UserID,
			"daily":       total.Daily,
			"weekly":      total.Weekly,
			"monthly":     total.Monthly,
			"yearly":      total.Yearly,
		})
	})

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
	protected.GET("/user/avatar/reset", userH.ResetAvatar)

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
	protected.DELETE("/summaries/:id", summaryH.DeleteSummary)
	protected.DELETE("/summaries", summaryH.DeleteAllSummaries)
	protected.PUT("/summaries/:id", summaryH.UpdateSummary)
	protected.POST("/summaries/incremental-backfill", summaryH.IncrementalBackfill)

	// AI健康建议 (RAG)
	protected.POST("/health-advice/generate", adviceH.GenerateAdvice)
	protected.GET("/health-advice/latest", adviceH.GetLatestAdvice)
	protected.GET("/health-advice", adviceH.ListAdvices)

	// AI 助手对话
	protected.POST("/ai/chat", chatH.Chat)
	protected.POST("/ai/chat/stream", chatH.ChatStream)
	protected.GET("/ai/chat/history", chatH.ChatHistory)
	protected.POST("/ai/chat/reset", chatH.ResetChat)

	// 仪表盘
	protected.GET("/dashboard/stats", dashboardH.GetStats)
	protected.GET("/dashboard/recent-meals", dashboardH.GetRecentMeals)
	protected.GET("/dashboard/companion", dashboardH.GetCompanionStats)

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
