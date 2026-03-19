export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, meta };
}

export function fail(code: string, message: string, details?: unknown, requestId?: string) {
  return {
    success: false as const,
    error: { code, message, details },
    requestId,
  };
}
