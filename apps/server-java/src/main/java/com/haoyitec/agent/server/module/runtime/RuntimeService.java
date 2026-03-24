package com.haoyitec.agent.server.module.runtime;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.AgentEntity;
import com.haoyitec.agent.server.domain.entity.ConversationEntity;
import com.haoyitec.agent.server.domain.entity.ExecutionEntity;
import com.haoyitec.agent.server.domain.entity.ExecutionTraceEntity;
import com.haoyitec.agent.server.domain.entity.SkillEntity;
import com.haoyitec.agent.server.domain.mapper.AgentMapper;
import com.haoyitec.agent.server.domain.mapper.ConversationMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionTraceMapper;
import com.haoyitec.agent.server.domain.mapper.SkillMapper;
import com.haoyitec.agent.server.infra.ai.AiChatService;
import com.haoyitec.agent.server.module.conversation.ConversationService;
import com.haoyitec.agent.server.module.knowledge.KnowledgeRetrievalItem;
import com.haoyitec.agent.server.module.knowledge.KnowledgeRetrievalService;
import com.haoyitec.agent.server.module.memory.MemoryService;
import com.haoyitec.agent.server.module.runtime.plugin.PluginSkillExecutionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
public class RuntimeService {

    private final AgentMapper agentMapper;
    private final ConversationMapper conversationMapper;
    private final ExecutionMapper executionMapper;
    private final ExecutionTraceMapper executionTraceMapper;
    private final SkillMapper skillMapper;
    private final ConversationService conversationService;
    private final KnowledgeRetrievalService retrievalService;
    private final MemoryService memoryService;
    private final AiChatService aiChatService;
    private final PluginSkillExecutionService pluginSkillExecutionService;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> run(String agentId,
                                   String input,
                                   Integer overrideTimeoutMs,
                                   String conversationId,
                                   String conversationTitle,
                                   String providerId,
                                   String modelKey,
                                   Object attachments,
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
        execution.setProviderId(StringUtils.hasText(providerId) ? providerId : agent.getLlmProviderId());
        execution.setModelKey(StringUtils.hasText(modelKey) ? modelKey : null);
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
            String effectiveProviderId = StringUtils.hasText(providerId) ? providerId : agent.getLlmProviderId();
            if (!StringUtils.hasText(effectiveProviderId)) {
                throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "未配置可用模型厂商，请先绑定或在请求中指定 providerId");
            }
            List<AiChatService.ChatAttachment> parsedAttachments = aiChatService.parseAttachments(attachments);
            AiChatService.ChatRequest chatRequest = new AiChatService.ChatRequest(
                    effectiveProviderId,
                    StringUtils.hasText(modelKey) ? modelKey : null,
                    parsedAttachments,
                    List.of(),
                    null,
                    timeoutMs
            );
            AiChatService.ChatRoute chatRoute = aiChatService.resolveRoute(chatRequest);
            executionMapper.update(null, new LambdaUpdateWrapper<ExecutionEntity>()
                    .eq(ExecutionEntity::getId, execution.getId())
                    .set(ExecutionEntity::getProviderId, chatRoute.providerId())
                    .set(ExecutionEntity::getModelKey, chatRoute.modelKey()));

            List<SkillEntity> boundSkills = listBoundActiveSkills(agent.getSkillIds());
            int stepIndex = 0;
            List<KnowledgeRetrievalItem> retrievals = retrievalService.retrieve(input, 8, execution.getId());
            if (!retrievals.isEmpty()) {
                String retrievalSummary = retrievals.stream()
                        .map(item -> "[" + item.documentTitle() + "#" + item.chunkIndex() + "] " +
                                (item.content().length() > 80 ? item.content().substring(0, 80) : item.content()))
                        .reduce((a, b) -> a + "；" + b)
                        .orElse("");
                Map<String, Object> retrievalStep = recordTraceStep(execution.getId(), traceId, stepIndex++, "observation",
                        "知识检索命中 " + retrievals.size() + " 条：" + retrievalSummary, null, null, null);
                emit(eventConsumer, Map.of("type", "trace_step", "step", retrievalStep));
                emit(eventConsumer, Map.of(
                        "type", "retrievals",
                        "executionId", execution.getId(),
                        "traceId", traceId,
                        "items", retrievals
                ));
            }

            // 先尝试执行已绑定且启用的技能插件，结果会写入 trace 便于前端展示与排障。
            Optional<SkillToolResult> skillToolResult = tryExecuteBoundSkill(input, boundSkills, timeoutMs);
            if (skillToolResult.isPresent()) {
                SkillToolResult toolResult = skillToolResult.get();
                Map<String, Object> actionStep = recordTraceStep(
                        execution.getId(),
                        traceId,
                        stepIndex++,
                        "action",
                        "调用技能 " + toolResult.toolName(),
                        toolResult.toolName(),
                        toolResult.toolInput(),
                        null
                );
                emit(eventConsumer, Map.of("type", "trace_step", "step", actionStep));

                String observationContent = toolResult.toolOutput().get("error") == null
                        ? "技能执行成功：" + String.valueOf(toolResult.toolOutput().get("summary"))
                        : "技能执行失败：" + String.valueOf(toolResult.toolOutput().get("error"));
                Map<String, Object> observationStep = recordTraceStep(
                        execution.getId(),
                        traceId,
                        stepIndex++,
                        "observation",
                        observationContent,
                        toolResult.toolName(),
                        toolResult.toolInput(),
                        toolResult.toolOutput()
                );
                emit(eventConsumer, Map.of("type", "trace_step", "step", observationStep));
            }

            emit(eventConsumer, Map.of("type", "answer_start", "executionId", execution.getId(), "traceId", traceId));

            String answer;
            String thoughtContent;
            String systemPrompt = StringUtils.hasText(agent.getSystemPrompt())
                    ? agent.getSystemPrompt()
                    : "你是一名乐于助人的中文智能体。";
            // 始终让模型基于技能/知识结果进行二次组织，输出更自然的最终答案。
            String enhancedPrompt = buildPrompt(input, retrievals, activeConversation.getId(), agent.getId(),
                    skillToolResult.map(SkillToolResult::promptContext).orElse(null));
            answer = aiChatService.chat(systemPrompt, enhancedPrompt, chatRequest);
            thoughtContent = skillToolResult.isPresent()
                    ? "模型已基于技能返回结果完成补全回答"
                    : "模型已完成思考并开始生成答案";

            Map<String, Object> thoughtStep = recordTraceStep(execution.getId(), traceId, stepIndex++, "thought", thoughtContent,
                    null, null, null);
            emit(eventConsumer, Map.of("type", "trace_step", "step", thoughtStep));

            Map<String, Object> finalStep = recordTraceStep(execution.getId(), traceId, stepIndex++, "final_answer", answer, null, null, null);
            emit(eventConsumer, Map.of("type", "trace_step", "step", finalStep));

            LocalDateTime endedAt = LocalDateTime.now();
            executionMapper.update(null, new LambdaUpdateWrapper<ExecutionEntity>()
                    .eq(ExecutionEntity::getId, execution.getId())
                    .set(ExecutionEntity::getStatus, "succeeded")
                    .set(ExecutionEntity::getOutputText, answer)
                    .set(ExecutionEntity::getStepCount, stepIndex)
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
            result.put("providerId", chatRoute.providerId());
            result.put("modelKey", chatRoute.modelKey());
            result.put("stepCount", stepIndex);
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
        step.setToolInput(toolInput == null ? null : JsonUtil.toJson(toolInput));
        step.setToolOutput(toolOutput == null ? null : JsonUtil.toJson(toolOutput));
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

    private List<SkillEntity> listBoundActiveSkills(String skillIdsJson) {
        List<String> skillIds = JsonUtil.toStringList(skillIdsJson);
        if (skillIds.isEmpty()) {
            return List.of();
        }
        List<SkillEntity> queriedSkills = skillMapper.selectList(new LambdaQueryWrapper<SkillEntity>()
                .in(SkillEntity::getId, skillIds)
                .eq(SkillEntity::getStatus, "active"));
        Map<String, SkillEntity> skillMap = new HashMap<>();
        for (SkillEntity skill : queriedSkills) {
            skillMap.put(skill.getId(), skill);
        }
        return skillIds.stream()
                .map(skillMap::get)
                .filter(item -> item != null)
                .toList();
    }

    private Optional<SkillToolResult> tryExecuteBoundSkill(String input,
                                                           List<SkillEntity> boundSkills,
                                                           Integer timeoutMs) {
        if (boundSkills == null || boundSkills.isEmpty()) {
            return Optional.empty();
        }
        return pluginSkillExecutionService.tryExecute(input, boundSkills, timeoutMs)
                .map(result -> new SkillToolResult(
                        result.toolName(),
                        result.toolInput(),
                        result.toolOutput(),
                        result.promptContext()
                ));
    }

    /**
     * 根据插件输出构建“可直接返回给用户”的答案：
     * 1. 有 error：直接反馈插件失败原因；
     * 2. 有 items：逐条拼接标题/摘要/链接；
     * 3. 无可用条目：明确提示未检索到结果。
     */
    private String tryBuildGroundedSkillAnswer(Optional<SkillToolResult> skillToolResult) {
        if (skillToolResult == null || skillToolResult.isEmpty()) {
            return null;
        }
        SkillToolResult result = skillToolResult.get();
        if (result.toolOutput() == null || result.toolOutput().isEmpty()) {
            return null;
        }

        String toolName = StringUtils.hasText(result.toolName()) ? result.toolName() : "plugin";
        Object error = result.toolOutput().get("error");
        if (error != null && StringUtils.hasText(String.valueOf(error))) {
            return "已触发技能「" + toolName + "」，但调用失败："
                    + sanitizeLine(String.valueOf(error))
                    + "。请稍后重试或检查插件配置。";
        }

        List<Map<String, String>> items = normalizeResultItems(result.toolOutput().get("items"));
        if (items.isEmpty()) {
            String summary = sanitizeLine(asText(result.toolOutput().get("summary")));
            if (StringUtils.hasText(summary)) {
                return "技能「" + toolName + "」返回摘要："
                        + truncate(summary, 220)
                        + "\n注：仅基于插件返回，不进行编造补全。";
            }
            return "已触发技能「" + toolName + "」，但插件未返回可用条目。";
        }

        StringBuilder builder = new StringBuilder();
        builder.append("以下内容来自技能「").append(toolName).append("」实时返回：\n");
        int displayIndex = 1;
        for (Map<String, String> item : items) {
            if (displayIndex > 10) {
                break;
            }
            String title = sanitizeLine(item.get("title"));
            String snippet = sanitizeLine(item.get("snippet"));
            String url = sanitizeLine(item.get("url"));

            if (!StringUtils.hasText(title) && !StringUtils.hasText(snippet) && !StringUtils.hasText(url)) {
                continue;
            }
            builder.append(displayIndex++).append(". ");
            builder.append(StringUtils.hasText(title) ? title : "-");
            if (StringUtils.hasText(snippet) && !"-".equals(snippet) && !snippet.equals(title)) {
                builder.append("：").append(snippet);
            }
            if (StringUtils.hasText(url)) {
                builder.append("\n链接：").append(url);
            }
            builder.append("\n");
        }
        if (displayIndex == 1) {
            return "已触发技能「" + toolName + "」，但插件未返回可用条目。";
        }
        builder.append("注：仅展示插件真实返回结果，未做编造补全。");
        return builder.toString().trim();
    }

    private List<Map<String, String>> normalizeResultItems(Object items) {
        if (!(items instanceof List<?> rawItems)) {
            return List.of();
        }
        List<Map<String, String>> normalized = new ArrayList<>();
        for (Object rawItem : rawItems) {
            if (!(rawItem instanceof Map<?, ?> map)) {
                continue;
            }
            Map<String, String> item = new HashMap<>();
            item.put("title", asText(map.get("title")));
            item.put("snippet", asText(map.get("snippet")));
            item.put("url", asText(map.get("url")));
            normalized.add(item);
        }
        return normalized;
    }

    private String asText(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof String text) {
            return text.trim();
        }
        return String.valueOf(value);
    }

    private String sanitizeLine(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        return value.replace("\r", " ").replace("\n", " ").trim();
    }

    private String truncate(String text, int maxLength) {
        if (!StringUtils.hasText(text) || text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + "...";
    }

    private String buildPrompt(String input,
                               List<KnowledgeRetrievalItem> retrievals,
                               String conversationId,
                               String agentId,
                               String skillContext) {
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

        if (StringUtils.hasText(skillContext)) {
            builder.append("\n技能执行结果：\n")
                    .append("- ")
                    .append(skillContext)
                    .append("\n");
            builder.append("请在回答中优先使用技能执行结果。\n");
        }

        builder.append("请使用中文输出简洁明确的回答。\n");
        return builder.toString();
    }

    private record SkillToolResult(String toolName,
                                   Map<String, Object> toolInput,
                                   Map<String, Object> toolOutput,
                                   String promptContext) {
    }
}
