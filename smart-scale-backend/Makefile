# 编译
build:
	go build -o bin/server ./cmd/server

# 运行
run: build
	./bin/server

# 数据库迁移
migrate:
	psql -h localhost -U postgres -d smart_scale -f migrations/001_init.sql

# 清理
clean:
	rm -rf bin/

# 安装依赖
deps:
	go mod download
	go mod tidy

# 生成测试数据
test-data:
	go run scripts/generate_test_data.go

# Docker构建并运行
docker-up:
	docker-compose up -d --build

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

.PHONY: build run migrate clean deps test-data docker-up docker-down docker-logs
