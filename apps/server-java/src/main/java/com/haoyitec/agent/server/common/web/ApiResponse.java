package com.haoyitec.agent.server.common.web;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {

    private boolean success;
    private T data;
    private ApiError error;

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder().success(true).data(data).build();
    }

    public static <T> ApiResponse<T> failure(String code, String message) {
        return ApiResponse.<T>builder()
                .success(false)
                .error(new ApiError(code, message, null))
                .build();
    }

    public static <T> ApiResponse<T> failure(String code, String message, Object details) {
        return ApiResponse.<T>builder()
                .success(false)
                .error(new ApiError(code, message, details))
                .build();
    }
}
