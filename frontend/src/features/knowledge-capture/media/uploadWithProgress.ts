import { getApiUrl, getCsrfToken, parseApiError } from '../../../lib/api/client';
import { MediaAsset, UploadProgress } from './types';

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  endpoint?: string;
  kind?: string;
  title?: string;
  description?: string;
  tags?: string;
}

/**
 * Uploads a file attached to a knowledge version using XMLHttpRequest to report real upload progress.
 * Reuses the existing API client's URL building, CSRF token handling, credentials, and error envelope parsing.
 */
export function uploadWithProgress(
  versionId: string,
  file: File,
  options: UploadOptions = {}
): Promise<MediaAsset> {
  return new Promise<MediaAsset>((resolve, reject) => {
    const { onProgress, signal } = options;

    if (signal?.aborted) {
      const abortErr = new Error('Upload aborted');
      abortErr.name = 'AbortError';
      return reject(abortErr);
    }

    const xhr = new XMLHttpRequest();
    const url = getApiUrl(options.endpoint || `/knowledge-versions/${versionId}/media`);

    xhr.open('POST', url, true);
    xhr.withCredentials = true;

    // Double-submit CSRF protection header
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    }

    // Abort signal listener
    const onAbort = () => {
      xhr.abort();
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    // Upload progress event listener
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable && e.total > 0) {
        const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
        onProgress?.({
          loaded: e.loaded,
          total: e.total,
          percent,
          isProcessing: percent >= 100,
        });
      }
    };

    xhr.onload = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }

      let parsedData: any = null;
      const responseText = xhr.responseText;
      if (responseText) {
        try {
          parsedData = JSON.parse(responseText);
        } catch {
          parsedData = responseText;
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsedData as MediaAsset);
      } else {
        const error = parseApiError(xhr.status, xhr.statusText, parsedData);
        reject(error);
      }
    };

    xhr.onerror = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      const error = parseApiError(
        0,
        'Network Error',
        { error: { code: 'network_error', message: 'Network error occurred during file upload. Please retry.' } }
      );
      reject(error);
    };

    xhr.onabort = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      const abortErr = new Error('Upload canceled');
      abortErr.name = 'AbortError';
      reject(abortErr);
    };

    // Construct form data with 'file' field only (server derives kind)
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (options.kind) formData.append('kind', options.kind);
    if (options.title) formData.append('title', options.title);
    if (options.description) formData.append('description', options.description);
    if (options.tags) formData.append('tags', options.tags);

    xhr.send(formData);
  });
}
