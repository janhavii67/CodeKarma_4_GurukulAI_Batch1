export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
  request_id?: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export interface HealthCheckResponse {
  status: string;
  version: string;
  database: string;
  latency_ms?: number;
}
