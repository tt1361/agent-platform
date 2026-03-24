package com.haoyitec.agent.server.common.util;

import java.util.UUID;

public final class IdUtil {

    private IdUtil() {
    }

    public static String uuid() {
        return UUID.randomUUID().toString();
    }

    public static String traceId() {
        return "trace_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8);
    }
}
