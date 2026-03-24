package com.haoyitec.agent.server.common.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Cors cors = new Cors();
    private Upload upload = new Upload();
    private Rag rag = new Rag();
    private Platform platform = new Platform();

    @Data
    public static class Cors {
        private String allowedOrigins = "*";
        private String allowedMethods = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
        private String allowedHeaders = "*";
        private Long maxAge = 3600L;
    }

    @Data
    public static class Upload {
        private String maxFileSize = "50MB";
        private String path = "./uploads";
    }

    @Data
    public static class Rag {
        private String vectorStoreIndex = "agent_vectors";
        private Integer chunkSize = 512;
        private Integer chunkOverlap = 50;
        private Integer topK = 5;
    }

    @Data
    public static class Platform {
        private String secretKey = "haoyitec-platform-secret-key-32bytes";
    }
}
