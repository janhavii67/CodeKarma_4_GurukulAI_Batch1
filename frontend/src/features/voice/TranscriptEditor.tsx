import React, { useState, useRef } from 'react';
import { Transcript, TranscriptSegment, patchSegment } from './voiceApi';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Play, Pause, Edit2, Check, AlertCircle, Volume2 } from 'lucide-react';

interface TranscriptEditorProps {
  transcript: Transcript;
  mediaId: string;
  onSegmentUpdated?: (updatedSeg: TranscriptSegment) => void;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  transcript,
  mediaId,
  onSegmentUpdated,
}) => {
  const [segments, setSegments] = useState<TranscriptSegment[]>(transcript.segments || []);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (startSeconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startSeconds;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const startEditing = (seg: TranscriptSegment) => {
    setEditingSegmentId(seg.id);
    setEditText(seg.edited_text !== null && seg.edited_text !== undefined ? seg.edited_text : seg.original_text);
  };

  const saveSegmentEdit = async (seg: TranscriptSegment) => {
    try {
      const updated = await patchSegment(transcript.id, seg.id, editText, seg.needs_review);
      setSegments((prev) => prev.map((s) => (s.id === seg.id ? updated : s)));
      setEditingSegmentId(null);
      if (onSegmentUpdated) onSegmentUpdated(updated);
    } catch (err) {
      console.error('Failed to update segment:', err);
    }
  };

  const toggleNeedsReview = async (seg: TranscriptSegment) => {
    try {
      const updated = await patchSegment(transcript.id, seg.id, seg.edited_text, !seg.needs_review);
      setSegments((prev) => prev.map((s) => (s.id === seg.id ? updated : s)));
      if (onSegmentUpdated) onSegmentUpdated(updated);
    } catch (err) {
      console.error('Failed to toggle review flag:', err);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      {/* Audio Player Toolbar */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            size="sm"
            variant="primary"
            onClick={togglePlay}
            className="w-10 h-10 rounded-full p-0 flex items-center justify-center shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </Button>
          <div>
            <span className="text-xs font-semibold text-slate-200 block">Narration Audio Sync</span>
            <span className="text-[11px] font-mono text-slate-400">
              Current: {formatTime(currentTime)} • Click any segment to seek
            </span>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={`/api/v1/voice/stream/${mediaId}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          className="w-full md:w-64 h-8"
          controls
        />
      </div>

      {/* Segments List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
          <span>Timestamped Speech Segments ({segments.length})</span>
          <span>Audio preserved in secure media storage</span>
        </div>

        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {segments.map((seg) => {
            const isActive = currentTime >= seg.start_s && currentTime <= seg.end_s;
            const isEditing = editingSegmentId === seg.id;

            return (
              <div
                key={seg.id}
                className={`p-3.5 rounded-lg border transition-all text-xs ${
                  isActive
                    ? 'bg-brand-500/10 border-brand-500/40 shadow-sm'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => handleSeek(seg.start_s)}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-brand-400 hover:text-brand-300 font-semibold"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>
                      {formatTime(seg.start_s)} – {formatTime(seg.end_s)}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    {seg.needs_review && (
                      <Badge variant="warning" size="sm">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Needs Review
                      </Badge>
                    )}
                    {seg.edited_text && (
                      <span className="text-[10px] text-cyan-400 font-mono">Edited</span>
                    )}
                    <button
                      onClick={() => toggleNeedsReview(seg)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                    >
                      {seg.needs_review ? 'Clear Flag' : 'Flag for Review'}
                    </button>
                    {!isEditing && (
                      <button
                        onClick={() => startEditing(seg)}
                        className="text-slate-400 hover:text-slate-200 p-1 rounded"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2 mt-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingSegmentId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => saveSegmentEdit(seg)}>
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Save Edit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-200 leading-relaxed">
                      {seg.edited_text ? seg.edited_text : seg.original_text}
                    </p>
                    {seg.edited_text && (
                      <p className="text-[10px] text-slate-400 mt-1.5 italic">
                        Original: "{seg.original_text}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
