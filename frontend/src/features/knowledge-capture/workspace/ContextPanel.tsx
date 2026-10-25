import React from 'react';
import { Volume2, Video as VideoIcon, ImageIcon, FileText, Loader2, Lock, CheckCircle2, Circle } from 'lucide-react';
import type { MediaAsset } from '../media/types';
import type { KnowledgeVersionSummary } from '../types';
import { StatusBadge } from '../StatusBadge';
import { Button } from '../../../components/ui/Button';
import { formatBytes } from '../media/mediaUtils';
import { computeApprovalChecklist } from './approvalChecklist';
import type { EditorMode } from './deriveEditorMode';
import type { Step } from '../types';
import type { WorkspaceTab } from './RecordHeader';

// ─── Uploads & Processing Card ─────────────────────────────────────────────────

interface UploadsCardProps {
  mediaAssets: MediaAsset[];
  isLoadingMedia: boolean;
  onTabSelect: (tab: WorkspaceTab) => void;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  audio: <Volume2 className="w-3.5 h-3.5 text-emerald-400" />,
  video: <VideoIcon className="w-3.5 h-3.5 text-sky-400" />,
  image: <ImageIcon className="w-3.5 h-3.5 text-amber-400" />,
  document: <FileText className="w-3.5 h-3.5 text-indigo-400" />,
};

const KIND_TO_TAB: Record<string, WorkspaceTab> = {
  audio: 'audio',
  video: 'video',
  image: 'images',
  document: 'documents',
};

const SMALL_FILE_THRESHOLD = 1024; // 1 KB

const UploadsCard: React.FC<UploadsCardProps> = ({
  mediaAssets,
  isLoadingMedia,
  onTabSelect,
}) => (
  <div className="rounded-xl bg-[#111A2E] border border-[#22304D] p-4 space-y-3">
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
      Uploads and Processing
    </h3>

    {isLoadingMedia ? (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Loading…</span>
      </div>
    ) : mediaAssets.length === 0 ? (
      <p className="text-xs text-slate-500 italic">No media attached.</p>
    ) : (
      <div className="space-y-2">
        {mediaAssets.map((asset) => {
          const isSmall = asset.size_bytes < SMALL_FILE_THRESHOLD;
          const tab = KIND_TO_TAB[asset.kind] ?? 'audio';
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => onTabSelect(tab)}
              className="w-full text-left group"
              aria-label={`Go to ${asset.kind} tab — ${asset.original_name}`}
            >
              <div
                className={`rounded-lg px-3 py-2.5 border transition-colors ${
                  isSmall
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-[#22304D] bg-slate-800/40 group-hover:border-slate-600 group-hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    {KIND_ICON[asset.kind] ?? <FileText className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-slate-200 truncate">
                      {asset.original_name}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isSmall ? 'text-amber-400' : 'text-slate-500'}`}>
                      {formatBytes(asset.size_bytes)} · {asset.kind}
                      {isSmall
                        ? ' · ⚠ May be empty or corrupted'
                        : ' · Stored on server'}
                    </p>
                    {isSmall && (
                      <p className="text-[10px] text-amber-300 mt-1">
                        This file is only {formatBytes(asset.size_bytes)} and may be empty or corrupted.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </div>
);

// ─── Versions Panel ────────────────────────────────────────────────────────────

interface VersionsPanelProps {
  versions: KnowledgeVersionSummary[];
  currentVersionId: string;
  publishedVersionId: string | null;
  onViewVersion: (versionId: string) => void;
}

const VersionsPanel: React.FC<VersionsPanelProps> = ({
  versions,
  currentVersionId,
  publishedVersionId,
  onViewVersion,
}) => {
  if (versions.length < 2) return null;

  // Find published and current version details
  const publishedVersion = versions.find((v) => v.id === publishedVersionId);
  const currentVersion = versions.find((v) => v.id === currentVersionId);

  const showLiveNote =
    publishedVersion &&
    currentVersion &&
    publishedVersion.id !== currentVersion.id &&
    publishedVersion.status === 'published' &&
    publishedVersion.version_no < currentVersion.version_no;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="rounded-xl bg-[#111A2E] border border-[#22304D] p-4 space-y-3">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Versions
      </h3>

      {showLiveNote && (
        <p className="text-[11px] text-slate-400 bg-slate-800/40 border border-slate-700/40 rounded-lg p-2">
          Published v{publishedVersion!.version_no} stays live until v
          {currentVersion!.version_no} is approved.
        </p>
      )}

      <div className="space-y-2">
        {[...versions].reverse().map((v) => {
          const isCurrent = v.id === currentVersionId;
          return (
            <div
              key={v.id}
              className={`rounded-lg border px-3 py-2.5 ${
                isCurrent
                  ? 'border-blue-500/30 bg-blue-500/5'
                  : 'border-[#22304D] bg-slate-800/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-slate-200">
                    v{v.version_no}
                  </span>
                  <StatusBadge status={v.status} />
                </div>
                {!isCurrent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewVersion(v.id)}
                    className="text-[11px] h-6 px-2 shrink-0"
                  >
                    View v{v.version_no}
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-slate-400">
                {formatDate(v.created_at)}
                {isCurrent && (
                  <span className="ml-2 text-blue-400 font-medium">
                    You are editing
                  </span>
                )}
              </p>
              {v.revision_reason && (
                <p className="text-[10px] text-slate-500 mt-1 truncate" title={v.revision_reason}>
                  Reason: {v.revision_reason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Approval Checklist ────────────────────────────────────────────────────────

interface ApprovalChecklistProps {
  title: string;
  steps: Step[];
}

const ApprovalChecklistPanel: React.FC<ApprovalChecklistProps> = ({
  title,
  steps,
}) => {
  const rows = computeApprovalChecklist({ title, steps });

  return (
    <div className="rounded-xl bg-[#111A2E] border border-[#22304D] p-4 space-y-3">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Approval Checklist
      </h3>
      {/* Advisory note — code comment intent: this is client-side UX only */}
      <p className="text-[10px] text-slate-500">
        Advisory only — the backend is authoritative.
      </p>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              {row.locked ? (
                <Lock className="w-3.5 h-3.5 text-slate-600" />
              ) : row.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-600" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={`text-xs ${
                  row.locked
                    ? 'text-slate-500'
                    : row.passed
                    ? 'text-slate-300'
                    : 'text-slate-400'
                }`}
              >
                {row.label}
              </p>
              {row.locked && row.lockedExplanation && (
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {row.lockedExplanation}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Context Panel ─────────────────────────────────────────────────────────────

export interface ContextPanelProps {
  mode: EditorMode;
  mediaAssets: MediaAsset[];
  isLoadingMedia: boolean;
  versions: KnowledgeVersionSummary[];
  currentVersionId: string;
  publishedVersionId: string | null;
  title: string;
  steps: Step[];
  onTabSelect: (tab: WorkspaceTab) => void;
  onViewVersion: (versionId: string) => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  mode,
  mediaAssets,
  isLoadingMedia,
  versions,
  currentVersionId,
  publishedVersionId,
  title,
  steps,
  onTabSelect,
  onViewVersion,
}) => {
  const isTrainee = mode === 'trainee';
  const showVersions = !isTrainee && versions.length >= 2;
  const showChecklist = !isTrainee;

  return (
    <aside
      className="w-full xl:w-80 shrink-0 space-y-4"
      aria-label="Context panel"
    >
      <UploadsCard
        mediaAssets={mediaAssets}
        isLoadingMedia={isLoadingMedia}
        onTabSelect={onTabSelect}
      />

      {showVersions && (
        <VersionsPanel
          versions={versions}
          currentVersionId={currentVersionId}
          publishedVersionId={publishedVersionId}
          onViewVersion={onViewVersion}
        />
      )}

      {showChecklist && (
        <ApprovalChecklistPanel title={title} steps={steps} />
      )}
    </aside>
  );
};
