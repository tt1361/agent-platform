# `/api/v1/agents/{id}/run/copilotkit` API 对接文档

## 10. 接口概述
- **URL**: `/api/v1/agents/{id}/run/copilotkit`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Accept**: `text/event-stream`
- **说明**: 面向 CopilotKit/AGUI 协议的流式接口，返回 `AGUI` 标准事件。

## 11. 路径参数
- `id` (string, required): 智能体 ID。

## 12. 请求体（RunAgentInput）
```json
{
  "threadId": "conversation-or-thread-id",
  "userId": "optional-user-id",
  "runId": "optional-run-id",
  "state": {},
  "messages": [
    {
      "id": "m1",
      "role": "user",
      "content": "请介绍一下上海，并给我3条旅行建议"
    }
  ],
  "tools": [],
  "context": [],
  "forwardedProps": {},
  "appName": "optional-app-name"
}
```

### 字段说明
- `threadId` (string, required): 会话线程 ID。
- `messages` (array, required): 消息列表，必须包含最后一条 user 文本消息。
- `runId` (string, optional): 本次运行 ID，不传会由服务端自动生成。
- `userId/state/tools/context/forwardedProps/appName` (optional): 兼容字段，当前接口可接收。

## 13. 返回协议（SSE）
每个事件遵循标准 SSE 帧格式：
```text
event: RUN_STARTED
data: {"type":"RUN_STARTED","timestamp":...,"thread_id":"...","run_id":"..."}

```

## 14. 事件类型与语义

### 14.1 建流开始
```json
{
  "type": "RUN_STARTED",
  "thread_id": "thread-1",
  "run_id": "run-1",
  "timestamp": 1742800000000
}
```

### 14.2 文本消息流
```json
{
  "type": "TEXT_MESSAGE_START",
  "message_id": "execution-id",
  "role": "assistant"
}
```

```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "message_id": "execution-id",
  "delta": "上海是中国的重要城市..."
}
```

```json
{
  "type": "TEXT_MESSAGE_END",
  "message_id": "execution-id"
}
```

### 14.3 自定义事件
```json
{
  "type": "CUSTOM",
  "name": "run_status",
  "value": {
    "traceId": "trace_xxx",
    "conversationId": "conv_xxx",
    "executionId": "exec_xxx",
    "status": "running"
  }
}
```

```json
{
  "type": "CUSTOM",
  "name": "run_retrievals",
  "value": {
    "items": []
  }
}
```

```json
{
  "type": "CUSTOM",
  "name": "trace_step",
  "value": {
    "executionId": "...",
    "traceId": "...",
    "stepIndex": 1,
    "stepType": "thought|action|observation|final_answer|error",
    "content": "..."
  }
}
```

```json
{
  "type": "CUSTOM",
  "name": "run_completed",
  "value": {
    "result": {
      "executionId": "...",
      "traceId": "...",
      "conversationId": "...",
      "status": "succeeded",
      "output": "最终完整答案"
    }
  }
}
```

### 14.4 结束与错误
```json
{
  "type": "RUN_FINISHED",
  "thread_id": "thread-1",
  "run_id": "run-1"
}
```

```json
{
  "type": "RUN_ERROR",
  "message": "错误信息",
  "code": "AGENT_EXECUTION_ERROR"
}
```

## 15. 典型事件顺序
1. `RUN_STARTED`
2. `CUSTOM(name=run_status)`
3. `TEXT_MESSAGE_START`
4. 多次 `TEXT_MESSAGE_CONTENT`
5. （可选）`CUSTOM(name=trace_step|run_retrievals)`
6. `TEXT_MESSAGE_END`
7. `CUSTOM(name=run_completed)`
8. `RUN_FINISHED`

异常时：`RUN_ERROR` 后连接结束，不再发送 `RUN_FINISHED`。

## 16. 调用示例
```bash
curl -N -X POST "http://127.0.0.1:8888/api/v1/agents/default-agent-id/run/copilotkit" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "threadId":"conv-001",
    "runId":"run-001",
    "messages":[
      {"id":"m1","role":"user","content":"请介绍一下上海，并给我3条旅行建议"}
    ]
  }'
```

## 17. 错误语义
- **建流前参数错误/业务错误**: 返回标准 JSON 错误。
- **建流后执行错误**: 在流中返回 `RUN_ERROR` 事件。

## 18. 实测记录（2026-03-25）

### 18.1 成功流（真实调用）
请求：
```bash
curl -N -X POST "http://127.0.0.1:8888/api/v1/agents/default-agent-id/run/copilotkit" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "threadId":"dfb9062c-5ee5-4dba-81ff-203b31950ab8",
    "runId":"run-doc-success-002",
    "messages":[
      {"id":"u-1","role":"user","content":"请给我2条上海周末亲子游建议"}
    ]
  }'
```

实测事件顺序：
1. `RUN_STARTED`
2. `CUSTOM` (`name=run_status`)
3. `TEXT_MESSAGE_START`
4. `CUSTOM` (`name=trace_step`, thought)
5. `TEXT_MESSAGE_CONTENT`（多次）
6. `CUSTOM` (`name=trace_step`, final_answer)
7. `TEXT_MESSAGE_END`
8. `CUSTOM` (`name=run_completed`)
9. `RUN_FINISHED`

### 18.2 失败流（会话不存在）
请求：
```bash
curl -N -X POST "http://127.0.0.1:8888/api/v1/agents/default-agent-id/run/copilotkit" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "threadId":"00000000-0000-0000-0000-000000000000",
    "runId":"run-doc-fail-002",
    "messages":[
      {"id":"u-1","role":"user","content":"hello"}
    ]
  }'
```

实测返回片段：
```text
event:RUN_STARTED
data:{"type":"RUN_STARTED","thread_id":"00000000-0000-0000-0000-000000000000","run_id":"run-doc-fail-002",...}

event:RUN_ERROR
data:{"type":"RUN_ERROR","message":"未找到会话","code":"AGENT_EXECUTION_ERROR",...}
```

说明：`RUN_ERROR` 后流结束，不会再发送 `RUN_FINISHED`。

### 18.3 参数校验（建流前）
| 场景 | HTTP | 返回 message |
|---|---:|---|
| 缺少 `threadId` | 400 | `threadId 必填` |
| `messages` 为空 | 400 | `messages 必填` |
| `messages` 中没有 user 文本消息 | 400 | `messages 中缺少 user 文本消息` |

### 18.4 协议注意事项
- 当前实现中，`messages[].content` 是 `string`（文本），不是 CopilotKit block array（例如 `[{type:"text",text:"..."}]`）。
- `run_completed.value.result` 里可能带扩展字段（如 `memoryUpdate`、`knowledgeRetrievals`），客户端应按需读取并允许未知字段。
