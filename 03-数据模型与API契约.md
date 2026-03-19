# 智能体平台 - 数据模型与 API 契约

本文档定义 MVP 阶段的数据模型、状态模型和 REST API 契约，作为后端实现、前端联调和测试验收的统一基线。

---

## 1. 文档范围

本文件仅覆盖 MVP 范围内的核心对象：

- Agent
- Skill
- LLM Provider
- Execution
- Execution Trace

以下内容不在本次契约冻结范围内：

- Workflow DAG
- Skill 灰度发布
- 多租户权限体系
- 向量库 / RAG
- Marketplace / 插件市场

---

## 2. 术语定义

### 2.1 Agent

可被配置、保存和执行的智能体实体，负责在给定任务下调用 LLM 与 Skill 完成目标。

### 2.2 Skill

可被 Agent 调用的工具能力单元，包含名称、版本、参数 Schema、返回 Schema 与执行逻辑。

### 2.3 LLM Provider

对外部模型服务的统一抽象，封装模型标识、接入配置、可用性和成本指标。

### 2.4 Execution

一次 Agent 任务执行的主记录，保存任务输入、状态、输出摘要、耗时、token 和成本信息。

### 2.5 Trace

一次 Execution 内的详细步骤记录，保存 Thought、Action、Observation、Final Answer 或错误信息。

---

## 3. 核心状态模型

### 3.1 Agent 状态

| 状态 | 含义 |
|------|------|
| `draft` | 草稿，尚未启用 |
| `active` | 可执行 |
| `archived` | 已归档，不可执行 |

### 3.2 Skill 状态

| 状态 | 含义 |
|------|------|
| `active` | 可被调用 |
| `deprecated` | 仍可查询，不建议继续使用 |
| `disabled` | 不可调用 |

### 3.3 LLM Provider 状态

| 状态 | 含义 |
|------|------|
| `active` | 可参与路由 |
| `inactive` | 配置存在但不参与调用 |
| `testing` | 仅用于测试连接 |
| `error` | 最近健康检查失败 |

### 3.4 Execution 状态

| 状态 | 含义 |
|------|------|
| `pending` | 已创建，等待执行 |
| `running` | 正在执行 |
| `succeeded` | 执行成功 |
| `failed` | 执行失败 |
| `timeout` | 执行超时 |
| `cancelled` | 被取消 |

状态流转规则：

- 同步执行：`pending -> running -> succeeded/failed/timeout`
- 异步执行：`pending -> running -> succeeded/failed/timeout/cancelled`

---

## 4. 通用设计原则

### 4.1 API 风格

- 使用 REST 风格
- 统一使用 JSON 请求和响应
- 时间字段统一使用 ISO 8601 UTC 字符串
- 主键统一使用 UUID

### 4.2 统一响应结构

成功响应：

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

失败响应：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": []
  },
  "requestId": "req_123"
}
```

### 4.3 分页规范

列表接口统一支持：

- `page`
- `pageSize`
- `sortBy`
- `sortOrder`

分页响应示例：

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 4.4 错误码规范

| 错误码 | 含义 |
|--------|------|
| `VALIDATION_ERROR` | 请求参数校验失败 |
| `UNAUTHORIZED` | 未认证 |
| `FORBIDDEN` | 无权限 |
| `NOT_FOUND` | 资源不存在 |
| `CONFLICT` | 资源冲突 |
| `PROVIDER_UNAVAILABLE` | 模型提供商不可用 |
| `SKILL_EXECUTION_ERROR` | Skill 执行失败 |
| `AGENT_EXECUTION_ERROR` | Agent 执行失败 |
| `EXECUTION_TIMEOUT` | 执行超时 |
| `INTERNAL_ERROR` | 系统内部错误 |

---

## 5. 数据模型设计

## 5.1 agents

用途：保存 Agent 的静态配置。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | UUID | 是 | 主键 |
| `name` | varchar(255) | 是 | Agent 名称 |
| `description` | text | 否 | 描述 |
| `status` | varchar(32) | 是 | `draft/active/archived` |
| `llm_provider_id` | UUID | 是 | 默认 Provider |
| `system_prompt` | text | 否 | 系统提示词 |
| `max_steps` | int | 是 | 最大步数，默认 20 |
| `timeout_ms` | int | 是 | 执行超时，默认 300000 |
| `temperature` | numeric(4,2) | 否 | 采样参数 |
| `top_p` | numeric(4,2) | 否 | 采样参数 |
| `skill_ids` | jsonb | 否 | 绑定 Skill ID 列表 |
| `created_at` | timestamptz | 是 | 创建时间 |
| `updated_at` | timestamptz | 是 | 更新时间 |

### 索引建议

- `idx_agents_status`
- `idx_agents_llm_provider`
- `idx_agents_updated_at_desc`

---

## 5.2 skills

用途：保存 Skill 定义和版本信息。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | UUID | 是 | 主键 |
| `skill_key` | varchar(100) | 是 | 逻辑标识，如 `web-search` |
| `name` | varchar(255) | 是 | 展示名称 |
| `version` | varchar(50) | 是 | 版本号 |
| `description` | text | 否 | 描述 |
| `status` | varchar(32) | 是 | `active/deprecated/disabled` |
| `parameters_schema` | jsonb | 是 | 输入 Schema |
| `returns_schema` | jsonb | 是 | 输出 Schema |
| `tags` | text[] | 否 | 标签 |
| `timeout_ms` | int | 否 | 超时时间 |
| `retry_policy` | jsonb | 否 | 重试配置 |
| `created_at` | timestamptz | 是 | 创建时间 |
| `updated_at` | timestamptz | 是 | 更新时间 |

### 约束建议

- `UNIQUE(skill_key, version)`

### 索引建议

- `idx_skills_skill_key`
- `idx_skills_status`
- `idx_skills_tags_gin`

---

## 5.3 llm_providers

用途：保存 Provider 配置与指标基础信息。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | UUID | 是 | 主键 |
| `provider_key` | varchar(100) | 是 | 如 `anthropic-main` |
| `name` | varchar(255) | 是 | 展示名称 |
| `provider_type` | varchar(50) | 是 | `anthropic/openai/gemini/local` |
| `model` | varchar(255) | 是 | 模型名称 |
| `api_base_url` | varchar(1024) | 否 | 自定义地址 |
| `api_key_encrypted` | text | 否 | 加密后的 API Key |
| `config` | jsonb | 否 | 附加配置 |
| `status` | varchar(32) | 是 | `active/inactive/testing/error` |
| `cost_per_1k_input_tokens` | numeric(10,6) | 否 | 输入成本 |
| `cost_per_1k_output_tokens` | numeric(10,6) | 否 | 输出成本 |
| `last_health_check_at` | timestamptz | 否 | 最近健康检查时间 |
| `created_at` | timestamptz | 是 | 创建时间 |
| `updated_at` | timestamptz | 是 | 更新时间 |

### 约束建议

- `UNIQUE(provider_key)`

### 索引建议

- `idx_llm_providers_status`
- `idx_llm_providers_type`

---

## 5.4 executions

用途：保存每次 Agent 执行的主记录。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | UUID | 是 | 主键 |
| `agent_id` | UUID | 是 | 所属 Agent |
| `trace_id` | varchar(100) | 是 | Trace 关联 ID |
| `input_text` | text | 是 | 输入任务 |
| `output_text` | text | 否 | 输出摘要 |
| `status` | varchar(32) | 是 | 执行状态 |
| `provider_id` | UUID | 否 | 本次执行使用的 Provider |
| `step_count` | int | 否 | 总步数 |
| `tokens_used` | int | 否 | token 数 |
| `cost` | numeric(10,6) | 否 | 成本 |
| `started_at` | timestamptz | 否 | 开始时间 |
| `ended_at` | timestamptz | 否 | 结束时间 |
| `duration_ms` | int | 否 | 总耗时 |
| `error_code` | varchar(100) | 否 | 错误码 |
| `error_message` | text | 否 | 错误信息 |
| `created_at` | timestamptz | 是 | 创建时间 |
| `updated_at` | timestamptz | 是 | 更新时间 |

### 索引建议

- `idx_executions_agent_created_at_desc`
- `idx_executions_status`
- `idx_executions_trace_id`

---

## 5.5 execution_traces

用途：保存 Execution 中的详细步骤。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | UUID | 是 | 主键 |
| `execution_id` | UUID | 是 | 关联 executions.id |
| `trace_id` | varchar(100) | 是 | Trace ID |
| `step_index` | int | 是 | 步骤序号，从 1 开始 |
| `step_type` | varchar(32) | 是 | `thought/action/observation/final_answer/error` |
| `content` | text | 是 | 文本内容 |
| `tool_name` | varchar(255) | 否 | 调用的 Skill 名称 |
| `tool_input` | jsonb | 否 | 调用参数 |
| `tool_output` | jsonb | 否 | 调用结果 |
| `duration_ms` | int | 否 | 步骤耗时 |
| `created_at` | timestamptz | 是 | 记录时间 |

### 索引建议

- `idx_execution_traces_execution_step`
- `idx_execution_traces_trace_id`

---

## 5.6 关系说明

- 一个 Agent 对应多个 Executions
- 一个 Execution 对应多个 Trace Steps
- 一个 Agent 默认绑定一个 LLM Provider
- 一个 Agent 可关联多个 Skills

首版可采用 `agents.skill_ids` 存储绑定关系；若后续需要更强可维护性，可拆为关联表 `agent_skills`。

---

## 6. API 契约

统一前缀：`/api/v1`

## 6.1 Agent API

### 6.1.1 创建 Agent

- 方法：`POST /api/v1/agents`

请求体：

```json
{
  "name": "Research Agent",
  "description": "Agent for research tasks",
  "llmProviderId": "7d91b0a4-48c7-4d7e-9dc7-8d591e9a9001",
  "skillIds": [
    "fbe78eb1-4b83-43f6-b5f0-f04e5f8e80a1"
  ],
  "maxSteps": 20,
  "timeoutMs": 60000,
  "systemPrompt": "You are a helpful research agent"
}
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "b23993f8-133e-4146-8c9e-2d4be068ab03",
    "name": "Research Agent",
    "status": "draft",
    "createdAt": "2026-03-17T10:00:00Z",
    "updatedAt": "2026-03-17T10:00:00Z"
  }
}
```

### 6.1.2 查询 Agent 列表

- 方法：`GET /api/v1/agents?page=1&pageSize=20&status=active`

### 6.1.3 查询 Agent 详情

- 方法：`GET /api/v1/agents/:agentId`

### 6.1.4 更新 Agent

- 方法：`PUT /api/v1/agents/:agentId`

### 6.1.5 删除 Agent

- 方法：`DELETE /api/v1/agents/:agentId`

删除策略：

- MVP 采用逻辑删除或归档，避免直接物理删除历史数据

### 6.1.6 执行 Agent

- 方法：`POST /api/v1/agents/:agentId/run`

请求体：

```json
{
  "input": "请总结最近一周 AI 行业的重要新闻",
  "timeoutMs": 60000,
  "providerId": "7d91b0a4-48c7-4d7e-9dc7-8d591e9a9001"
}
```

同步模式响应：

```json
{
  "success": true,
  "data": {
    "executionId": "c8f50dcf-e688-4dd8-9f33-c5d31a8c2a16",
    "traceId": "trace_20260317_001",
    "status": "succeeded",
    "output": "本周 AI 行业重点包括...",
    "metrics": {
      "stepCount": 4,
      "tokensUsed": 3210,
      "cost": 0.024,
      "durationMs": 12540
    }
  }
}
```

异步模式可在后续增加：

- `POST /api/v1/agents/:agentId/run-async`
- `GET /api/v1/executions/:executionId`

### 6.1.7 查询执行历史

- 方法：`GET /api/v1/agents/:agentId/executions?page=1&pageSize=20&status=succeeded`

---

## 6.2 Skill API

### 6.2.1 注册 Skill

- 方法：`POST /api/v1/skills`

请求体：

```json
{
  "skillKey": "web-search",
  "name": "Web Search",
  "version": "1.0.0",
  "description": "Search the web",
  "parametersSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string"
      }
    },
    "required": ["query"]
  },
  "returnsSchema": {
    "type": "array"
  },
  "tags": ["search", "web"],
  "timeoutMs": 30000
}
```

### 6.2.2 查询 Skill 列表

- 方法：`GET /api/v1/skills?page=1&pageSize=20&search=web`

### 6.2.3 查询 Skill 详情

- 方法：`GET /api/v1/skills/:skillId`

### 6.2.4 查询 Skill 版本

- 方法：`GET /api/v1/skills/:skillKey/versions`

### 6.2.5 更新 Skill 状态

- 方法：`PATCH /api/v1/skills/:skillId/status`

请求体：

```json
{
  "status": "deprecated"
}
```

---

## 6.3 LLM Provider API

### 6.3.1 注册 Provider

- 方法：`POST /api/v1/llm-providers`

请求体：

```json
{
  "providerKey": "anthropic-main",
  "name": "Anthropic Main",
  "providerType": "anthropic",
  "model": "claude-sonnet-4",
  "apiBaseUrl": "https://api.anthropic.com",
  "apiKey": "***",
  "status": "active"
}
```

### 6.3.2 查询 Provider 列表

- 方法：`GET /api/v1/llm-providers?page=1&pageSize=20&status=active`

### 6.3.3 查询 Provider 详情

- 方法：`GET /api/v1/llm-providers/:providerId`

### 6.3.4 更新 Provider

- 方法：`PUT /api/v1/llm-providers/:providerId`

### 6.3.5 测试连接

- 方法：`POST /api/v1/llm-providers/:providerId/test`

响应示例：

```json
{
  "success": true,
  "data": {
    "providerId": "7d91b0a4-48c7-4d7e-9dc7-8d591e9a9001",
    "status": "ok",
    "latencyMs": 523
  }
}
```

---

## 6.4 Execution / Trace API

### 6.4.1 查询 Execution 详情

- 方法：`GET /api/v1/executions/:executionId`

### 6.4.2 查询 Trace 详情

- 方法：`GET /api/v1/traces/:traceId`

响应示例：

```json
{
  "success": true,
  "data": {
    "traceId": "trace_20260317_001",
    "executionId": "c8f50dcf-e688-4dd8-9f33-c5d31a8c2a16",
    "steps": [
      {
        "stepIndex": 1,
        "stepType": "thought",
        "content": "我需要先搜索近期 AI 新闻",
        "createdAt": "2026-03-17T10:00:01Z"
      },
      {
        "stepIndex": 2,
        "stepType": "action",
        "toolName": "web-search",
        "toolInput": {
          "query": "latest AI news this week"
        },
        "content": "Call web-search",
        "createdAt": "2026-03-17T10:00:02Z"
      }
    ]
  }
}
```

### 6.4.3 查询 Execution 列表

- 方法：`GET /api/v1/executions?page=1&pageSize=20&agentId=:agentId&status=succeeded`

---

## 7. 校验规则

### 7.1 请求校验

- 所有写接口必须使用运行时 Schema 校验
- 不允许直接使用 TypeScript interface 作为运行时校验依据
- 推荐使用 `Zod` 或 `JSON Schema`

### 7.2 Agent 执行校验

- `input` 不能为空
- `timeoutMs` 不得超过系统上限
- Agent 状态必须为 `active`
- 至少绑定一个可用 Provider

### 7.3 Skill 校验

- `skillKey + version` 唯一
- `parametersSchema` 和 `returnsSchema` 必须合法
- `disabled` 状态 Skill 不可调用

---

## 8. 安全与敏感信息约束

- Provider API 返回时不直接返回明文 `apiKey`
- 日志中不记录明文密钥、Token 和敏感请求头
- `tool_input` 和 `tool_output` 如包含敏感信息，需支持脱敏
- 所有对外错误响应不暴露内部堆栈

---

## 9. 实现约束

- LLM 主抽象统一使用 `chat(messages)`
- `complete(prompt)` 如需兼容，仅在适配层实现
- Execution 与 Trace 分离存储，不将所有步骤塞入一个大字段
- Skill 最新版本选择应按 semver 排序，不依赖插入顺序
- Agent 执行成功与失败都必须调用 Trace finalize

---

## 10. MVP 冻结项

以下内容在当前阶段视为冻结，不应随意变更：

- 核心对象命名：Agent、Skill、LLM Provider、Execution、Trace
- Execution 状态集合
- 统一响应格式
- 核心 API 路径前缀 `/api/v1`
- 核心表：`agents`、`skills`、`llm_providers`、`executions`、`execution_traces`

若后续需要调整，应通过架构评审后统一更新文档与实现。
