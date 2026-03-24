package com.haoyitec.agent.server.module.provider;

import com.haoyitec.agent.server.common.config.AppProperties;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.AesGcmCryptoUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.LlmProviderEntity;
import com.haoyitec.agent.server.domain.entity.LlmProviderSecretEntity;
import com.haoyitec.agent.server.domain.mapper.LlmProviderMapper;
import com.haoyitec.agent.server.domain.mapper.LlmProviderSecretMapper;
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
public class LlmProviderSecretService {

    private final LlmProviderMapper providerMapper;
    private final LlmProviderSecretMapper providerSecretMapper;
    private final AppProperties appProperties;

    public LlmProviderSecretView getSecretView(String providerId) {
        ensureProviderExists(providerId);
        LlmProviderSecretEntity entity = providerSecretMapper.selectById(providerId);
        if (entity == null) {
            return new LlmProviderSecretView(providerId, false, Map.of(), null);
        }
        return new LlmProviderSecretView(providerId, true, toMaskedMap(entity.getSecretMasked()), entity.getUpdatedAt());
    }

    public LlmProviderSecretView upsertSecret(String providerId, String apiKey) {
        ensureProviderExists(providerId);
        if (!StringUtils.hasText(apiKey)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "apiKey 必填");
        }
        Map<String, String> secrets = new LinkedHashMap<>();
        secrets.put("apiKey", apiKey.trim());

        String plaintext = JsonUtil.toJson(secrets);
        String ciphertext = AesGcmCryptoUtil.encrypt(plaintext, appProperties.getPlatform().getSecretKey());
        Map<String, String> maskedMap = buildMaskedMap(secrets);

        LlmProviderSecretEntity entity = new LlmProviderSecretEntity();
        entity.setProviderId(providerId);
        entity.setSecretCiphertext(ciphertext);
        entity.setSecretMasked(JsonUtil.toJson(maskedMap));

        LlmProviderSecretEntity existing = providerSecretMapper.selectById(providerId);
        if (existing == null) {
            providerSecretMapper.insert(entity);
        } else {
            providerSecretMapper.updateById(entity);
        }

        LlmProviderSecretEntity persisted = providerSecretMapper.selectById(providerId);
        LocalDateTime updatedAt = persisted == null ? null : persisted.getUpdatedAt();
        return new LlmProviderSecretView(providerId, true, maskedMap, updatedAt);
    }

    public LlmProviderSecretView clearSecret(String providerId) {
        ensureProviderExists(providerId);
        providerSecretMapper.deleteById(providerId);
        return new LlmProviderSecretView(providerId, false, Map.of(), null);
    }

    public Map<String, String> getDecryptedSecret(String providerId) {
        LlmProviderSecretEntity entity = providerSecretMapper.selectById(providerId);
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

    public String getApiKey(String providerId) {
        Map<String, String> secrets = getDecryptedSecret(providerId);
        if (secrets.isEmpty()) {
            return null;
        }
        if (StringUtils.hasText(secrets.get("apiKey"))) {
            return secrets.get("apiKey");
        }
        if (StringUtils.hasText(secrets.get("apikey"))) {
            return secrets.get("apikey");
        }
        return secrets.values().stream().filter(StringUtils::hasText).findFirst().orElse(null);
    }

    public Map<String, LlmProviderSecretView> batchSecretViews(List<String> providerIds) {
        Map<String, LlmProviderSecretView> result = new HashMap<>();
        if (providerIds == null || providerIds.isEmpty()) {
            return result;
        }
        List<LlmProviderSecretEntity> entities = providerSecretMapper.selectBatchIds(providerIds);
        for (String providerId : providerIds) {
            result.put(providerId, new LlmProviderSecretView(providerId, false, Map.of(), null));
        }
        for (LlmProviderSecretEntity entity : entities) {
            result.put(entity.getProviderId(), new LlmProviderSecretView(
                    entity.getProviderId(),
                    true,
                    toMaskedMap(entity.getSecretMasked()),
                    entity.getUpdatedAt()
            ));
        }
        return result;
    }

    private void ensureProviderExists(String providerId) {
        LlmProviderEntity provider = providerMapper.selectById(providerId);
        if (provider == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Provider not found");
        }
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
