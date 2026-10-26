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
    <div className="bg-white border border-[#DCE6F0] rounded-2xl p-5 shadow-xs space-y-5">
      {/* Audio Player Toolbar */}
      <div className="bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
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
            <span className="text-xs font-bold text-[#17324D] block">Narration Audio Sync</span>
            <span className="text-[11px] font-mono text-[#5D7188]">
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
        <div className="flex items-center justify-between text-xs text-[#5D7188] border-b border-[#E8EEF5] pb-2 font-medium">
          <span>Timestamped Speech Segments ({segments.length})</span>
          <span>Original audio preserved in database</span>
        </div>

        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {segments.map((seg) => {
            const isActive = currentTime >= seg.start_s && currentTime <= seg.end_s;
            const isEditing = editingSegmentId === seg.id;

            return (
              <div
                key={seg.id}
                className={`p-3.5 rounded-xl border transition-all text-xs ${
                  isActive
                    ? 'bg-[#EAF3FF] border-[#1976D2]/60 shadow-xs'
                    : 'bg-white border-[#DCE6F0] hover:border-[#1976D2]/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => handleSeek(seg.start_s)}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-[#1976D2] hover:text-[#1677F2] font-bold"
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
                      <span className="text-[10px] text-[#1976D2] font-mono font-semibold">Edited</span>
                    )}
                    <button
                      onClick={() => toggleNeedsReview(seg)}
                      className="text-[11px] text-[#5D7188] hover:text-[#17324D] underline"
                    >
                      {seg.needs_review ? 'Clear Flag' : 'Flag for Review'}
                    </button>
                    {!isEditing && (
                      <button
                        onClick={() => startEditing(seg)}
                        className="text-[#5D7188] hover:text-[#17324D] p-1 rounded"
                        aria-label="Edit segment"
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
                      className="w-full bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl p-2 text-xs text-[#17324D] focus:bg-white focus:outline-none focus:border-[#1976D2]"
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
                    <p className="text-[#17324D] leading-relaxed">
                      {seg.edited_text ? seg.edited_text : seg.original_text}
                    </p>
                    {seg.edited_text && (
                      <p className="text-[10px] text-[#7C8DA1] mt-1.5 italic">
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
