import React, { useState, useEffect } from 'react';
import { VoiceRecorder } from './VoiceRecorder';
import { JobStatusCard } from './JobStatusCard';
import { TranscriptEditor } from './TranscriptEditor';
import { StepDraftReview } from './StepDraftReview';
import { VectorKnowledgeSearch } from './VectorKnowledgeSearch';
import { useJobPolling } from './useJobPolling';
import {
  VoiceUploadResponse,
  Transcript,
  StepDraft,
  getVersionTranscript,
  getMediaTranscript,
  getMediaSteps,
  listVoiceAssets,
  MediaAsset,
} from './voiceApi';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Mic,
  Database,
  FileText,
  Sparkles,
  ShieldAlert,
  ListMusic,
  Volume2,
} from 'lucide-react';

export const VoiceToKnowledgePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'review' | 'search'>('record');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState<Transcript | null>(null);
  const [currentSteps, setCurrentSteps] = useState<StepDraft[]>([]);
  const [stepsMeta, setStepsMeta] = useState<{
    itemId?: string;
    origin?: string;
    flaggedCount?: number;
    canSubmit?: boolean;
    isDemo?: boolean;
    submissionGateStatus?: string;
  }>({});
  const [voiceAssets, setVoiceAssets] = useState<MediaAsset[]>([]);
  const [isLoadingReview, setIsLoadingReview] = useState(false);

  // Load existing voice assets for the library
  const loadAssets = () => {
    listVoiceAssets()
      .then((data) => {
        if (Array.isArray(data)) {
          setVoiceAssets(data);
        } else if (data && Array.isArray((data as any).items)) {
          setVoiceAssets((data as any).items);
        } else {
          setVoiceAssets([]);
        }
      })
      .catch((err) => {
        console.error('Failed to load voice assets:', err);
        setVoiceAssets([]);
      });
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const selectAssetForReview = async (asset: MediaAsset) => {
    setActiveMediaId(asset.id);
    setActiveVersionId(asset.version_id || null);
    setIsLoadingReview(true);
    try {
      const [tData, stepsData] = await Promise.all([
        getMediaTranscript(asset.id).catch(() =>
          asset.version_id ? getVersionTranscript(asset.version_id) : null
        ),
        getMediaSteps(asset.id).catch(() => null),
      ]);
      if (tData) {
        setCurrentTranscript(tData);
      }
      if (stepsData) {
        if (stepsData.steps) {
          setCurrentSteps(stepsData.steps);
        }
        setStepsMeta({
          itemId: stepsData.item_id,
          origin: stepsData.origin,
          flaggedCount: stepsData.flagged_count,
          canSubmit: stepsData.can_submit,
          isDemo: stepsData.is_demo,
          submissionGateStatus: stepsData.submission_gate_status,
        });
      }
      setActiveTab('review');
    } catch (err) {
      console.error('Failed to load asset for review:', err);
    } finally {
      setIsLoadingReview(false);
    }
  };

  // Poll active processing job
  const { job: polledJob } = useJobPolling(activeJobId, async (finishedJob) => {
    const targetMediaId = finishedJob.media_id || activeMediaId;
    if (targetMediaId) {
      try {
        const [tData, stepsData] = await Promise.all([
          getMediaTranscript(targetMediaId).catch(() =>
            finishedJob.version_id ? getVersionTranscript(finishedJob.version_id) : null
          ),
          getMediaSteps(targetMediaId).catch(() => null),
        ]);
        if (tData) setCurrentTranscript(tData);
        if (stepsData) {
          if (stepsData.steps) setCurrentSteps(stepsData.steps);
          setStepsMeta({
            itemId: stepsData.item_id,
            origin: stepsData.origin,
            flaggedCount: stepsData.flagged_count,
            canSubmit: stepsData.can_submit,
            isDemo: stepsData.is_demo,
            submissionGateStatus: stepsData.submission_gate_status,
          });
        }
        setActiveTab('review');
      } catch (err) {
        console.error('Failed to load transcript/steps after job completion:', err);
      }
    }
    loadAssets();
  });

  const handleUploadComplete = (res: VoiceUploadResponse) => {
    setActiveJobId(res.job.id);
    setActiveMediaId(res.media.id);
    setActiveVersionId(res.media.version_id || null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Module Specs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Voice-to-Knowledge Engine (Module 04)
              </h1>
              <p className="text-xs text-slate-400">
                Transform expert shop-floor voice narrations into structured SOP drafts with RAG vector indexing
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="brand" size="sm">
            <Sparkles className="w-3 h-3 mr-1" />
            AI Drafts Only
          </Badge>
          <Badge variant="info" size="sm">
            <Database className="w-3 h-3 mr-1" />
            Vector RAG
          </Badge>
          <Badge variant="warning" size="sm">
            <ShieldAlert className="w-3 h-3 mr-1" />
            Zero-Hallucination Gate
          </Badge>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Button
          size="sm"
          variant={activeTab === 'record' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('record')}
        >
          <Mic className="w-4 h-4 mr-1.5" />
          Record / Upload Narration
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'review' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('review')}
        >
          <FileText className="w-4 h-4 mr-1.5" />
          Review Transcript & Steps
          {currentSteps.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 bg-brand-500/20 text-brand-300 rounded text-[10px]">
              {currentSteps.length}
            </span>
          )}
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'search' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('search')}
        >
          <Database className="w-4 h-4 mr-1.5" />
          Semantic Vector Search
        </Button>
      </div>

      {/* Active Processing Job Card (Polls automatically) */}
      {polledJob && polledJob.status !== 'completed' && polledJob.status !== 'failed' && (
        <JobStatusCard job={polledJob} />
      )}

      {/* Tab 1: Record / Upload */}
      {activeTab === 'record' && (
        <div className="space-y-6">
          <VoiceRecorder
            versionId={activeVersionId || undefined}
            onUploaded={handleUploadComplete}
          />

          {/* Library of existing voice captures */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-brand-400" />
                Expert Voice Knowledge Recordings ({(Array.isArray(voiceAssets) ? voiceAssets.length : 0)})
              </h4>
              <span className="text-xs text-slate-400 font-mono">
                Indexed in Vector Store for RAG
              </span>
            </div>

            {(!Array.isArray(voiceAssets) || voiceAssets.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 rounded-xl border border-slate-800">
                No voice narrations recorded yet. Use the microphone above to capture your first expert voice asset.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(Array.isArray(voiceAssets) ? voiceAssets : []).map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                          <Volume2 className="w-3.5 h-3.5" />
                        </div>
                        <h5 className="font-semibold text-xs text-slate-200 truncate max-w-[160px]">
                          {asset.title}
                        </h5>
                      </div>
                      <Badge variant="neutral" size="sm">
                        {asset.duration_seconds ? `${Math.round(asset.duration_seconds)}s` : 'audio'}
                      </Badge>
                    </div>

                    <audio
                      src={`/api/v1/voice/stream/${asset.id}`}
                      preload="none"
                      controls
                      className="w-full h-8 pt-1"
                    />

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                      <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                      <span className="text-brand-400 font-semibold">Indexed in RAG</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => selectAssetForReview(asset)}
                        className="w-full text-xs"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                        Inspect Transcript & Steps
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Transcript & Candidate Steps Review */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          {isLoadingReview ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-xs text-slate-400">
              Loading transcript and candidate steps...
            </div>
          ) : currentTranscript && activeMediaId ? (
            <>
              <TranscriptEditor
                transcript={currentTranscript}
                mediaId={activeMediaId}
              />
              <StepDraftReview
                mediaId={activeMediaId}
                itemId={stepsMeta.itemId}
                initialSteps={currentSteps}
                origin={stepsMeta.origin}
                initialFlaggedCount={stepsMeta.flaggedCount}
                initialCanSubmit={stepsMeta.canSubmit}
                isDemo={stepsMeta.isDemo}
                submissionGateStatus={stepsMeta.submissionGateStatus}
                onStepsUpdated={setCurrentSteps}
                onSubmitSuccess={() => {
                  loadAssets();
                }}
              />
            </>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4">
              <FileText className="w-12 h-12 text-slate-600 mx-auto" />
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  No active transcript selected
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Record an expert narration or pick a voice recording from the library to inspect timestamped segments and verify candidate procedural steps.
                </p>
              </div>
              <Button size="sm" variant="primary" onClick={() => setActiveTab('record')}>
                Go to Record / Upload
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Semantic Vector Search & RAG */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          <VectorKnowledgeSearch />
        </div>
      )}
    </div>
  );
};
