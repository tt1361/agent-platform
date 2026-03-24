package com.haoyitec.agent.server.common.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final AppProperties appProperties;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String[] origins = split(appProperties.getCors().getAllowedOrigins());
        String[] methods = split(appProperties.getCors().getAllowedMethods());
        String[] headers = split(appProperties.getCors().getAllowedHeaders());

        registry.addMapping("/**")
                .allowedOriginPatterns(origins.length == 0 ? new String[]{"*"} : origins)
                .allowedMethods(methods.length == 0 ? new String[]{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"} : methods)
                .allowedHeaders(headers.length == 0 ? new String[]{"*"} : headers)
                .allowCredentials(false)
                .maxAge(appProperties.getCors().getMaxAge() == null ? 3600L : appProperties.getCors().getMaxAge());
    }

    private String[] split(String value) {
        if (!StringUtils.hasText(value)) {
            return new String[0];
        }
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toArray(String[]::new);
    }
}
