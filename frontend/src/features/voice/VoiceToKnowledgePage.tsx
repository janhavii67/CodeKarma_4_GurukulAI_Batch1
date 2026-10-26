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
  const [voiceAssets, setVoiceAssets] = useState<MediaAsset[]>([]);

  // Load existing voice assets for the library
  const loadAssets = () => {
    listVoiceAssets()
      .then((data) => setVoiceAssets(data || []))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    loadAssets();
  }, []);

  // Poll active processing job
  const { job: polledJob } = useJobPolling(activeJobId, async (finishedJob) => {
    // When completed or needs_review, fetch transcript and steps
    if (finishedJob.version_id) {
      try {
        const transcriptData = await getVersionTranscript(finishedJob.version_id);
        setCurrentTranscript(transcriptData);
        setActiveTab('review');
      } catch (err) {
        console.error('Failed to load version transcript:', err);
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Module Specs */}
      <div className="bg-white border border-[#DCE6F0] rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#17324D] flex items-center gap-2">
                Voice-to-Knowledge Engine (Module 04)
              </h1>
              <p className="text-xs text-[#5D7188]">
                Transform expert laboratory audio narrations into structured SOP drafts with RAG vector indexing
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
            384-d Vector Store
          </Badge>
        </div>
      </div>

      {/* Industrial Safety Invariant Banner */}
      <div className="bg-[#F3F8FE] border border-[#DCE6F0] rounded-2xl p-4 flex items-start gap-3 text-xs text-[#17324D]">
        <ShieldAlert className="w-5 h-5 text-[#D98B13] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-[#17324D]">
            System Invariants &amp; Governance Rules Active
          </span>
          <p className="text-[#5D7188] leading-relaxed">
            1. Every audio narration is strictly transcribed with timestamped segments.
            2. Unknown equipment parameters and tolerances are explicitly flagged (<code className="text-[#D98B13] font-semibold">needs_review: true</code>) with zero tolerance for hallucinations.
            3. All spoken knowledge is vector-embedded into the knowledge database for grounded RAG query retrieval.
          </p>
        </div>
      </div>

      {/* Active Processing Card if Job is Running */}
      {polledJob && (
        <JobStatusCard
          job={polledJob}
          onRetried={(newJob) => setActiveJobId(newJob.id)}
        />
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E8EEF5] pb-2">
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
          Transcript &amp; Step Review
          {currentTranscript && (
            <span className="ml-1.5 w-2 h-2 rounded-full bg-[#1976D2] inline-block" />
          )}
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'search' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('search')}
        >
          <Database className="w-4 h-4 mr-1.5" />
          Semantic Vector Search (RAG)
        </Button>
      </div>

      {/* Tab 1: Record / Upload */}
      {activeTab === 'record' && (
        <div className="space-y-6">
          <VoiceRecorder
            versionId={activeVersionId || undefined}
            onUploaded={handleUploadComplete}
          />

          {/* Library of existing voice captures */}
          <div className="bg-white border border-[#DCE6F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#17324D] flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-[#1976D2]" />
                Expert Voice Knowledge Recordings ({voiceAssets.length})
              </h4>
              <span className="text-xs text-[#5D7188] font-mono">
                Indexed in Vector Store for RAG
              </span>
            </div>

            {voiceAssets.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#5D7188] bg-[#F3F8FE] rounded-xl border border-[#DCE6F0]">
                No voice narrations recorded yet. Use the microphone above to capture your first expert voice asset.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {voiceAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-[#F3F8FE] border border-[#DCE6F0] hover:bg-white hover:border-[#1976D2]/50 rounded-xl p-4 space-y-3 transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
                          <Volume2 className="w-3.5 h-3.5" />
                        </div>
                        <h5 className="font-bold text-xs text-[#17324D] truncate max-w-[160px]">
                          {asset.title}
                        </h5>
                      </div>
                      <Badge variant="neutral" size="sm">
                        {asset.duration_seconds ? `${Math.round(asset.duration_seconds)}s` : 'audio'}
                      </Badge>
                    </div>

                    <audio
                      src={`/api/v1/voice/stream/${asset.id}`}
                      controls
                      className="w-full h-8 pt-1"
                    />

                    <div className="flex items-center justify-between text-[10px] text-[#5D7188] font-mono pt-1">
                      <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                      <span className="text-[#1976D2] font-semibold">Indexed in RAG</span>
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
          {currentTranscript && activeMediaId ? (
            <>
              <TranscriptEditor
                transcript={currentTranscript}
                mediaId={activeMediaId}
              />
              <StepDraftReview
                initialSteps={currentSteps}
                onStepsUpdated={setCurrentSteps}
              />
            </>
          ) : (
            <div className="bg-white border border-[#DCE6F0] rounded-2xl p-12 text-center space-y-4 shadow-xs">
              <FileText className="w-12 h-12 text-[#7C8DA1] mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-[#17324D]">
                  No active transcript selected
                </h4>
                <p className="text-xs text-[#5D7188] max-w-md mx-auto mt-1">
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
