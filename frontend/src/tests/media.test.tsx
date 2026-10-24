import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaPanel } from '../features/knowledge-capture/media/MediaPanel';
import { MediaUploader } from '../features/knowledge-capture/media/MediaUploader';
import { AudioRecorder } from '../features/knowledge-capture/media/AudioRecorder';
import { MediaList } from '../features/knowledge-capture/media/MediaList';
import { MediaItem } from '../features/knowledge-capture/media/MediaItem';
import { uploadWithProgress } from '../features/knowledge-capture/media/uploadWithProgress';
import {
  formatBytes,
  formatDuration,
  normalizeMimeType,
  generateRecordingFilename,
  recorderMimeToExtension,
  mapMediaErrorToMessage,
} from '../features/knowledge-capture/media/mediaUtils';
import type { MediaAsset, MediaConfig } from '../features/knowledge-capture/media/types';
import { ApiClientError } from '../lib/api/client';

// ─── Mock API client ──────────────────────────────────────────────────────────

vi.mock('../lib/api/client', async () => {
  const actual = await vi.importActual<any>('../lib/api/client');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    getApiUrl: vi.fn((path: string) => {
      const norm = path.startsWith('/') ? path : `/${path}`;
      const full = norm.startsWith('/api/v1') ? norm : `/api/v1${norm}`;
      return `http://localhost:8000${full}`;
    }),
    getCsrfToken: vi.fn(() => 'mock-csrf-token-123'),
  };
});

import { api } from '../lib/api/client';
const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const mockConfig: MediaConfig = {
  max_upload_bytes: 10 * 1024 * 1024, // 10 MB for testing
  allowed_mime_types: {
    audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'],
    video: ['video/mp4', 'video/webm'],
    image: ['image/png', 'image/jpeg'],
    document: ['application/pdf'],
  },
  max_media_per_version: 5,
};

const mockAssets: MediaAsset[] = [
  {
    id: 'asset-1',
    version_id: 'ver-100',
    kind: 'audio',
    original_name: 'spindle_sound.webm',
    mime: 'audio/webm',
    size_bytes: 512000,
    uploaded_by: 'user-1',
    created_at: '2026-03-01T10:00:00Z',
    url: '/api/v1/media/asset-1',
  },
  {
    id: 'asset-2',
    version_id: 'ver-100',
    kind: 'video',
    original_name: 'startup_guide.mp4',
    mime: 'video/mp4',
    size_bytes: 5242880,
    uploaded_by: 'user-1',
    created_at: '2026-03-01T10:05:00Z',
    url: '/api/v1/media/asset-2',
  },
  {
    id: 'asset-3',
    version_id: 'ver-100',
    kind: 'image',
    original_name: 'emergency_stop.png',
    mime: 'image/png',
    size_bytes: 1048576,
    uploaded_by: 'user-1',
    created_at: '2026-03-01T10:10:00Z',
    url: '/api/v1/media/asset-3',
  },
  {
    id: 'asset-4',
    version_id: 'ver-100',
    kind: 'document',
    original_name: 'safety_checklist.pdf',
    mime: 'application/pdf',
    size_bytes: 204800,
    uploaded_by: 'user-1',
    created_at: '2026-03-01T10:15:00Z',
    url: '/api/v1/media/asset-4',
  },
];

// Helper to render with QueryClient & MemoryRouter
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('T2.4: Media Utilities', () => {
  it('formats byte sizes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(10485760)).toBe('10 MB');
  });

  it('formats duration in mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(9)).toBe('00:09');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('normalizes MIME types and resolves known aliases', () => {
    expect(normalizeMimeType('Audio/Webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeMimeType('audio/x-wav')).toBe('audio/wav');
    expect(normalizeMimeType('audio/wave')).toBe('audio/wav');
    expect(normalizeMimeType('audio/mp3')).toBe('audio/mpeg');
    expect(normalizeMimeType('image/pjpeg')).toBe('image/jpeg');
    expect(normalizeMimeType('image/x-png')).toBe('image/png');
  });

  it('generates filename matching recording-YYYYMMDD-HHmmss pattern', () => {
    const filename = generateRecordingFilename('webm');
    expect(filename).toMatch(/^recording-\d{8}-\d{6}\.webm$/);

    const m4aFilename = generateRecordingFilename('.m4a');
    expect(m4aFilename).toMatch(/^recording-\d{8}-\d{6}\.m4a$/);
  });

  it('maps recorder MIME types to correct extensions', () => {
    expect(recorderMimeToExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(recorderMimeToExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(recorderMimeToExtension('audio/mp4')).toBe('m4a');
  });

  it('maps server API errors to descriptive user messages', () => {
    expect(mapMediaErrorToMessage(new ApiClientError(413, 'payload_too_large', 'Too big'), mockConfig)).toContain('exceeds the maximum upload size limit of 10 MB');
    expect(mapMediaErrorToMessage(new ApiClientError(415, 'unsupported_media_type', 'Invalid type'))).toContain('Unsupported file type');
    expect(mapMediaErrorToMessage(new ApiClientError(422, 'validation_error', 'Invalid file'))).toContain('Invalid or empty file payload');
    expect(mapMediaErrorToMessage(new ApiClientError(409, 'frozen_version', 'Frozen'))).toContain('This version is frozen and can no longer be edited');
    expect(mapMediaErrorToMessage(new ApiClientError(409, 'media_limit_reached', 'Limit'), mockConfig)).toContain('Media limit reached. Maximum 5 assets');
    expect(mapMediaErrorToMessage(new ApiClientError(403, 'forbidden', 'Forbidden'))).toContain('You do not have permission');
    expect(mapMediaErrorToMessage(new ApiClientError(404, 'not_found', 'Not found'))).toContain('The requested resource is not available');
    expect(mapMediaErrorToMessage(new ApiClientError(401, 'unauthorized', 'Expired'))).toContain('Session expired. Please sign in again');
    expect(mapMediaErrorToMessage(new ApiClientError(500, 'server_error', 'Server error'))).toContain('Server error occurred');
  });
});

describe('T2.4: uploadWithProgress (XHR helper)', () => {
  let originalXHR: any;
  let mockXHRInstance: any;

  beforeEach(() => {
    originalXHR = window.XMLHttpRequest;

    mockXHRInstance = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
      withCredentials: false,
      upload: {
        onprogress: null as any,
      },
      onload: null as any,
      onerror: null as any,
      onabort: null as any,
      status: 201,
      statusText: 'Created',
      responseText: JSON.stringify(mockAssets[0]),
    };

    window.XMLHttpRequest = vi.fn(() => mockXHRInstance) as any;
  });

  afterEach(() => {
    window.XMLHttpRequest = originalXHR;
  });

  it('sends multipart request with credentials and CSRF header', async () => {
    const file = new File(['audio content'], 'test.webm', { type: 'audio/webm' });
    const progressSpy = vi.fn();

    const uploadPromise = uploadWithProgress('ver-100', file, { onProgress: progressSpy });

    expect(mockXHRInstance.open).toHaveBeenCalledWith(
      'POST',
      'http://localhost:8000/api/v1/knowledge-versions/ver-100/media',
      true
    );
    expect(mockXHRInstance.withCredentials).toBe(true);
    expect(mockXHRInstance.setRequestHeader).toHaveBeenCalledWith('X-CSRF-Token', 'mock-csrf-token-123');

    // Simulate progress event
    mockXHRInstance.upload.onprogress({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    });
    expect(progressSpy).toHaveBeenCalledWith({
      loaded: 50,
      total: 100,
      percent: 50,
      isProcessing: false,
    });

    // Simulate complete progress
    mockXHRInstance.upload.onprogress({
      lengthComputable: true,
      loaded: 100,
      total: 100,
    });
    expect(progressSpy).toHaveBeenCalledWith({
      loaded: 100,
      total: 100,
      percent: 100,
      isProcessing: true,
    });

    // Simulate completion
    mockXHRInstance.onload();

    const result = await uploadPromise;
    expect(result.id).toBe('asset-1');
  });

  it('handles abort signal cleanly as AbortError', async () => {
    const file = new File(['content'], 'test.webm', { type: 'audio/webm' });
    const controller = new AbortController();

    const uploadPromise = uploadWithProgress('ver-100', file, { signal: controller.signal });

    // Abort in flight
    controller.abort();
    expect(mockXHRInstance.abort).toHaveBeenCalled();

    mockXHRInstance.onabort();

    await expect(uploadPromise).rejects.toThrow('Upload canceled');
  });

  it('parses error envelope on non-2xx status', async () => {
    mockXHRInstance.status = 413;
    mockXHRInstance.statusText = 'Payload Too Large';
    mockXHRInstance.responseText = JSON.stringify({
      error: { code: 'payload_too_large', message: 'File is too large' },
    });

    const file = new File(['content'], 'large.mp4', { type: 'video/mp4' });
    const uploadPromise = uploadWithProgress('ver-100', file);

    mockXHRInstance.onload();

    await expect(uploadPromise).rejects.toThrow('File is too large');
  });

  it('handles network error', async () => {
    const file = new File(['content'], 'audio.wav', { type: 'audio/wav' });
    const uploadPromise = uploadWithProgress('ver-100', file);

    mockXHRInstance.onerror();

    await expect(uploadPromise).rejects.toThrow(/Network error/i);
  });
});

describe('T2.4: MediaUploader', () => {
  it('rejects empty files (0 bytes)', () => {
    const onUploadSuccess = vi.fn();
    renderWithProviders(
      <MediaUploader
        versionId="ver-100"
        config={mockConfig}
        currentAssetCount={0}
        onUploadSuccess={onUploadSuccess}
      />
    );

    const input = document.getElementById('media-file-input') as HTMLInputElement;
    const emptyFile = new File([], 'empty.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [emptyFile] } });

    expect(screen.getByText(/File is empty \(0 bytes\)/i)).toBeInTheDocument();
  });

  it('rejects oversize files with formatted limit', () => {
    const onUploadSuccess = vi.fn();
    renderWithProviders(
      <MediaUploader
        versionId="ver-100"
        config={mockConfig}
        currentAssetCount={0}
        onUploadSuccess={onUploadSuccess}
      />
    );

    const input = document.getElementById('media-file-input') as HTMLInputElement;
    // Create 15MB file (limit is 10MB)
    const bigFile = new File([new Uint8Array(15 * 1024 * 1024)], 'giant.mp4', { type: 'video/mp4' });

    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(screen.getByText(/exceeds maximum limit of 10 MB/i)).toBeInTheDocument();
  });

  it('rejects unsupported MIME types and files with empty type', () => {
    const onUploadSuccess = vi.fn();
    renderWithProviders(
      <MediaUploader
        versionId="ver-100"
        config={mockConfig}
        currentAssetCount={0}
        onUploadSuccess={onUploadSuccess}
      />
    );

    const input = document.getElementById('media-file-input') as HTMLInputElement;

    // Unknown file
    const exeFile = new File(['123'], 'malware.exe', { type: 'application/x-msdownload' });
    fireEvent.change(input, { target: { files: [exeFile] } });
    expect(screen.getByText(/Unsupported file type/i)).toBeInTheDocument();

    // Empty type
    const emptyTypeFile = new File(['123'], 'noext', { type: '' });
    fireEvent.change(input, { target: { files: [emptyTypeFile] } });
    expect(screen.getByText(/File type could not be determined/i)).toBeInTheDocument();
  });

  it('enforces per-version asset cap', () => {
    const onUploadSuccess = vi.fn();
    // Already at cap of 5
    renderWithProviders(
      <MediaUploader
        versionId="ver-100"
        config={mockConfig}
        currentAssetCount={5}
        onUploadSuccess={onUploadSuccess}
      />
    );

    const dropZone = screen.getByLabelText(/Upload files/i);
    expect(dropZone).toHaveClass('cursor-not-allowed');
    expect(screen.getByText(/Asset limit reached \(5 items\)/i)).toBeInTheDocument();

    const input = document.getElementById('media-file-input') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('drop zone supports keyboard activation with Enter and Space', () => {
    renderWithProviders(
      <MediaUploader
        versionId="ver-100"
        config={mockConfig}
        currentAssetCount={0}
        onUploadSuccess={vi.fn()}
      />
    );

    const input = document.getElementById('media-file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const dropZone = screen.getByLabelText(/Upload files/i);

    fireEvent.keyDown(dropZone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(dropZone, { key: ' ' });
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});

describe('T2.4: AudioRecorder & useMediaRecorder', () => {
  let mockTracks: any[];
  let mockStream: any;
  let mockRecorderInstance: any;

  beforeEach(() => {
    // Mock Secure Context
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    // Mock MediaStream tracks
    mockTracks = [
      { stop: vi.fn(), kind: 'audio', enabled: true },
    ];
    mockStream = {
      getTracks: vi.fn(() => mockTracks),
      getAudioTracks: vi.fn(() => mockTracks),
    };

    // Mock navigator.mediaDevices.getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
      },
      configurable: true,
    });

    // Mock MediaRecorder
    mockRecorderInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      state: 'inactive',
      mimeType: 'audio/webm;codecs=opus',
      ondataavailable: null as any,
      onstop: null as any,
    };

    const MockMediaRecorder = vi.fn(() => mockRecorderInstance) as any;
    MockMediaRecorder.isTypeSupported = vi.fn((type: string) => type.includes('webm'));
    Object.defineProperty(window, 'MediaRecorder', {
      value: MockMediaRecorder,
      configurable: true,
    });

    // Mock URL object URLs
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost:3000/mock-recording-url');
    window.URL.revokeObjectURL = vi.fn();

    // Advance time on every Date.now call so recording duration > 0
    let fakeTime = 1000000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      fakeTime += 1000;
      return fakeTime;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders unsupported message when not in secure context', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });

    renderWithProviders(
      <AudioRecorder
        versionId="ver-100"
        config={mockConfig}
        onUploadFile={vi.fn()}
      />
    );

    expect(screen.getByText(/Audio recording unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Recording needs a secure \(HTTPS\) connection/i)).toBeInTheDocument();
  });

  it('renders unsupported message when MediaRecorder is missing in browser', () => {
    Object.defineProperty(window, 'MediaRecorder', { value: undefined, configurable: true });

    renderWithProviders(
      <AudioRecorder
        versionId="ver-100"
        config={mockConfig}
        onUploadFile={vi.fn()}
      />
    );

    expect(screen.getByText(/Your browser does not support audio recording/i)).toBeInTheDocument();
  });

  it('handles microphone permission denied gracefully with actionable message', async () => {
    const notAllowedError = new Error('Permission denied');
    notAllowedError.name = 'NotAllowedError';
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(notAllowedError);

    renderWithProviders(
      <AudioRecorder
        versionId="ver-100"
        config={mockConfig}
        onUploadFile={vi.fn()}
      />
    );

    const startBtn = screen.getByRole('button', { name: /Start Recording/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText(/Microphone access was denied/i)).toBeInTheDocument();
    });
  });

  it('records audio, transitions to stopped preview, releases mic tracks, and uploads only on explicit action', async () => {
    const onUploaded = vi.fn();
    const onUploadFile = vi.fn(() => Promise.resolve(mockAssets[0]));

    renderWithProviders(
      <AudioRecorder
        versionId="ver-100"
        config={mockConfig}
        onUploaded={onUploaded}
        onUploadFile={onUploadFile}
      />
    );

    // 1. Start recording
    const startBtn = screen.getByRole('button', { name: /Start Recording/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => {
      expect(mockRecorderInstance.start).toHaveBeenCalledWith(1000);
      expect(screen.getByText(/Recording live…/i)).toBeInTheDocument();
    });

    // 2. Pause and Resume
    const pauseBtn = screen.getByRole('button', { name: /Pause/i });
    act(() => {
      mockRecorderInstance.state = 'recording';
      fireEvent.click(pauseBtn);
    });
    expect(mockRecorderInstance.pause).toHaveBeenCalled();
    expect(screen.getByText('Paused')).toBeInTheDocument();

    const resumeBtn = screen.getByRole('button', { name: /Resume/i });
    act(() => {
      mockRecorderInstance.state = 'paused';
      fireEvent.click(resumeBtn);
    });
    expect(mockRecorderInstance.resume).toHaveBeenCalled();

    // 3. Stop recording
    const stopBtn = screen.getByRole('button', { name: /Stop recording and review/i });
    act(() => {
      mockRecorderInstance.state = 'recording';
      fireEvent.click(stopBtn);
      // Simulate data available and stop event
      mockRecorderInstance.ondataavailable({
        data: new Blob(['audio-bytes-12345'], { type: 'audio/webm' }),
      });
      mockRecorderInstance.onstop();
    });

    // Mic tracks MUST be stopped immediately on stop
    expect(mockTracks[0].stop).toHaveBeenCalled();

    // Preview player appears
    await waitFor(() => {
      expect(screen.getByText(/Preview Recording/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Use this recording/i })).toBeInTheDocument();
    });

    // Verify NO upload happened yet on stop
    expect(onUploadFile).not.toHaveBeenCalled();

    // 4. Click "Use this recording"
    const useBtn = screen.getByRole('button', { name: /Use this recording/i });
    await act(async () => {
      fireEvent.click(useBtn);
    });

    expect(onUploadFile).toHaveBeenCalledTimes(1);
    const sentFile = (onUploadFile.mock.calls as unknown[][])[0][0] as File;
    expect(sentFile.name).toMatch(/^recording-\d{8}-\d{6}\.webm$/);
    expect(onUploaded).toHaveBeenCalledWith(mockAssets[0]);
  });

  it('discarding preview revokes object URL and returns to idle', async () => {
    renderWithProviders(
      <AudioRecorder
        versionId="ver-100"
        config={mockConfig}
        onUploadFile={vi.fn()}
      />
    );

    // Start
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));
    });

    // Stop
    const stopBtn1 = screen.getByRole('button', { name: /Stop recording and review/i });
    act(() => {
      mockRecorderInstance.state = 'recording';
      fireEvent.click(stopBtn1);
      mockRecorderInstance.ondataavailable({
        data: new Blob(['sample-data'], { type: 'audio/webm' }),
      });
      mockRecorderInstance.onstop();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Discard/i })).toBeInTheDocument();
    });

    // Click discard -> opens confirmation modal
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect(screen.getByText(/Discard this recording\?/i)).toBeInTheDocument();

    // Confirm discard
    const confirmBtn = screen.getByRole('button', { name: /^Discard$/i });
    act(() => {
      fireEvent.click(confirmBtn);
    });

    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/mock-recording-url');
    expect(screen.getByRole('button', { name: /Start Recording/i })).toBeInTheDocument();
  });

  it('preserves preview and allows retry when upload fails', async () => {
    const onUploadFile = vi.fn().mockRejectedValue(new Error('Server storage unavailable'));

    renderWithProviders(
      <AudioRecorder
        versionId="ver-100"
        config={mockConfig}
        onUploadFile={onUploadFile}
      />
    );

    // Start & stop
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));
    });
    const stopBtn2 = screen.getByRole('button', { name: /Stop recording and review/i });
    act(() => {
      mockRecorderInstance.state = 'recording';
      fireEvent.click(stopBtn2);
      mockRecorderInstance.ondataavailable({
        data: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      });
      mockRecorderInstance.onstop();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Use this recording/i })).toBeInTheDocument();
    });

    // Try use recording
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Use this recording/i }));
    });

    // Error shown, preview still intact, and "Use this recording" button still available for retry
    await waitFor(() => {
      expect(screen.getAllByText(/Server storage unavailable/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /Use this recording/i })).toBeInTheDocument();
    });
  });
});

describe('T2.4: MediaItem & MediaList', () => {
  it('renders audio element with metadata preload and correct stream URL', () => {
    renderWithProviders(
      <MediaItem
        asset={mockAssets[0]}
        canEdit={true}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('spindle_sound.webm')).toBeInTheDocument();
    const audio = screen.getByLabelText(/Audio player for spindle_sound.webm/i) as HTMLAudioElement;
    expect(audio.src).toContain('/api/v1/media/asset-1');
    expect(audio.preload).toBe('metadata');
  });

  it('renders video element with metadata preload and correct stream URL', () => {
    renderWithProviders(
      <MediaItem
        asset={mockAssets[1]}
        canEdit={true}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('startup_guide.mp4')).toBeInTheDocument();
    const video = screen.getByLabelText(/Video player for startup_guide.mp4/i) as HTMLVideoElement;
    expect(video.src).toContain('/api/v1/media/asset-2');
    expect(video.preload).toBe('metadata');
  });

  it('renders image element with alt attribute', () => {
    renderWithProviders(
      <MediaItem
        asset={mockAssets[2]}
        canEdit={true}
        onDelete={vi.fn()}
      />
    );

    const img = screen.getByAltText('emergency_stop.png') as HTMLImageElement;
    expect(img.src).toContain('/api/v1/media/asset-3');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders PDF link opening in new tab with rel=noopener noreferrer', () => {
    renderWithProviders(
      <MediaItem
        asset={mockAssets[3]}
        canEdit={true}
        onDelete={vi.fn()}
      />
    );

    const link = screen.getByRole('link', { name: /Open PDF Document/i });
    expect(link).toHaveAttribute('href', 'http://localhost:8000/api/v1/media/asset-4');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows error state with retry if media fails to load', () => {
    renderWithProviders(
      <MediaItem
        asset={mockAssets[0]}
        canEdit={true}
        onDelete={vi.fn()}
      />
    );

    const audio = screen.getByLabelText(/Audio player for spindle_sound.webm/i);
    fireEvent.error(audio);

    expect(screen.getByText(/This file could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('delete button is hidden in read-only mode', () => {
    renderWithProviders(
      <MediaItem
        asset={mockAssets[0]}
        canEdit={false}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/Delete spindle_sound.webm/i)).not.toBeInTheDocument();
  });

  it('shows confirmation dialog before deleting and calls onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <MediaItem
        asset={mockAssets[0]}
        canEdit={true}
        onDelete={onDelete}
      />
    );

    const deleteBtn = screen.getByLabelText(/Delete spindle_sound.webm/i);
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/Delete attachment\?/i)).toBeInTheDocument();
    expect(screen.getAllByText(/spindle_sound\.webm/i).length).toBeGreaterThanOrEqual(2);

    const confirmBtn = screen.getByRole('button', { name: /^Delete$/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(onDelete).toHaveBeenCalledWith('asset-1');
  });

  it('shows revision media note when version_no > 1 and list is empty', () => {
    renderWithProviders(
      <MediaList
        assets={[]}
        isLoading={false}
        isError={false}
        canEdit={true}
        versionNo={2}
        onDelete={vi.fn()}
        onRetryList={vi.fn()}
      />
    );

    expect(screen.getByText(/Media from earlier versions is not copied to new revisions/i)).toBeInTheDocument();
  });
});

describe('T2.4: MediaPanel Integration', () => {
  beforeEach(() => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/media/config') {
        return Promise.resolve(mockConfig);
      }
      if (path.startsWith('/knowledge-versions/ver-100/media')) {
        return Promise.resolve(mockAssets);
      }
      return Promise.reject(new Error(`Unhandled GET ${path}`));
    });
  });

  it('renders media panel with config and asset list', async () => {
    renderWithProviders(
      <MediaPanel
        versionId="ver-100"
        canEdit={true}
        versionNo={1}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('spindle_sound.webm')).toBeInTheDocument();
      expect(screen.getByText('startup_guide.mp4')).toBeInTheDocument();
      expect(screen.getByText('emergency_stop.png')).toBeInTheDocument();
      expect(screen.getByText('safety_checklist.pdf')).toBeInTheDocument();
    });

    expect(screen.getByText(/Files are saved as soon as they upload/i)).toBeInTheDocument();
    expect(screen.getByText(/Browser Audio Recorder/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload files/i)).toBeInTheDocument();
  });

  it('hides recorder and uploader in read-only view', async () => {
    renderWithProviders(
      <MediaPanel
        versionId="ver-100"
        canEdit={false}
        versionNo={1}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('spindle_sound.webm')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Browser Audio Recorder/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Upload files/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Files are saved as soon as they upload/i)).not.toBeInTheDocument();
  });

  it('disables upload and recording when config fails to load', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/media/config') {
        return Promise.reject(new Error('Config endpoint down'));
      }
      if (path.startsWith('/knowledge-versions/ver-100/media')) {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error('Unhandled'));
    });

    renderWithProviders(
      <MediaPanel
        versionId="ver-100"
        canEdit={true}
        versionNo={1}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load media configuration/i)
      ).toBeInTheDocument();
    });

    // Neither recorder nor uploader should be mounted
    expect(screen.queryByText(/Browser Audio Recorder/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Upload files/i)).not.toBeInTheDocument();
  });
});
