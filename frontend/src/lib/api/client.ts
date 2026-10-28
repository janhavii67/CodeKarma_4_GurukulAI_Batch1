import { ApiErrorResponse } from '../../types/api';

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)gk_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function resolveApiBaseUrl(
  configuredUrl: string | undefined,
  protocol: string,
  hostname: string,
): string {
  const defaultUrl = `${protocol}//${hostname}:8000`;
  return (configuredUrl || defaultUrl).replace(/\/+$/, '');
}

const pageLocation = typeof window === 'undefined' ? null : window.location;
const BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_URL,
  pageLocation?.protocol || 'http:',
  pageLocation?.hostname || 'localhost',
);

/** Builds a full API URL from a path like '/knowledge-versions/{id}/media'. */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullPath = normalizedPath.startsWith('/api/v1')
    ? normalizedPath
    : `/api/v1${normalizedPath}`;
  return `${BASE_URL}${fullPath}`;
}

/** Reads the double-submit CSRF token from the gk_csrf cookie. */
export function getCsrfToken(): string | null {
  return getCsrfTokenFromCookie();
}

/** Parses API error JSON envelope or text into an ApiClientError */
export function parseApiError(status: number, statusText: string, data: any): ApiClientError {
  const errorEnvelope = (data as ApiErrorResponse)?.error;
  if (errorEnvelope) {
    return new ApiClientError(
      status,
      errorEnvelope.code || 'api_error',
      errorEnvelope.message || 'An error occurred while communicating with the server.',
      errorEnvelope.details,
      errorEnvelope.request_id
    );
  }

  return new ApiClientError(
    status,
    'http_error',
    typeof data === 'string' && data ? data : `HTTP ${status} ${statusText}`
  );
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // Ensure /api/v1 prefix is applied if not already present
  const fullPath = normalizedPath.startsWith('/api/v1')
    ? normalizedPath
    : `/api/v1${normalizedPath}`;

  const url = `${BASE_URL}${fullPath}`;

  const headers = new Headers(options.headers || {});

  // Add credentials for session cookies
  const isMultipart = options.body instanceof FormData;
  if (!isMultipart && !headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  // Double-submit CSRF header for state-changing HTTP methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  // Parse JSON response
  let data: any;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw parseApiError(response.status, response.statusText, data);
  }

  return data as T;
}

export const api = {
  get<T>(path: string, options?: RequestInit): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
  },

  post<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    const isMultipart = body instanceof FormData;
    return request<T>(path, {
      ...options,
      method: 'POST',
      body: isMultipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    const isMultipart = body instanceof FormData;
    return request<T>(path, {
      ...options,
      method: 'PUT',
      body: isMultipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    const isMultipart = body instanceof FormData;
    return request<T>(path, {
      ...options,
      method: 'PATCH',
      body: isMultipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string, options?: RequestInit): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' });
  },
};
