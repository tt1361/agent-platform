# Haoyitec Agent Platform Server (Java)

JDK 17 + Spring Boot 3.x + Spring AI Alibaba + MyBatis-Plus 服务端。

## 技术栈

- JDK 17
- Spring Boot 3.x
- Spring AI Alibaba (DashScope)
- MyBatis-Plus
- MySQL / Redis / Nacos / Elasticsearch

## 快速启动

1. 确保 MySQL 已启动，并创建数据库：

```sql
CREATE DATABASE IF NOT EXISTS agent_platform DEFAULT CHARACTER SET utf8mb4;
```

2. 启动服务：

```bash
cd apps/server-java
mvn spring-boot:run
```

默认端口：`8888`

## 关键路径

- Swagger: `http://localhost:8888/swagger-ui.html`
- OpenAPI: `http://localhost:8888/api-docs`
- 健康检查: `http://localhost:8888/actuator/health`
- API 前缀: `/api/v1`

## 数据初始化

开发环境会自动执行：

- `src/main/resources/db/schema.sql`
- `src/main/resources/db/data.sql`

可通过 `application-dev.yml` 中的 `spring.sql.init` 配置调整。
