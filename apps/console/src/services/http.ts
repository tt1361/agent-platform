function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

export function getApiBaseUrl() {
  const configuredBase =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.NEXT_PUBLIC_API_ORIGIN || ''
      : '';

  if (configuredBase) {
    return trimTrailingSlash(configuredBase);
  }

  if (typeof window !== 'undefined') {
    return '';
  }

  return 'http://127.0.0.1:8888';
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}
