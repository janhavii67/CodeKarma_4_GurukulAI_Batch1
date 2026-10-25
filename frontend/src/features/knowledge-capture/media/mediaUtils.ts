import { MediaConfig } from './types';
import { ApiClientError } from '../../../lib/api/client';

/** Format byte size to human readable string (e.g. "1.5 MB") */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Format duration in seconds to mm:ss */
export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Normalize MIME type by lowercasing, stripping parameters (;codecs=...), and mapping known aliases */
export function normalizeMimeType(mime: string): string {
  if (!mime) return '';
  const base = mime.toLowerCase().split(';')[0].trim();
  const aliasMap: Record<string, string> = {
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/mp3': 'audio/mpeg',
    'audio/x-m4a': 'audio/mp4',
    'image/pjpeg': 'image/jpeg',
    'image/x-png': 'image/png',
  };
  return aliasMap[base] || base;
}

/** Flatten and normalize all allowed MIME types from backend config */
export function getAllAllowedMimes(config: MediaConfig): string[] {
  if (!config?.allowed_mime_types) return [];
  const allMimes: string[] = [];
  for (const list of Object.values(config.allowed_mime_types)) {
    if (Array.isArray(list)) {
      for (const m of list) {
        allMimes.push(normalizeMimeType(m));
      }
    }
  }
  return Array.from(new Set(allMimes));
}

/** Generate client-side timestamped recording filename: recording-YYYYMMDD-HHmmss.<ext> */
export function generateRecordingFilename(ext: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const cleanExt = ext.replace(/^\./, '');
  return `recording-${yyyy}${mm}${dd}-${hh}${min}${ss}.${cleanExt}`;
}

/** Map actual recorder MIME type to target file extension */
export function recorderMimeToExtension(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('mp4')) return 'm4a';
  return 'webm';
}

/** Maps API errors to human-friendly messages */
export function mapMediaErrorToMessage(error: unknown, config?: MediaConfig): string {
  if (error instanceof ApiClientError) {
    switch (error.status) {
      case 401:
        return 'Session expired. Please sign in again.';
      case 403:
        return 'You do not have permission to modify media for this version.';
      case 404:
        return 'The requested resource is not available.';
      case 409:
        if (error.code === 'media_limit_reached') {
          return `Media limit reached. Maximum ${config?.max_media_per_version ?? 10} assets per version.`;
        }
        return 'This version is frozen and can no longer be edited.';
      case 413:
        return `File exceeds the maximum upload size limit of ${
          config ? formatBytes(config.max_upload_bytes) : 'the server'
        }.`;
      case 415:
        return 'Unsupported file type or file content does not match its declared type.';
      case 422:
        return 'Invalid or empty file payload.';
      default:
        if (error.status >= 500) {
          return 'Server error occurred while processing media. Please try again.';
        }
        return error.message || 'An error occurred while uploading media.';
    }
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'Upload was canceled.';
    }
    return error.message;
  }

  return 'A network or unexpected error occurred. Please try again.';
}
