import { ApiErrorResponse } from '../../types/api';

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;
  requestId?: string;

  constructor(
    codeOrStatus: string | number,
    messageOrCode: string,
    statusOrMessage: number | string = 500,
    details?: unknown,
    requestId?: string
  ) {
    if (typeof codeOrStatus === 'number') {
      // Signature: (status: number, code: string, message: string, details?: unknown, requestId?: string)
      super(typeof statusOrMessage === 'string' ? statusOrMessage : messageOrCode);
      this.name = 'ApiClientError';
      this.status = codeOrStatus;
      this.code = messageOrCode;
    } else {
      // Signature: (code: string, message: string, status: number, details?: unknown, requestId?: string)
      super(messageOrCode);
      this.name = 'ApiClientError';
      this.code = codeOrStatus;
      this.status = typeof statusOrMessage === 'number' ? statusOrMessage : 500;
    }
    this.details = details;
    this.requestId = requestId;
  }
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export function resolveApiBaseUrl(
  configuredUrl: string | undefined,
  _protocol: string,
  _hostname: string,
): string {
  // Keep same-origin requests as the default so Vite's /api proxy and
  // production reverse proxies both work. Deployments on another API origin
  // can set VITE_API_URL explicitly.
  return (configuredUrl || '').replace(/\/+$/, '');
}

const pageLocation = typeof window === 'undefined' ? null : window.location;
export const BASE_URL = resolveApiBaseUrl(
  import.meta.env?.VITE_API_URL,
  pageLocation?.protocol || 'http:',
  pageLocation?.hostname || 'localhost',
);

export const API_BASE = '/api/v1';

/** Builds a full API URL from a path like '/knowledge-versions/{id}/media'. */
export function getApiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullPath = normalizedPath.startsWith('/api/') || normalizedPath === '/api'
    ? normalizedPath
    : `/api/v1${normalizedPath}`;
  return `${BASE_URL}${fullPath}`;
}

/** Reads the double-submit CSRF token from the gk_csrf cookie. */
export function getCsrfToken(): string | null {
  return getCookie('gk_csrf');
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

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = getApiUrl(path);

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const isMultipart = options.body instanceof FormData;
  if (!isMultipart && !headers.has('Content-Type') && options.body !== undefined && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Double-submit CSRF header for state-changing HTTP methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include', // Essential for HttpOnly session cookies
  });

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  // Parse response
  let data: any = null;
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

  postForm<T>(path: string, formData: FormData, options?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'POST',
      body: formData,
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
