import React from 'react';
import { Volume2, Video as VideoIcon, ImageIcon, FileText, Mic } from 'lucide-react';
import type { MediaAsset, MediaConfig, MediaKind } from '../media/types';
import type { EditorMode } from './deriveEditorMode';
import { AudioRecorder } from '../media/AudioRecorder';
import { MediaUploader } from '../media/MediaUploader';
import { MediaItem } from '../media/MediaItem';
import { Button } from '../../../components/ui/Button';
import { formatBytes } from '../media/mediaUtils';
import { RotateCcw, AlertCircle } from 'lucide-react';

// ─── Type-to-tab kind mapping ─────────────────────────────────────────────────

/** Maps a MediaTab "kind" prop to the actual MediaKind values that belong to it */
const KIND_MAP: Record<TabKind, MediaKind[]> = {
  audio: ['audio'],
  video: ['video'],
  images: ['image'],
  documents: ['document'],
};

/** The kind prop accepted by MediaTab */
export type TabKind = 'audio' | 'video' | 'images' | 'documents';

const TAB_ICONS: Record<TabKind, React.ReactNode> = {
  audio: <Volume2 className="w-4 h-4 text-emerald-400" />,
  video: <VideoIcon className="w-4 h-4 text-sky-400" />,
  images: <ImageIcon className="w-4 h-4 text-amber-400" />,
  documents: <FileText className="w-4 h-4 text-indigo-400" />,
};

const TAB_LABELS: Record<TabKind, string> = {
  audio: 'audio files',
  video: 'video files',
  images: 'images',
  documents: 'PDF documents',
};

const SMALL_FILE_THRESHOLD = 1024; // 1 KB — matches the ContextPanel threshold

// ─── MediaTab component ────────────────────────────────────────────────────────

export interface MediaTabProps {
  kind: TabKind;
  versionId: string;
  versionNo: number;
  mode: EditorMode;
  config: MediaConfig | undefined;
  isConfigLoading: boolean;
  isConfigError: boolean;
  onRefetchConfig: () => void;
  assets: MediaAsset[];
  isLoadingAssets: boolean;
  isErrorAssets: boolean;
  onRetryAssets: () => void;
  onDelete: (mediaId: string) => Promise<void>;
  deletingId: string | undefined;
  onUploaded?: (media: MediaAsset) => void;
  onUploadFile: (file: File) => Promise<MediaAsset>;
  onUploadSuccess: () => void;
  /** Callback for the "Re-record" action on small audio files */
  onReRecord?: () => void;
  /** Total asset count across all kinds (for per-version cap check) */
  totalAssetCount: number;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  kind,
  versionId,
  versionNo,
  mode,
  config,
  isConfigLoading,
  isConfigError,
  onRefetchConfig,
  assets,
  isLoadingAssets,
  isErrorAssets,
  onRetryAssets,
  onDelete,
  deletingId,
  onUploaded,
  onUploadFile,
  onUploadSuccess,
  onReRecord,
  totalAssetCount,
}) => {
  const isEditable = mode === 'editable';
  const mediaKinds = KIND_MAP[kind];

  // Filter assets to only those belonging to this tab's kind
  const tabAssets = assets.filter((a) => mediaKinds.includes(a.kind as MediaKind));

  // Build kind-filtered config for the uploader
  const kindConfig: MediaConfig | undefined = config
    ? {
        ...config,
        allowed_mime_types: Object.fromEntries(
          Object.entries(config.allowed_mime_types).filter(([key]) =>
            mediaKinds.some((k) => key.startsWith(k))
          )
        ),
      }
    : undefined;

  const panelId = `tabpanel-${kind === 'images' ? 'images' : kind}`;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={`tab-${kind}`}
      className="space-y-4"
    >
      {/* Config error */}
      {isConfigError && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Could not load media configuration. Upload and recording are temporarily unavailable.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefetchConfig}
            className="h-7 text-xs border-rose-500/30 text-rose-300 shrink-0"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Editor controls */}
      {isEditable && !isConfigError && !isConfigLoading && kindConfig && (
        <div className="space-y-4">
          {/* Audio recorder — only on Audio tab */}
          {kind === 'audio' && (
            <div className="rounded-2xl bg-[#111A2E] border border-[#22304D] p-5">
              <AudioRecorder
                versionId={versionId}
                config={kindConfig}
                onUploaded={onUploaded}
                onUploadFile={onUploadFile}
              />
            </div>
          )}

          {/* File uploader — all tabs */}
          <div className="rounded-2xl bg-[#111A2E] border border-[#22304D] p-5">
            <MediaUploader
              versionId={versionId}
              config={kindConfig}
              currentAssetCount={totalAssetCount}
              onUploaded={onUploaded}
              onUploadSuccess={onUploadSuccess}
              isVersionFrozen={!isEditable}
              kindFilter={kind}
            />
          </div>
        </div>
      )}

      {/* Config loading skeleton */}
      {isEditable && isConfigLoading && (
        <div className="rounded-2xl bg-[#111A2E] border border-[#22304D] p-5 animate-pulse">
          <div className="h-20 bg-slate-700/30 rounded-xl" />
        </div>
      )}

      {/* Asset list */}
      <div className="space-y-3">
        {isLoadingAssets ? (
          <div className="space-y-3" aria-label={`Loading ${TAB_LABELS[kind]}`}>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl bg-[#111A2E] border border-[#22304D] p-4 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-700/60" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 bg-slate-700/60 rounded w-1/3" />
                    <div className="h-2.5 bg-slate-700/40 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : isErrorAssets ? (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Could not load {TAB_LABELS[kind]}.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetryAssets}
              className="h-7 text-xs border-rose-500/30 text-rose-300 shrink-0"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        ) : tabAssets.length === 0 ? (
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-500">
              {TAB_ICONS[kind]}
            </div>
            <p className="text-xs font-medium text-slate-400">
              {isEditable
                ? `No ${TAB_LABELS[kind]} attached yet — use the uploader above.`
                : `No ${TAB_LABELS[kind]} attached to this version.`}
            </p>
            {!isEditable && versionNo > 1 && (
              <p className="text-[11px] text-slate-500">
                Media from earlier versions is not copied to new revisions.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3" aria-label={`${TAB_LABELS[kind]} list`}>
            {tabAssets.map((asset) => {
              const isSmall = asset.size_bytes < SMALL_FILE_THRESHOLD;
              return (
                <div key={asset.id} className="space-y-2">
                  <MediaItem
                    asset={asset}
                    canEdit={isEditable}
                    onDelete={onDelete}
                    isDeleting={deletingId === asset.id}
                  />
                  {/* Small-file warning */}
                  {isSmall && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 space-y-2">
                      <p className="flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          This file is only {formatBytes(asset.size_bytes)} and may be empty or corrupted.
                        </span>
                      </p>
                      {isEditable && (
                        <div className="flex items-center gap-2 ml-5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[11px] border-rose-500/30 text-rose-300"
                            onClick={() => onDelete(asset.id)}
                            disabled={deletingId === asset.id}
                          >
                            Remove
                          </Button>
                          {kind === 'audio' && onReRecord && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px] flex items-center gap-1"
                              onClick={onReRecord}
                            >
                              <Mic className="w-3 h-3" />
                              Re-record
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
