import { ApiErrorResponse } from '../../types/api';

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;
  requestId?: string;

  constructor(code: string, message: string, status: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export const API_BASE = '/api/v1';

export function getApiUrl(endpoint: string): string {
  return endpoint.startsWith('http') || endpoint.startsWith('/api') ? endpoint : `${API_BASE}${endpoint}`;
}

export function getCsrfToken(): string | null {
  return getCookie('gk_csrf');
}

export function parseApiError(status: number, statusText: string, data: any): ApiClientError {
  const errorBody = data as ApiErrorResponse;
  const code = errorBody?.error?.code || 'http_error';
  const message = errorBody?.error?.message || `HTTP ${status}: ${statusText}`;
  const details = errorBody?.error?.details;
  const requestId = errorBody?.error?.request_id;
  return new ApiClientError(code, message, status, details, requestId);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') || endpoint.startsWith('/api') ? endpoint : `${API_BASE}${endpoint}`;

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const method = (options.method || 'GET').toUpperCase();
  const isUnsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  // Auto-inject CSRF token for unsafe methods (Double Submit Cookie Pattern)
  if (isUnsafeMethod && !headers.has('X-CSRF-Token')) {
    const csrfToken = getCookie('gk_csrf');
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    method,
    headers,
    credentials: 'include', // Essential for HttpOnly session cookies
  };

  const response = await fetch(url, config);

  // If response is 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorBody = data as ApiErrorResponse;
    const code = errorBody?.error?.code || 'http_error';
    const message = errorBody?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    const details = errorBody?.error?.details;
    const requestId = errorBody?.error?.request_id || response.headers.get('X-Request-ID') || undefined;

    throw new ApiClientError(code, message, response.status, details, requestId);
  }

  return data as T;
}
export const api = {
  get: <T>(url: string, options?: RequestInit) => request<T>(url, { ...options, method: 'GET' }),
  post: <T>(url: string, body?: unknown, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(url: string, body?: unknown, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(url: string, body?: unknown, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(url: string, options?: RequestInit) => request<T>(url, { ...options, method: 'DELETE' }),
};
