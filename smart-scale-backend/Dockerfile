# Smart Scale Backend — 使用本地预编译二进制，避免 Docker 内网络问题
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY smart-scale-server .
COPY configs/ ./configs/
COPY migrations/ ./migrations/

RUN mkdir -p uploads && chmod 755 uploads

EXPOSE 8080

CMD ["./smart-scale-server"]
