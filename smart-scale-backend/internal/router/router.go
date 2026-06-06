package router

import (
	"smart-scale-backend/internal/handler"
	"smart-scale-backend/internal/middleware"
	"smart-scale-backend/internal/service"

	"github.com/gin-gonic/gin"
)

// Router 路由注册器
type Router struct {
	engine       *gin.Engine
	authHandler  *handler.AuthHandler
	userHandler  *handler.UserHandler
	mealHandler  *handler.MealHandler
	foodHandler  *handler.FoodHandler
	summHandler  *handler.SummaryHandler
	adviceHandler *handler.HealthAdviceHandler
	dashHandler  *handler.DashboardHandler
	jwtMiddleware gin.HandlerFunc
}

// NewRouter 创建路由实例
func NewRouter(
	authH *handler.AuthHandler,
	userH *handler.UserHandler,
	mealH *handler.MealHandler,
	foodH *handler.FoodHandler,
	summH *handler.SummaryHandler,
	adviceH *handler.HealthAdviceHandler,
	dashH *handler.DashboardHandler,
	authSrv *service.AuthService,
) *Router {
	r := &Router{
		authHandler:  authH,
		userHandler:  userH,
		mealHandler:  mealH,
		foodHandler:  foodH,
		summHandler:  summH,
		adviceHandler: adviceH,
		dashHandler:  dashH,
		jwtMiddleware: middleware.JWTAuth(authSrv),
	}
	r.engine = r.setupEngine()
	r.registerRoutes()
	return r
}

// setupEngine 设置Gin引擎
func (r *Router) setupEngine() *gin.Engine {
	gin.SetMode(gin.DebugMode)
	engine := gin.New()

	// 全局中间件
	engine.Use(middleware.CORS())
	engine.Use(middleware.Logger())
	engine.Use(gin.Recovery())

	return engine
}

// registerRoutes 注册所有路由
func (r *Router) registerRoutes() {
	api := r.engine.Group("/api/v1")
	{
		// ====== 公开接口（无需登录）======
		auth := api.Group("/auth")
		{
			auth.POST("/register", r.authHandler.Register)
			auth.POST("/login", r.authHandler.Login)
		}

		// ====== 需要认证的接口 ======
		authed := api.Group("")
		authed.Use(r.jwtMiddleware)
		{
			// 用户相关
			user := authed.Group("/user")
			{
				user.GET("/me", r.authHandler.GetCurrentUser)              // 当前用户信息
				user.GET("/profile", r.userHandler.GetProfile)             // 获取画像
				user.PUT("/profile", r.userHandler.UpdateProfile)          // 更新画像
				user.POST("/medical-report", r.userHandler.UploadMedicalReport) // 上传体检报告
				user.GET("/stats", r.userHandler.GetUserStats)             // 统计信息
				user.GET("/health-score", r.userHandler.GetHealthScore)    // 健康评分
				user.POST("/avatar", r.userHandler.UpdateAvatar)           // 更新头像
			}

			// 称重数据上报与查询（嵌入式端调用）
			weigh := authed.Group("")
			{
				weigh.POST("/weigh-in", r.mealHandler.RecordWeighIn)      // 上报称重数据
				weigh.GET("/records", r.mealHandler.GetHistoryRecords)    // 历史记录查询
				weigh.GET("/daily-summary", r.mealHandler.GetDailySummary)// 单日摘要
			}

			// 食物库管理
			authed.POST("/foods", r.foodHandler.AddFood)
			authed.GET("/foods/search", r.foodHandler.SearchFoods)
			authed.GET("/foods", r.foodHandler.ListFoods) // 支持 ?id= 获取详情

			// 营养分析摘要
			summaries := authed.Group("/summaries")
			{
				summaries.POST("/generate", r.summHandler.GenerateSummary) // 手动生成摘要
				summaries.GET("", r.summHandler.GetSummaries)               // 查看摘要列表
			}

			// AI健康建议（RAG）
			advice := authed.Group("/health-advice")
			{
				advice.POST("/generate", r.adviceHandler.GenerateAdvice)   // 生成AI建议
				advice.GET("/latest", r.adviceHandler.GetLatestAdvice)     // 最新建议
				advice.GET("", r.adviceHandler.ListAdvices)                // 建议列表
			}

			// 仪表盘
			dashboard := authed.Group("/dashboard")
			{
				dashboard.GET("/stats", r.dashHandler.GetStats)            // 统计概览
				dashboard.GET("/recent-meals", r.dashHandler.GetRecentMeals) // 最近餐食
			}
		}
	}

	// 健康检查端点
	r.engine.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "timestamp": time.Now().Unix()})
	})

	// 前端静态文件服务
	r.engine.Static("/uploads", "./uploads")
	r.engine.StaticFile("/", "./frontend/index.html")
	r.engine.Static("/frontend", "./frontend")
}

// GetEngine 返回Gin引擎实例
func (r *Router) GetEngine() *gin.Engine {
	return r.engine
}

// Run 启动HTTP服务器
func (r *Router) Run(addr string) error {
	log.Printf("🚀 Smart Scale Backend server starting on %s", addr)
	return r.engine.Run(addr)
}
