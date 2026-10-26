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
    <div className="bg-white border border-[#DCE6F0] rounded-2xl p-5 shadow-xs space-y-6">
      {/* Title & Architecture Information */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-[#E8EEF5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-[#17324D] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#1976D2]" />
              Semantic RAG Vector Search &amp; Expert Voice Engine
            </h4>
            <Badge variant="brand" size="sm">
              Vector DB
            </Badge>
          </div>
          <p className="text-xs text-[#5D7188] mt-1">
            Every expert voice recording is indexed into 384-dimensional dense vector embeddings. Natural language queries retrieve the exact timestamped voice segment for the RAG assistant.
          </p>
        </div>
      </div>

      {/* Audio Player for Query Playback */}
      {activeAudioSrc && (
        <div className="bg-[#EAF3FF] border border-[#BCD7F5] rounded-xl p-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 text-xs text-[#124A78] font-semibold">
            <Volume2 className="w-4 h-4 text-[#1976D2] animate-pulse" />
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
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#7C8DA1]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything (e.g. 'What is the centrifuge rotor speed?' or 'daily calibration procedure')..."
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="primary" isLoading={isSearching}>
          <Sparkles className="w-4 h-4 mr-1.5" />
          Vector Search
        </Button>
      </form>

      {/* Quick Example Query Pills */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5D7188]">
        <span className="font-semibold text-[#17324D]">Suggested Queries:</span>
        <button
          type="button"
          onClick={() => {
            setQuery('What centrifuge calibration schedule is required?');
          }}
          className="bg-[#F3F8FE] hover:bg-[#EAF3FF] px-2.5 py-1 rounded-full text-[#17324D] border border-[#DCE6F0] transition font-medium"
        >
          "rotor calibration schedule"
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery('Which diagnostic reagent and temperature setting?');
          }}
          className="bg-[#F3F8FE] hover:bg-[#EAF3FF] px-2.5 py-1 rounded-full text-[#17324D] border border-[#DCE6F0] transition font-medium"
        >
          "reagent &amp; temperature"
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery('Biohazard decontamination and safety rules');
          }}
          className="bg-[#F3F8FE] hover:bg-[#EAF3FF] px-2.5 py-1 rounded-full text-[#17324D] border border-[#DCE6F0] transition font-medium"
        >
          "biohazard &amp; safety warning"
        </button>
      </div>

      {/* Search Results */}
      {hasSearched && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs text-[#5D7188] font-medium">
            <span>Retrieved Knowledge Chunks ({results.length})</span>
            <span>Ranked by Cosine Similarity</span>
          </div>

          {results.length === 0 ? (
            <div className="bg-[#F3F8FE] border border-[#DCE6F0] rounded-2xl p-8 text-center text-xs text-[#5D7188]">
              No matching expert knowledge found in vector store.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.map((res) => {
                const matchPercent = Math.round(res.similarity_score * 100);

                return (
                  <div
                    key={res.id}
                    className="bg-[#F3F8FE] border border-[#DCE6F0] hover:bg-white hover:border-[#1976D2]/50 rounded-xl p-4 space-y-3 transition-all shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={matchPercent > 70 ? 'brand' : 'neutral'}
                          size="sm"
                        >
                          {matchPercent}% Similarity Match
                        </Badge>
                        <span className="text-[10px] text-[#5D7188] font-mono">
                          {res.source_type}
                        </span>
                      </div>

                      {res.start_s !== undefined && res.start_s !== null && (
                        <span className="text-[11px] font-mono text-[#1976D2] bg-[#EAF3FF] px-2 py-0.5 rounded border border-[#BCD7F5]">
                          {formatTime(res.start_s)} - {formatTime(res.end_s)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#17324D] leading-relaxed italic bg-white p-2.5 rounded-lg border border-[#E8EEF5]">
                      "{res.chunk_text}"
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-[#5D7188] font-medium truncate max-w-[200px]">
                        {res.media_title || 'Expert Narration'}
                      </span>

                      {res.media_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => playAudioSegment(res.media_id, res.start_s)}
                          className="text-[11px] h-7 px-2"
                        >
                          <Play className="w-3 h-3 mr-1 text-[#1976D2]" />
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
