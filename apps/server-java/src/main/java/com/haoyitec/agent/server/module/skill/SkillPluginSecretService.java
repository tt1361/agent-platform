package com.haoyitec.agent.server.module.skill;

import com.haoyitec.agent.server.common.config.AppProperties;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.AesGcmCryptoUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.SkillEntity;
import com.haoyitec.agent.server.domain.entity.SkillPluginSecretEntity;
import com.haoyitec.agent.server.domain.mapper.SkillMapper;
import com.haoyitec.agent.server.domain.mapper.SkillPluginSecretMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SkillPluginSecretService {

    private final SkillMapper skillMapper;
    private final SkillPluginSecretMapper skillPluginSecretMapper;
    private final AppProperties appProperties;

    public SkillSecretView getSecretView(String skillId) {
        ensureSkillExists(skillId);
        SkillPluginSecretEntity entity = skillPluginSecretMapper.selectById(skillId);
        if (entity == null) {
            return new SkillSecretView(skillId, false, Map.of(), null);
        }
        return new SkillSecretView(
                skillId,
                true,
                toMaskedMap(entity.getSecretMasked()),
                entity.getUpdatedAt()
        );
    }

    public SkillSecretView upsertSecret(String skillId, Map<String, Object> input) {
        ensureSkillExists(skillId);
        Map<String, String> normalizedSecrets = normalizeSecrets(input);
        if (normalizedSecrets.isEmpty()) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "至少需要配置一个密钥字段");
        }

        String plaintext = JsonUtil.toJson(normalizedSecrets);
        String ciphertext = AesGcmCryptoUtil.encrypt(plaintext, appProperties.getPlatform().getSecretKey());
        Map<String, String> maskedMap = buildMaskedMap(normalizedSecrets);

        SkillPluginSecretEntity entity = new SkillPluginSecretEntity();
        entity.setSkillId(skillId);
        entity.setSecretCiphertext(ciphertext);
        entity.setSecretMasked(JsonUtil.toJson(maskedMap));

        SkillPluginSecretEntity existing = skillPluginSecretMapper.selectById(skillId);
        if (existing == null) {
            skillPluginSecretMapper.insert(entity);
        } else {
            skillPluginSecretMapper.updateById(entity);
        }

        SkillPluginSecretEntity persisted = skillPluginSecretMapper.selectById(skillId);
        LocalDateTime updatedAt = persisted == null ? null : persisted.getUpdatedAt();
        return new SkillSecretView(skillId, true, maskedMap, updatedAt);
    }

    public SkillSecretView clearSecret(String skillId) {
        ensureSkillExists(skillId);
        skillPluginSecretMapper.deleteById(skillId);
        return new SkillSecretView(skillId, false, Map.of(), null);
    }

    public Map<String, String> getDecryptedSecret(String skillId) {
        SkillPluginSecretEntity entity = skillPluginSecretMapper.selectById(skillId);
        if (entity == null || !StringUtils.hasText(entity.getSecretCiphertext())) {
            return Map.of();
        }
        String plaintext = AesGcmCryptoUtil.decrypt(entity.getSecretCiphertext(), appProperties.getPlatform().getSecretKey());
        Map<String, Object> parsed = JsonUtil.toMap(plaintext);
        Map<String, String> result = new LinkedHashMap<>();
        parsed.forEach((key, value) -> {
            if (value != null && StringUtils.hasText(String.valueOf(value))) {
                result.put(key, String.valueOf(value));
            }
        });
        return result;
    }

    public Map<String, SkillSecretView> batchSecretViews(List<String> skillIds) {
        Map<String, SkillSecretView> result = new HashMap<>();
        if (skillIds == null || skillIds.isEmpty()) {
            return result;
        }
        List<SkillPluginSecretEntity> entities = skillPluginSecretMapper.selectBatchIds(skillIds);
        for (String skillId : skillIds) {
            result.put(skillId, new SkillSecretView(skillId, false, Map.of(), null));
        }
        for (SkillPluginSecretEntity entity : entities) {
            result.put(entity.getSkillId(), new SkillSecretView(
                    entity.getSkillId(),
                    true,
                    toMaskedMap(entity.getSecretMasked()),
                    entity.getUpdatedAt()
            ));
        }
        return result;
    }

    private void ensureSkillExists(String skillId) {
        SkillEntity skillEntity = skillMapper.selectById(skillId);
        if (skillEntity == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Skill not found");
        }
    }

    private Map<String, String> normalizeSecrets(Map<String, Object> input) {
        if (input == null || input.isEmpty()) {
            return Map.of();
        }
        Object secretsNode = input.get("secrets");
        Map<String, Object> source;
        if (secretsNode instanceof Map<?, ?> map) {
            source = new LinkedHashMap<>();
            map.forEach((key, value) -> source.put(String.valueOf(key), value));
        } else {
            source = input;
        }

        Map<String, String> normalized = new LinkedHashMap<>();
        source.forEach((key, value) -> {
            if (!StringUtils.hasText(key) || value == null) {
                return;
            }
            String text = String.valueOf(value).trim();
            if (StringUtils.hasText(text)) {
                normalized.put(key, text);
            }
        });
        return normalized;
    }

    private Map<String, String> buildMaskedMap(Map<String, String> secrets) {
        Map<String, String> masked = new LinkedHashMap<>();
        secrets.forEach((key, value) -> masked.put(key, maskValue(value)));
        return masked;
    }

    private Map<String, String> toMaskedMap(String json) {
        if (!StringUtils.hasText(json)) {
            return Map.of();
        }
        Map<String, Object> source = JsonUtil.toMap(json);
        Map<String, String> result = new LinkedHashMap<>();
        source.forEach((key, value) -> {
            if (value != null) {
                result.put(key, String.valueOf(value));
            }
        });
        return result;
    }

    private String maskValue(String value) {
        if (!StringUtils.hasText(value)) {
            return "****";
        }
        String trimmed = value.trim();
        if (trimmed.length() <= 4) {
            return trimmed.charAt(0) + "***";
        }
        return trimmed.substring(0, 2) + "****" + trimmed.substring(trimmed.length() - 2);
    }
}
