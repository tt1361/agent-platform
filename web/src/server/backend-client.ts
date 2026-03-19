import type { ApiResponse } from '@/types/api';

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

export function getServerBackendOrigin() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_API_ORIGIN || process.env.API_ORIGIN || 'http://127.0.0.1:3000');
}

export async function requestBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${getServerBackendOrigin()}${normalizedPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const data = (await response.json()) as ApiResponse<T> & { error?: { message?: string } };
  if (!response.ok || !data.success) {
    throw new Error(data.error?.message ?? 'Request failed');
  }

  return data.data;
}
