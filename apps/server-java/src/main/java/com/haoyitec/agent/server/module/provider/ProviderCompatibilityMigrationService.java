package com.haoyitec.agent.server.module.provider;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.LlmModelCatalogEntity;
import com.haoyitec.agent.server.domain.entity.LlmProviderEntity;
import com.haoyitec.agent.server.domain.mapper.LlmModelCatalogMapper;
import com.haoyitec.agent.server.domain.mapper.LlmProviderMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProviderCompatibilityMigrationService implements ApplicationRunner {

    private static final List<String> LEGACY_PROVIDER_TYPES = List.of(
            "anthropic", "claude", "google", "gemini", "google-gemini"
    );

    private final LlmProviderMapper providerMapper;
    private final LlmModelCatalogMapper modelCatalogMapper;

    @Override
    public void run(ApplicationArguments args) {
        migrateLegacyProviders();
        migrateLegacyModelCatalog();
    }

    private void migrateLegacyProviders() {
        List<LlmProviderEntity> legacyProviders = providerMapper.selectList(new LambdaQueryWrapper<LlmProviderEntity>()
                .in(LlmProviderEntity::getProviderType, LEGACY_PROVIDER_TYPES));
        if (legacyProviders.isEmpty()) {
            return;
        }

        for (LlmProviderEntity provider : legacyProviders) {
            Map<String, Object> config = new LinkedHashMap<>(JsonUtil.toMap(provider.getConfig()));
            config.put("migrationRequired", true);
            config.put("migrationMessage", "已切换为兼容协议，请校验 apiBaseUrl 与 model 后重新启用");

            providerMapper.update(null, new LambdaUpdateWrapper<LlmProviderEntity>()
                    .eq(LlmProviderEntity::getId, provider.getId())
                    .set(LlmProviderEntity::getProviderType, "openai-compatible")
                    .set(LlmProviderEntity::getStatus, "disabled")
                    .set(LlmProviderEntity::getConfig, JsonUtil.toJson(config)));

            log.warn("兼容协议迁移：providerKey={} 已转为 openai-compatible 并自动禁用，请完成重配后启用", provider.getProviderKey());
        }
    }

    private void migrateLegacyModelCatalog() {
        List<LlmModelCatalogEntity> legacyModels = modelCatalogMapper.selectList(new LambdaQueryWrapper<LlmModelCatalogEntity>()
                .in(LlmModelCatalogEntity::getProviderType, LEGACY_PROVIDER_TYPES));
        if (legacyModels.isEmpty()) {
            return;
        }

        List<String> migratedModelKeys = new ArrayList<>();
        List<String> mergedModelKeys = new ArrayList<>();
        for (LlmModelCatalogEntity model : legacyModels) {
            LlmModelCatalogEntity conflict = modelCatalogMapper.selectOne(new LambdaQueryWrapper<LlmModelCatalogEntity>()
                    .eq(LlmModelCatalogEntity::getProviderType, "openai-compatible")
                    .eq(LlmModelCatalogEntity::getModelKey, model.getModelKey())
                    .ne(LlmModelCatalogEntity::getId, model.getId())
                    .last("LIMIT 1"));
            if (conflict != null) {
                modelCatalogMapper.deleteById(model.getId());
                mergedModelKeys.add(model.getModelKey());
                continue;
            }

            modelCatalogMapper.update(null, new LambdaUpdateWrapper<LlmModelCatalogEntity>()
                    .eq(LlmModelCatalogEntity::getId, model.getId())
                    .set(LlmModelCatalogEntity::getProviderType, "openai-compatible"));
            migratedModelKeys.add(model.getModelKey());
        }

        if (!migratedModelKeys.isEmpty()) {
            log.warn("兼容协议迁移：已将 {} 个模型目录项转为 openai-compatible: {}",
                    migratedModelKeys.size(), String.join(",", migratedModelKeys));
        }
        if (!mergedModelKeys.isEmpty()) {
            log.warn("兼容协议迁移：检测到重复唯一键，已合并删除 {} 个旧模型目录项: {}",
                    mergedModelKeys.size(), String.join(",", mergedModelKeys));
        }
    }
}
