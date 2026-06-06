package cron

import (
	"context"

	"smart-scale-backend/internal/config"
	"smart-scale-backend/internal/service"

	"github.com/robfig/cron/v3"
	"github.com/sirupsen/logrus"
)

type Scheduler struct {
	c         *cron.Cron
	summarSvc *service.SummaryService
	ragSvc    *service.RAGService
	cfg       *config.CronConfig
}

func NewScheduler(
	summarSvc *service.SummaryService,
	ragSvc *service.RAGService,
	cfg *config.CronConfig,
) *Scheduler {
	return &Scheduler{
		c:         cron.New(),
		summarSvc: summarSvc,
		ragSvc:    ragSvc,
		cfg:       cfg,
	}
}

// Start 启动定时任务
func (s *Scheduler) Start() {
	// 每日归档任务：凌晨2点执行数据分层归档
	if _, err := s.c.AddFunc(s.cfg.DailyArchive, s.dailyArchive); err != nil {
		logrus.Errorf("Failed to schedule daily archive task: %v", err)
	} else {
		logrus.Info("Scheduled daily archive task at " + s.cfg.DailyArchive)
	}

	// 每周一生成周报和RAG建议：周一早上8点
	if _, err := s.c.AddFunc(s.cfg.WeeklyAdvice, s.weeklyAdvice); err != nil {
		logrus.Errorf("Failed to schedule weekly advice task: %v", err)
	} else {
		logrus.Info("Scheduled weekly advice task at " + s.cfg.WeeklyAdvice)
	}

	s.c.Start()
	logrus.Info("Cron scheduler started")
}

// Stop 停止定时任务
func (s *Scheduler) Stop() {
	ctx := s.c.Stop()
	<-ctx.Done()
	logrus.Info("Cron scheduler stopped")
}

// dailyArchive 每日凌晨执行数据分层归档
func (s *Scheduler) dailyArchive() {
	logrus.Info("=== Starting daily archive task ===")
	ctx := context.Background()

	// 1. 原始记录 > 1个月 → 聚合为日度汇总
	if err := s.summarSvc.ArchiveRawToDaily(ctx); err != nil {
		logrus.WithError(err).Error("Failed to archive raw records to daily summaries")
	} else {
		logrus.Info("Completed: raw → daily archive")
	}

	// 2. 日度汇总 > 3个月 → 聚合为周度摘要
	if err := s.summarSvc.ArchiveDailyToWeekly(ctx); err != nil {
		logrus.WithError(err).Error("Failed to archive daily to weekly summaries")
	} else {
		logrus.Info("Completed: daily → weekly archive")
	}

	// 3. 周度摘要 > 1年 → 聚合为月度摘要
	if err := s.summarSvc.ArchiveWeeklyToMonthly(ctx); err != nil {
		logrus.WithError(err).Error("Failed to archive weekly to monthly summaries")
	} else {
		logrus.Info("Completed: weekly → monthly archive")
	}

	// 4. 月度汇总 > 3年 → 聚合为年度摘要
	if err := s.summarSvc.ArchiveMonthlyToYearly(ctx); err != nil {
		logrus.WithError(err).Error("Failed to archive monthly to yearly summaries")
	} else {
		logrus.Info("Completed: monthly → yearly archive")
	}

	logrus.Info("=== Daily archive task completed ===")
}

// weeklyAdvice 每周一生成上周营养摘要并触发RAG建议
func (s *Scheduler) weeklyAdvice() {
	logrus.Info("=== Starting weekly RAG advice task ===")

	// 获取所有活跃用户，为每个用户生成周报和建议
	// 实际实现中应从数据库查询用户列表

	logrus.Info("=== Weekly RAG advice task completed ===")
}
