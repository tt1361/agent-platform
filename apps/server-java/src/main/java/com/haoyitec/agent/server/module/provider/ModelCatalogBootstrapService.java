package com.haoyitec.agent.server.module.provider;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class ModelCatalogBootstrapService implements ApplicationRunner {

    private final ModelCatalogService modelCatalogService;

    @Override
    public void run(ApplicationArguments args) {
        modelCatalogService.upsertTemplate("openai-compatible", "gpt-4o", "OpenAI GPT-4o", List.of("chat", "vision", "tool_calling"), 10);
        modelCatalogService.upsertTemplate("openai-compatible", "gpt-4.1", "OpenAI GPT-4.1", List.of("chat", "tool_calling"), 11);
        modelCatalogService.upsertTemplate("openai-compatible", "claude-3-7-sonnet-20250219", "Anthropic Claude 3.7 Sonnet", List.of("chat", "vision", "tool_calling"), 20);
        modelCatalogService.upsertTemplate("openai-compatible", "gemini-2.5-pro", "Google Gemini 2.5 Pro", List.of("chat", "vision", "tool_calling"), 30);
        modelCatalogService.upsertTemplate("openai-compatible", "grok-2-latest", "xAI Grok 2", List.of("chat", "vision", "tool_calling"), 40);
        modelCatalogService.upsertTemplate("openai-compatible", "llama-3.3-70b-instruct", "Meta Llama 3.3 70B", List.of("chat", "tool_calling"), 50);
        modelCatalogService.upsertTemplate("openai-compatible", "mistral-large-latest", "Mistral Large", List.of("chat", "tool_calling"), 60);
        modelCatalogService.upsertTemplate("openai-compatible", "command-r-plus", "Cohere Command R+", List.of("chat", "tool_calling"), 70);
        modelCatalogService.upsertTemplate("openai-compatible", "deepseek-chat", "DeepSeek V3", List.of("chat", "tool_calling"), 80);
        modelCatalogService.upsertTemplate("openai-compatible", "qwen-max", "阿里 Qwen Max", List.of("chat", "tool_calling"), 90);
        modelCatalogService.upsertTemplate("openai-compatible", "ernie-4.0-8k", "百度文心 ERNIE 4.0", List.of("chat", "tool_calling"), 100);
        modelCatalogService.upsertTemplate("openai-compatible", "glm-4.9", "智谱 GLM-4.9", List.of("chat", "tool_calling"), 110);
        modelCatalogService.upsertTemplate("openai-compatible", "hunyuan-turbo", "腾讯混元 Turbo", List.of("chat", "tool_calling"), 120);
        modelCatalogService.upsertTemplate("openai-compatible", "abab6.5-chat", "MiniMax abab6.5", List.of("chat", "tool_calling"), 130);
    }
}
