import React, { useState } from 'react';
import { searchVectorKnowledge, VectorSearchResultItem } from './voiceApi';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Search, Database, Volume2, Sparkles, Play } from 'lucide-react';

export const VectorKnowledgeSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<VectorSearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeAudioSrc, setActiveAudioSrc] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    try {
      setIsSearching(true);
      const res = await searchVectorKnowledge(query, 6);
      setResults(res.results || []);
      setHasSearched(true);
    } catch (err) {
      console.error('Vector search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const playAudioSegment = (mediaId?: string, startSeconds?: number) => {
    if (!mediaId) return;
    const url = `/api/v1/voice/stream/${mediaId}`;
    setActiveAudioSrc(url);

    setTimeout(() => {
      const audioEl = document.getElementById('vector-audio-player') as HTMLAudioElement;
      if (audioEl) {
        if (startSeconds !== undefined && startSeconds !== null) {
          audioEl.currentTime = startSeconds;
        }
        audioEl.play();
      }
    }, 100);
  };

  const formatTime = (secs?: number) => {
    if (secs === undefined || secs === null) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-6">
      {/* Title & Architecture Information */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-400" />
              Semantic RAG Vector Search & Expert Voice Engine
            </h4>
            <Badge variant="brand" size="sm">
              Vector DB
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Every expert voice recording is indexed into 384-dimensional dense vector embeddings. Natural language queries retrieve the exact timestamped voice segment for the RAG assistant.
          </p>
        </div>
      </div>

      {/* Hidden Audio Player for Query Playback */}
      {activeAudioSrc && (
        <div className="bg-slate-950 border border-brand-500/30 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-brand-300">
            <Volume2 className="w-4 h-4 text-brand-400 animate-pulse" />
            <span>Playing Referenced Expert Voice Recording</span>
          </div>
          <audio
            id="vector-audio-player"
            src={activeAudioSrc}
            controls
            autoPlay
            className="h-8 w-64"
          />
        </div>
      )}

      {/* Search Input Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything (e.g. 'What is the chuck clamping pressure?' or 'spindle warmup procedure')..."
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="primary" isLoading={isSearching}>
          <Sparkles className="w-4 h-4 mr-1.5" />
          Vector Search
        </Button>
      </form>

      {/* Quick Example Query Pills */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>Suggested Queries:</span>
        <button
          type="button"
          onClick={() => {
            setQuery('What hydraulic chuck pressure is required?');
          }}
          className="bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1 rounded-full text-slate-300 border border-slate-700 transition"
        >
          "chuck clamping pressure"
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery('Which tool insert and torque setting?');
          }}
          className="bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1 rounded-full text-slate-300 border border-slate-700 transition"
        >
          "tool insert & torque"
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery('Blast shield door and coolant safety rules');
          }}
          className="bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1 rounded-full text-slate-300 border border-slate-700 transition"
        >
          "blast shield & coolant warning"
        </button>
      </div>

      {/* Search Results */}
      {hasSearched && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Retrieved Knowledge Chunks ({results.length})</span>
            <span>Ranked by Cosine Similarity</span>
          </div>

          {results.length === 0 ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400">
              No matching expert knowledge found in vector store.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.map((res) => {
                const matchPercent = Math.round(res.similarity_score * 100);

                return (
                  <div
                    key={res.id}
                    className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={matchPercent > 70 ? 'brand' : 'neutral'}
                          size="sm"
                        >
                          {matchPercent}% Similarity Match
                        </Badge>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {res.source_type}
                        </span>
                      </div>

                      {res.start_s !== undefined && res.start_s !== null && (
                        <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                          {formatTime(res.start_s)} - {formatTime(res.end_s)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed italic bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                      "{res.chunk_text}"
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {res.media_title || 'Expert Narration'}
                      </span>

                      {res.media_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => playAudioSegment(res.media_id, res.start_s)}
                          className="text-[11px] h-7 px-2"
                        >
                          <Play className="w-3 h-3 mr-1 text-brand-400" />
                          Listen Snippet
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
