package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/spf13/viper"
)

var (
	cfg  *Config
	once sync.Once
)

// Config 应用全局配置
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	Aliyun   AliyunConfig   `mapstructure:"aliyun"`
	Upload   UploadConfig   `mapstructure:"upload"`
	Cron     CronConfig     `mapstructure:"cron"`
	Admin    AdminConfig    `mapstructure:"admin"`
	RAG      RAGConfig      `mapstructure:"rag"`
}

// RAGConfig RAG服务地址
type RAGConfig struct {
	BaseURL string `mapstructure:"base_url"` // RAG service 地址，默认 http://localhost:8001
}

// AdminConfig 后台管理配置（设备预登记等）
type AdminConfig struct {
	Key string `mapstructure:"key"` // 调用 /admin 接口需在 X-Admin-Key 头携带此值
}

// ServerConfig HTTP服务器配置
type ServerConfig struct {
	Port int    `mapstructure:"port"`
	Mode string `mapstructure:"mode"`
}

// DatabaseConfig 数据库连接配置
type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
	SSLMode  string `mapstructure:"sslmode"`
}

// DSN 返回 PostgreSQL 连接字符串
func (d *DatabaseConfig) DSN() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.DBName, d.SSLMode)
}

// JWTConfig JWT认证配置
type JWTConfig struct {
	Secret      string `mapstructure:"secret"`
	ExpireHours int    `mapstructure:"expire_hours"`
}

// AliyunConfig 阿里云DashScope配置
type AliyunConfig struct {
	APIKey         string `mapstructure:"api_key"`
	TextModel      string `mapstructure:"text_model"`
	VLModel        string `mapstructure:"vl_model"`
	EmbeddingModel string `mapstructure:"embedding_model"`
}

// UploadConfig 文件上传配置
type UploadConfig struct {
	Path       string `mapstructure:"path"`
	MaxSizeMB  int    `mapstructure:"max_size_mb"`
}

// CronConfig 定时任务配置
type CronConfig struct {
	WeeklyAdvice string `mapstructure:"weekly_advice"`
	DailyArchive string `mapstructure:"daily_archive"`
}

// Load 加载配置文件，支持环境变量覆盖
func Load(configPath string) (*Config, error) {
	var loadErr error
	once.Do(func() {
		v := viper.New()
		v.SetConfigFile(configPath)
		v.SetConfigType("yaml")

		// 支持环境变量覆盖（大小写不敏感）
		v.AutomaticEnv()
		v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

		if err := v.ReadInConfig(); err != nil {
			loadErr = fmt.Errorf("failed to read config file: %w", err)
			return
		}

		cfg = &Config{}
		if err := v.Unmarshal(cfg); err != nil {
			loadErr = fmt.Errorf("failed to unmarshal config: %w", err)
			return
		}

		// 显式环境变量覆盖（Docker 部署用）
		if h := os.Getenv("DATABASE_HOST"); h != "" {
			cfg.Database.Host = h
		}
		if p := os.Getenv("DATABASE_PORT"); p != "" {
			if pi, err := strconv.Atoi(p); err == nil {
				cfg.Database.Port = pi
			}
		}
		if u := os.Getenv("DATABASE_USER"); u != "" {
			cfg.Database.User = u
		}
		if pw := os.Getenv("DATABASE_PASSWORD"); pw != "" {
			cfg.Database.Password = pw
		}
		if db := os.Getenv("DATABASE_DBNAME"); db != "" {
			cfg.Database.DBName = db
		}
	})

	return cfg, loadErr
}

// Get 返回全局配置实例
func Get() *Config {
	return cfg
}
