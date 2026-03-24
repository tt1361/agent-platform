package com.haoyitec.agent.server.module.provider;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.domain.entity.LlmProviderEntity;
import com.haoyitec.agent.server.domain.mapper.LlmProviderMapper;
import com.haoyitec.agent.server.infra.ai.AiChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ProviderService {

    private final LlmProviderMapper providerMapper;
    private final AiChatService aiChatService;

    public List<LlmProviderEntity> list() {
        return providerMapper.selectList(new LambdaQueryWrapper<LlmProviderEntity>()
                .orderByDesc(LlmProviderEntity::getUpdatedAt));
    }

    public LlmProviderEntity getById(String id) {
        LlmProviderEntity entity = providerMapper.selectById(id);
        if (entity == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Provider not found");
        }
        return entity;
    }

    public Map<String, Object> testConnection(String providerId) {
        LlmProviderEntity provider = getById(providerId);
        String content = aiChatService.chat("你是连接测试助手", "请只返回 JSON：{\"status\":\"ok\",\"message\":\"连接成功\"}");
        return Map.of(
                "status", "ok",
                "providerType", provider.getProviderType(),
                "providerModel", provider.getModel(),
                "configuredModel", aiChatService.getConfiguredModel(),
                "configuredChatUrl", aiChatService.getConfiguredChatUrl(),
                "contentPreview", content.length() > 200 ? content.substring(0, 200) : content
        );
    }
}
