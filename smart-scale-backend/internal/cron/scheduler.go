package cron

import (
	"context"
	"time"

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

// dailyArchive 每日凌晨2点执行：为昨天生成日报 + 数据分层归档
func (s *Scheduler) dailyArchive() {
	logrus.Info("=== Starting daily archive task ===")
	ctx := context.Background()

	// Step 1: 为昨天有记录的所有用户生成日报
	yesterday := time.Now().AddDate(0, 0, -1)
	userIDs, err := s.summarSvc.GetAllActiveUserIDs(ctx)
	if err != nil {
		logrus.WithError(err).Error("Failed to get active user list")
	} else {
		for _, uid := range userIDs {
			if _, genErr := s.summarSvc.GenerateDailyForDate(ctx, uid, yesterday); genErr != nil {
				logrus.WithError(genErr).Warnf("Daily summary failed for user %d", uid)
			}
		}
		logrus.Infof("Generated daily summaries for yesterday (%s): %d users checked", yesterday.Format("2006-01-02"), len(userIDs))
	}

	// Step 2: 数据分层归档（旧数据聚合）
	if err := s.summarSvc.RunArchiveJob(ctx); err != nil {
		logrus.WithError(err).Error("Archive job failed")
	}

	logrus.Info("=== Daily archive task completed ===")
}

// weeklyAdvice 每周一早上8点：为每个活跃用户生成上周周报
func (s *Scheduler) weeklyAdvice() {
	logrus.Info("=== Starting weekly report generation task ===")
	ctx := context.Background()

	// 获取所有活跃用户
	userIDs, err := s.summarSvc.GetAllActiveUserIDs(ctx)
	if err != nil {
		logrus.WithError(err).Error("Failed to get active user list for weekly report")
		return
	}

	generatedCount := 0
	for _, uid := range userIDs {
		summary, genErr := s.summarSvc.GenerateWeeklySummary(ctx, uid)
		if genErr != nil {
			logrus.WithError(genErr).Warnf("Weekly summary failed for user %d", uid)
		}
		if summary != nil {
			generatedCount++
		}
	}

	logrus.Infof("=== Weekly report task completed: %d/%d users generated ===", generatedCount, len(userIDs))
}
