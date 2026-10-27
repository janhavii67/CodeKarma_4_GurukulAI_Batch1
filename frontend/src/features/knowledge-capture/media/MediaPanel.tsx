import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Paperclip, AlertCircle, RotateCcw } from 'lucide-react';
import { MediaAsset } from './types';
import { useMediaConfig, useMediaList, useDeleteMedia, useUploadMedia } from './hooks';
import { AudioRecorder } from './AudioRecorder';
import { MediaUploader } from './MediaUploader';
import { MediaList } from './MediaList';
import { Button } from '../../../components/ui/Button';
import { VideoCapture } from './VideoCapture';

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class MediaErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MediaPanel Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="text-sm font-semibold text-rose-800">Media Panel encountered an error</p>
          <p className="text-xs text-[#536780]">
            An unexpected error occurred while rendering the media components.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false })}
            className="text-xs border-rose-200 text-rose-700 bg-white hover:bg-rose-50"
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── MediaPanel Component ─────────────────────────────────────────────────────

export interface MediaPanelProps {
  versionId: string;
  canEdit: boolean;
  versionNo?: number;
  onUploaded?: (media: MediaAsset) => void;
  className?: string;
  captureKind?: string;
}

export const MediaPanel: React.FC<MediaPanelProps> = ({
  versionId,
  canEdit,
  versionNo,
  onUploaded,
  className = '',
  captureKind,
}) => {
  const {
    data: config,
    isLoading: isConfigLoading,
    isError: isConfigError,
    refetch: refetchConfig,
  } = useMediaConfig();

  const {
    data: mediaList,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch: refetchList,
  } = useMediaList(versionId);

  const deleteMutation = useDeleteMedia(versionId);
  const uploadMutation = useUploadMedia(versionId, onUploaded);

  const handleDelete = async (mediaId: string) => {
    await deleteMutation.mutateAsync(mediaId);
  };

  const handleUploadFile = async (file: File): Promise<MediaAsset> => {
    return await uploadMutation.mutateAsync({ file });
  };

  const assets = mediaList || [];

  return (
    <MediaErrorBoundary>
      <div
        className={`rounded-2xl bg-white border border-[#DCE8F5] p-5 space-y-5 shadow-xs ${className}`}
        aria-label="Media Attachments Panel"
      >
        {/* Panel Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE8F5] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center text-[#1473E6]">
              <Paperclip className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#12345A]">Media Attachments</h2>
                {assets.length > 0 && (
                  <span className="text-[11px] font-semibold bg-[#EFF7FF] text-[#1473E6] border border-[#BCD7F5] px-2 py-0.5 rounded-full">
                    {assets.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#536780]">
                Audio, video, images, and PDF documents linked to this procedure version.
              </p>
            </div>
          </div>

          {canEdit && (
            <p className="text-[11px] text-[#536780] italic">
              Files are saved as soon as they upload
            </p>
          )}
        </div>

        {/* Config Error banner (blocks uploader & recorder if config failed to load) */}
        {isConfigError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>Could not load media configuration. Media upload and recording are temporarily disabled.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchConfig()}
              className="h-7 text-xs flex items-center gap-1 border-rose-300 text-rose-700 bg-white"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* Active controls for editable versions (only when config is loaded) */}
        {canEdit && !isConfigError && !isConfigLoading && config && (
          <div className="space-y-4">
            {/* Audio Recorder */}
            {(!captureKind || captureKind === 'audio') && <AudioRecorder
              versionId={versionId}
              config={config}
              onUploaded={onUploaded}
              onUploadFile={handleUploadFile}
            />}

            {captureKind === 'video' && <VideoCapture config={config} onUpload={handleUploadFile} onUploaded={onUploaded} />}

            {/* Media Uploader */}
            <MediaUploader
              versionId={versionId}
              config={config}
              currentAssetCount={assets.length}
              onUploaded={onUploaded}
              onUploadSuccess={() => refetchList()}
              isVersionFrozen={!canEdit}
              kindFilter={captureKind === 'photo' ? 'images' : captureKind === 'video' ? 'video' : undefined}
              captureMode={captureKind === 'photo'}
            />
          </div>
        )}

        {/* Media List & Players */}
        <div className="space-y-3">
          {assets.length > 0 && canEdit && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#536780]">
              Attached Files
            </h3>
          )}

          <MediaList
            assets={assets}
            isLoading={isListLoading || isConfigLoading}
            isError={isListError}
            error={listError}
            canEdit={canEdit}
            versionNo={versionNo}
            onDelete={handleDelete}
            onRetryList={() => refetchList()}
            deletingId={deleteMutation.isPending ? (deleteMutation.variables as string) : undefined}
          />
        </div>
      </div>
    </MediaErrorBoundary>
  );
};
