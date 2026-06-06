# Multi-stage build for Smart Scale Backend
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /smart-scale-server cmd/server/main.go

# Runtime stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY --from=builder /smart-scale-server .
COPY configs/ ./configs/
COPY migrations/ ./migrations/
COPY frontend/ ./frontend/

RUN mkdir -p uploads && chmod 755 uploads

EXPOSE 8080

CMD ["./smart-scale-server"]
