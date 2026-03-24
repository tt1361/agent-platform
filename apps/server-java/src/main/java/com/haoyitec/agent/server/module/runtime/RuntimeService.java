package com.haoyitec.agent.server.module.runtime;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.domain.entity.AgentEntity;
import com.haoyitec.agent.server.domain.entity.ConversationEntity;
import com.haoyitec.agent.server.domain.entity.ExecutionEntity;
import com.haoyitec.agent.server.domain.entity.ExecutionTraceEntity;
import com.haoyitec.agent.server.domain.mapper.AgentMapper;
import com.haoyitec.agent.server.domain.mapper.ConversationMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionTraceMapper;
import com.haoyitec.agent.server.infra.ai.AiChatService;
import com.haoyitec.agent.server.module.conversation.ConversationService;
import com.haoyitec.agent.server.module.knowledge.KnowledgeRetrievalItem;
import com.haoyitec.agent.server.module.knowledge.KnowledgeRetrievalService;
import com.haoyitec.agent.server.module.memory.MemoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
public class RuntimeService {

    private final AgentMapper agentMapper;
    private final ConversationMapper conversationMapper;
    private final ExecutionMapper executionMapper;
    private final ExecutionTraceMapper executionTraceMapper;
    private final ConversationService conversationService;
    private final KnowledgeRetrievalService retrievalService;
    private final MemoryService memoryService;
    private final AiChatService aiChatService;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> run(String agentId,
                                   String input,
                                   Integer overrideTimeoutMs,
                                   String conversationId,
                                   String conversationTitle,
                                   Consumer<Map<String, Object>> eventConsumer) {
        AgentEntity agent = agentMapper.selectById(agentId);
        if (agent == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "未找到智能体");
        }
        if (!"active".equals(agent.getStatus())) {
            throw new BizException(HttpStatus.BAD_REQUEST, "AGENT_EXECUTION_ERROR", "智能体必须处于启用状态后才能执行");
        }

        ConversationEntity activeConversation = ensureConversation(agentId, conversationId, conversationTitle, input);

        String traceId = IdUtil.traceId();
        LocalDateTime startedAt = LocalDateTime.now();

        ExecutionEntity execution = new ExecutionEntity();
        execution.setId(IdUtil.uuid());
        execution.setAgentId(agent.getId());
        execution.setConversationId(activeConversation.getId());
        execution.setTraceId(traceId);
        execution.setInputText(input);
        execution.setStatus("running");
        execution.setProviderId(agent.getLlmProviderId());
        execution.setStartedAt(startedAt);
        executionMapper.insert(execution);

        conversationService.touch(activeConversation.getId());
        emit(eventConsumer, Map.of(
                "type", "status",
                "status", "running",
                "executionId", execution.getId(),
                "traceId", traceId,
                "conversationId", activeConversation.getId()
        ));

        Integer timeoutMs = overrideTimeoutMs == null ? agent.getTimeoutMs() : overrideTimeoutMs;
        if (timeoutMs == null || timeoutMs <= 0) {
            timeoutMs = 60000;
        }

        try {
            List<KnowledgeRetrievalItem> retrievals = retrievalService.retrieve(input, 8, execution.getId());
            if (!retrievals.isEmpty()) {
                String retrievalSummary = retrievals.stream()
                        .map(item -> "[" + item.documentTitle() + "#" + item.chunkIndex() + "] " +
                                (item.content().length() > 80 ? item.content().substring(0, 80) : item.content()))
                        .reduce((a, b) -> a + "；" + b)
                        .orElse("");
                Map<String, Object> retrievalStep = recordTraceStep(execution.getId(), traceId, 0, "observation",
                        "知识检索命中 " + retrievals.size() + " 条：" + retrievalSummary, null, null, null);
                emit(eventConsumer, Map.of("type", "trace_step", "step", retrievalStep));
                emit(eventConsumer, Map.of(
                        "type", "retrievals",
                        "executionId", execution.getId(),
                        "traceId", traceId,
                        "items", retrievals
                ));
            }

            emit(eventConsumer, Map.of("type", "answer_start", "executionId", execution.getId(), "traceId", traceId));

            String systemPrompt = StringUtils.hasText(agent.getSystemPrompt())
                    ? agent.getSystemPrompt()
                    : "你是一名乐于助人的中文智能体。";
            String enhancedPrompt = buildPrompt(input, retrievals, activeConversation.getId(), agent.getId());
            String answer = aiChatService.chat(systemPrompt, enhancedPrompt);

            Map<String, Object> thoughtStep = recordTraceStep(execution.getId(), traceId, 1, "thought", "模型已完成思考并开始生成答案",
                    null, null, null);
            emit(eventConsumer, Map.of("type", "trace_step", "step", thoughtStep));

            Map<String, Object> finalStep = recordTraceStep(execution.getId(), traceId, 2, "final_answer", answer, null, null, null);
            emit(eventConsumer, Map.of("type", "trace_step", "step", finalStep));

            LocalDateTime endedAt = LocalDateTime.now();
            executionMapper.update(null, new LambdaUpdateWrapper<ExecutionEntity>()
                    .eq(ExecutionEntity::getId, execution.getId())
                    .set(ExecutionEntity::getStatus, "succeeded")
                    .set(ExecutionEntity::getOutputText, answer)
                    .set(ExecutionEntity::getStepCount, 2)
                    .set(ExecutionEntity::getTokensUsed, Math.max(answer.length() / 2, 1))
                    .set(ExecutionEntity::getStartedAt, startedAt)
                    .set(ExecutionEntity::getEndedAt, endedAt)
                    .set(ExecutionEntity::getDurationMs,
                            Math.max((int) java.time.Duration.between(startedAt, endedAt).toMillis(), 1)));

            var latestShort = memoryService.getLatestShortTermMemory(activeConversation.getId());
            var shortTermMemory = memoryService.updateShortTermMemory(
                    activeConversation.getId(),
                    activeConversation.getTitle(),
                    latestShort == null ? null : latestShort.getSummary(),
                    input,
                    answer,
                    countConversationSuccessExecutions(activeConversation.getId())
            );
            var updatedLongTerm = memoryService.persistLongTermMemories(agent.getId(), activeConversation.getId(), input, answer);
            var citedRetrievals = retrievalService.listCitedByAnswer(retrievals, answer);

            Map<String, Object> result = new HashMap<>();
            result.put("executionId", execution.getId());
            result.put("traceId", traceId);
            result.put("conversationId", activeConversation.getId());
            result.put("status", "succeeded");
            result.put("output", answer);
            result.put("stepCount", 2);
            result.put("tokensUsed", Math.max(answer.length() / 2, 1));
            result.put("memoryUpdate", Map.of(
                    "shortTermMemory", shortTermMemory,
                    "updatedLongTermMemories", updatedLongTerm
            ));
            result.put("knowledgeRetrievals", retrievals);
            result.put("citedKnowledgeRetrievals", citedRetrievals);

            emit(eventConsumer, Map.of("type", "completed", "result", result));
            return result;
        } catch (Exception ex) {
            String errorMessage = ex.getMessage() == null ? "执行失败" : ex.getMessage();
            Map<String, Object> errorStep = recordTraceStep(execution.getId(), traceId, 1, "error", errorMessage, null, null, null);
            emit(eventConsumer, Map.of("type", "trace_step", "step", errorStep));
            LocalDateTime endedAt = LocalDateTime.now();
            executionMapper.update(null, new LambdaUpdateWrapper<ExecutionEntity>()
                    .eq(ExecutionEntity::getId, execution.getId())
                    .set(ExecutionEntity::getStatus, "failed")
                    .set(ExecutionEntity::getErrorCode, "AGENT_EXECUTION_ERROR")
                    .set(ExecutionEntity::getErrorMessage, errorMessage)
                    .set(ExecutionEntity::getStartedAt, startedAt)
                    .set(ExecutionEntity::getEndedAt, endedAt)
                    .set(ExecutionEntity::getDurationMs,
                            Math.max((int) java.time.Duration.between(startedAt, endedAt).toMillis(), 1)));
            emit(eventConsumer, Map.of(
                    "type", "failed",
                    "error", Map.of(
                            "code", "AGENT_EXECUTION_ERROR",
                            "message", errorMessage,
                            "executionId", execution.getId(),
                            "traceId", traceId,
                            "conversationId", activeConversation.getId()
                    )
            ));
            if (ex instanceof BizException bizException) {
                throw bizException;
            }
            throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "AGENT_EXECUTION_ERROR", errorMessage);
        }
    }

    private ConversationEntity ensureConversation(String agentId, String conversationId, String conversationTitle, String input) {
        if (StringUtils.hasText(conversationId)) {
            ConversationEntity existing = conversationMapper.selectOne(new LambdaQueryWrapper<ConversationEntity>()
                    .eq(ConversationEntity::getId, conversationId)
                    .eq(ConversationEntity::getAgentId, agentId)
                    .last("LIMIT 1"));
            if (existing == null) {
                throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "未找到会话");
            }
            return existing;
        }
        String title = StringUtils.hasText(conversationTitle)
                ? conversationTitle
                : (input == null ? "新会话" : input.substring(0, Math.min(input.length(), 40)));
        return conversationService.create(agentId, title);
    }

    private Map<String, Object> recordTraceStep(String executionId,
                                                String traceId,
                                                int stepIndex,
                                                String stepType,
                                                String content,
                                                String toolName,
                                                Object toolInput,
                                                Object toolOutput) {
        ExecutionTraceEntity step = new ExecutionTraceEntity();
        step.setId(IdUtil.uuid());
        step.setExecutionId(executionId);
        step.setTraceId(traceId);
        step.setStepIndex(stepIndex);
        step.setStepType(stepType);
        step.setContent(content == null ? "" : content);
        step.setToolName(toolName);
        step.setToolInput(toolInput == null ? null : String.valueOf(toolInput));
        step.setToolOutput(toolOutput == null ? null : String.valueOf(toolOutput));
        executionTraceMapper.insert(step);
        Map<String, Object> payload = new HashMap<>();
        payload.put("executionId", executionId);
        payload.put("traceId", traceId);
        payload.put("stepIndex", stepIndex);
        payload.put("stepType", stepType);
        payload.put("content", step.getContent());
        payload.put("toolName", toolName);
        payload.put("toolInput", toolInput);
        payload.put("toolOutput", toolOutput);
        return payload;
    }

    private void emit(Consumer<Map<String, Object>> eventConsumer, Map<String, Object> event) {
        if (eventConsumer != null) {
            eventConsumer.accept(event);
        }
    }

    private Integer countConversationSuccessExecutions(String conversationId) {
        Long count = executionMapper.selectCount(new LambdaQueryWrapper<ExecutionEntity>()
                .eq(ExecutionEntity::getConversationId, conversationId)
                .eq(ExecutionEntity::getStatus, "succeeded"));
        return count == null ? 0 : count.intValue();
    }

    private String buildPrompt(String input,
                               List<KnowledgeRetrievalItem> retrievals,
                               String conversationId,
                               String agentId) {
        StringBuilder builder = new StringBuilder();
        builder.append("当前用户问题：").append(input).append("\n\n");

        var shortMemory = memoryService.getLatestShortTermMemory(conversationId);
        if (shortMemory != null && StringUtils.hasText(shortMemory.getSummary())) {
            builder.append("短期记忆摘要：").append(shortMemory.getSummary()).append("\n\n");
        }

        var longMemories = memoryService.getLongTermMemories(agentId);
        if (!longMemories.isEmpty()) {
            builder.append("长期记忆：\n");
            longMemories.forEach(item -> builder.append("- [")
                    .append(item.getMemoryType())
                    .append("] ")
                    .append(item.getContent())
                    .append("\n"));
            builder.append("\n");
        }

        if (retrievals != null && !retrievals.isEmpty()) {
            builder.append("知识库参考资料：\n");
            retrievals.forEach(item -> builder.append("- ")
                    .append(item.documentTitle())
                    .append("#")
                    .append(item.chunkIndex())
                    .append(" : ")
                    .append(item.content())
                    .append("\n"));
            builder.append("\n请优先基于以上资料回答。\n");
        }

        builder.append("请使用中文输出简洁明确的回答。\n");
        return builder.toString();
    }
}
