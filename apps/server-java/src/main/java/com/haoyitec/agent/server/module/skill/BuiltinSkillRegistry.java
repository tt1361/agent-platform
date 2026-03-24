package com.haoyitec.agent.server.module.skill;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class BuiltinSkillRegistry {

    public List<BuiltinSkill> list() {
        return List.of(
                new BuiltinSkill(
                        "echo",
                        "自定义回显技能",
                        "1.0.0",
                        "一个用于联调的简单回显技能",
                        "echo",
                        Map.of("type", "object", "properties", Map.of("text", Map.of("type", "string"))),
                        Map.of("type", "object"),
                        List.of("utility", "test")
                ),
                new BuiltinSkill(
                        "summarize_text",
                        "摘要生成",
                        "1.0.0",
                        "自动对文本进行缩写截断并统计字数。",
                        "summarize_text",
                        Map.of(
                                "type", "object",
                                "properties", Map.of("text", Map.of("type", "string", "description", "需要被截断摘要的原始文本")),
                                "required", List.of("text")
                        ),
                        Map.of("type", "object"),
                        List.of("text", "utility")
                ),
                new BuiltinSkill(
                        "extract_keywords",
                        "关键词提取",
                        "1.0.0",
                        "提取给定文本中的关键词信息。",
                        "extract_keywords",
                        Map.of(
                                "type", "object",
                                "properties", Map.of("text", Map.of("type", "string", "description", "原始文本")),
                                "required", List.of("text")
                        ),
                        Map.of("type", "object"),
                        List.of("text", "utility")
                ),
                new BuiltinSkill(
                        "get_weather",
                        "天气查询",
                        "1.0.0",
                        "查询指定城市的实时天气情况，例如温度、湿度等。",
                        "get_weather",
                        Map.of(
                                "type", "object",
                                "properties", Map.of("location", Map.of("type", "string", "description", "城市名称，例如：上海、北京、广州")),
                                "required", List.of("location")
                        ),
                        Map.of("type", "object"),
                        List.of("utility", "weather", "api")
                )
        );
    }
}
