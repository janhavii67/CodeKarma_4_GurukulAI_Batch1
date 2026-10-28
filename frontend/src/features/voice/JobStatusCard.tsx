import React from 'react';
import { ProcessingJob, retryProcessingJob } from './voiceApi';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { AlertCircle, CheckCircle2, Clock, Loader2, RotateCcw, Sparkles, Database } from 'lucide-react';

interface JobStatusCardProps {
  job: ProcessingJob;
  onRetried?: (newJob: ProcessingJob) => void;
}

export const JobStatusCard: React.FC<JobStatusCardProps> = ({ job, onRetried }) => {
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      const updated = await retryProcessingJob(job.id);
      if (onRetried) onRetried(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRetrying(false);
    }
  };

  const getStatusBadge = () => {
    switch (job.status) {
      case 'queued':
        return <Badge variant="warning">Queued</Badge>;
      case 'processing':
        return <Badge variant="info">Processing Pipeline</Badge>;
      case 'needs_review':
        return <Badge variant="brand">Needs Expert Review</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="neutral">{job.status}</Badge>;
    }
  };

  return (
    <div className="bg-white border border-[#DCE6F0] rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
            {job.status === 'processing' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : job.status === 'failed' ? (
              <AlertCircle className="w-5 h-5 text-[#D94848]" />
            ) : (
              <Sparkles className="w-5 h-5 text-[#1976D2]" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#17324D] flex items-center gap-2">
              Voice Processing &amp; Vector Indexing Pipeline
            </h4>
            <p className="text-xs text-[#5D7188] font-mono">Job ID: {job.id}</p>
          </div>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono text-[#5D7188]">
          <span>Pipeline Progress</span>
          <span className="font-bold text-[#17324D]">{job.progress || 0}%</span>
        </div>
        <div className="w-full bg-[#F3F8FE] border border-[#DCE6F0] rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              job.status === 'failed'
                ? 'bg-[#D94848]'
                : job.status === 'needs_review'
                ? 'bg-[#1976D2]'
                : 'bg-[#1677F2]'
            }`}
            style={{ width: `${Math.max(5, job.progress || 0)}%` }}
          />
        </div>
      </div>

      {/* Pipeline Milestones */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-[#E8EEF5] text-[11px]">
        <div className="flex items-center gap-1.5 text-[#5D7188]">
          <CheckCircle2 className={`w-3.5 h-3.5 ${(job.progress || 0) >= 30 ? 'text-[#15966A]' : 'text-slate-300'}`} />
          <span className="font-medium">16kHz WAV Audio</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#5D7188]">
          <CheckCircle2 className={`w-3.5 h-3.5 ${(job.progress || 0) >= 60 ? 'text-[#15966A]' : 'text-slate-300'}`} />
          <span className="font-medium">Whisper Segments</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#5D7188]">
          <Database className={`w-3.5 h-3.5 ${(job.progress || 0) >= 75 ? 'text-[#1976D2]' : 'text-slate-300'}`} />
          <span className="font-medium">Vector RAG Indexing</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#5D7188]">
          <CheckCircle2 className={`w-3.5 h-3.5 ${(job.progress || 0) >= 90 ? 'text-[#15966A]' : 'text-slate-300'}`} />
          <span className="font-medium">Safety Structuring</span>
        </div>
      </div>

      {/* Error State */}
      {job.status === 'failed' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-[#D94848] flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#D94848] shrink-0" />
            <span>{job.error_safe || 'Transcription failed. The recording is saved; check the transcription service and retry.'}</span>
          </div>
          {job.attempts < 3 && (
            <Button size="sm" variant="outline" onClick={handleRetry} isLoading={isRetrying}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Retry ({job.attempts}/3)
            </Button>
          )}
        </div>
      )}

      {/* Needs Review Guidance */}
      {job.status === 'needs_review' && (
        <div className="bg-[#EAF3FF] border border-[#BCD7F5] rounded-xl p-3 text-xs text-[#124A78] flex items-center gap-2 font-medium">
          <Clock className="w-4 h-4 text-[#1976D2] shrink-0" />
          <span>
            Audio transcribed &amp; vector-indexed. Human expert review is required before publishing or submission.
          </span>
        </div>
      )}
    </div>
  );
};
