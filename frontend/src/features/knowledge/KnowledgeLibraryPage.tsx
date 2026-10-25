import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api/client';
import {
  FileText,
  Search,
  PlusCircle,
  AlertTriangle,
  CheckCircle,
  Eye,
  Send,
  X,
} from 'lucide-react';

interface KnowledgeItem {
  id: string;
  title: string;
  machine_id?: string;
  machine_name?: string;
  category: string;
  tags?: string;
  status: string;
  current_version: number;
  author_name: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeDetail extends KnowledgeItem {
  current_revision?: {
    version: number;
    title: string;
    content: string;
    operating_conditions?: string;
    prerequisites?: string;
    safety_warnings?: string;
    common_mistakes?: string;
    corrective_actions?: string;
    changelog?: string;
  };
}

export const KnowledgeLibraryPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('knowledge.create');

  const [articles, setArticles] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeDetail | null>(null);
  const [showAuthorModal, setShowAuthorModal] = useState(false);

  // Authoring Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('OPERATING_PROCEDURE');
  const [newContent, setNewContent] = useState('');
  const [newOperatingConditions, setNewOperatingConditions] = useState('');
  const [newSafetyWarnings, setNewSafetyWarnings] = useState('');
  const [newCorrectiveActions, setNewCorrectiveActions] = useState('');
  const [authoringError, setAuthoringError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchArticles = (q = '') => {
    setLoading(true);
    const url = q ? `/knowledge?q=${encodeURIComponent(q)}` : '/knowledge';
    api
      .get<{ items: KnowledgeItem[] }>(url)
      .then((data) => {
        setArticles(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArticles(search);
  };

  const handleOpenDetail = (id: string) => {
    api
      .get<KnowledgeDetail>(`/knowledge/${id}`)
      .then((data) => {
        setSelectedArticle(data);
      })
      .catch(() => {});
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthoringError(null);
    if (!newTitle.trim() || !newContent.trim()) {
      setAuthoringError('Title and core procedural instructions are required.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.post<KnowledgeDetail>('/knowledge', {
        title: newTitle,
        category: newCategory,
        content: newContent,
        operating_conditions: newOperatingConditions || undefined,
        safety_warnings: newSafetyWarnings || undefined,
        corrective_actions: newCorrectiveActions || undefined,
      });

      // Submit for review immediately if user wishes
      await api.post(`/knowledge/${created.id}/submit`, {});

      setShowAuthorModal(false);
      setNewTitle('');
      setNewContent('');
      setNewOperatingConditions('');
      setNewSafetyWarnings('');
      setNewCorrectiveActions('');
      fetchArticles();
    } catch (err: any) {
      setAuthoringError(err?.message || 'Failed to submit knowledge article draft.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-100">Knowledge Library & SOPs</h1>
            <Badge variant="brand" size="sm">
              Module 01 / 02
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Searchable standard operating procedures, thermal protocols, and troubleshooting guides.
          </p>
        </div>

        {canCreate && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAuthorModal(true)}
            icon={<PlusCircle className="w-4 h-4" />}
          >
            Author Knowledge Draft
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <Input
            id="knowledge-search"
            type="text"
            placeholder="Search procedures by machine, defect, thermal drift, spindle, cavitation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button variant="secondary" type="submit" icon={<Search className="w-4 h-4" />}>
            Search
          </Button>
        </form>
      </Card>

      {/* Articles Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Searching knowledge repository...</div>
      ) : articles.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-xs text-slate-400">
            No knowledge articles matched your search.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((art) => (
            <Card key={art.id} className="flex flex-col justify-between hover:border-slate-700 transition-colors">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      art.status === 'APPROVED'
                        ? 'success'
                        : art.status === 'PENDING_REVIEW'
                        ? 'warning'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {art.status}
                  </Badge>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {art.category}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-slate-100 line-clamp-2">{art.title}</h3>

                <div className="text-xs text-slate-400 space-y-1">
                  <div className="text-[11px] text-slate-300">
                    Machine:{' '}
                    <span className="font-medium text-slate-200">
                      {art.machine_name || 'All Compatible'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Author: <span className="text-slate-300">{art.author_name}</span> (v
                    {art.current_version})
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(art.updated_at).toLocaleDateString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDetail(art.id)}
                  icon={<Eye className="w-3.5 h-3.5" />}
                >
                  Read SOP
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Article Detail Inspection Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="success" size="sm">
                    {selectedArticle.status}
                  </Badge>
                  <span className="text-xs font-mono text-slate-400">v{selectedArticle.current_version}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-100">{selectedArticle.title}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Machine: {selectedArticle.machine_name || 'General Equipment'} · Author:{' '}
                  {selectedArticle.author_name}
                </p>
              </div>

              <button
                onClick={() => setSelectedArticle(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedArticle.current_revision && (
              <div className="space-y-4 text-xs">
                {/* Operating Conditions Banner */}
                {selectedArticle.current_revision.operating_conditions && (
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                    <span className="font-semibold text-slate-300 block mb-1">Operating Parameters:</span>
                    <p className="text-slate-300">{selectedArticle.current_revision.operating_conditions}</p>
                  </div>
                )}

                {/* Safety Warnings Banner */}
                {selectedArticle.current_revision.safety_warnings && (
                  <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-600/30 text-amber-200">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-400 mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      Safety Warning & Invariants:
                    </div>
                    <p>{selectedArticle.current_revision.safety_warnings}</p>
                  </div>
                )}

                {/* Main Content */}
                <div>
                  <span className="font-semibold text-slate-300 block mb-1.5">
                    Standard Operating Procedure:
                  </span>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-sans text-slate-200 leading-relaxed whitespace-pre-line text-sm">
                    {selectedArticle.current_revision.content}
                  </div>
                </div>

                {/* Corrective Actions */}
                {selectedArticle.current_revision.corrective_actions && (
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-400 mb-1">
                      <CheckCircle className="w-4 h-4" />
                      Corrective Action & Recovery:
                    </div>
                    <p className="text-slate-300">
                      {selectedArticle.current_revision.corrective_actions}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setSelectedArticle(null)}>
                Close SOP
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Author New Knowledge Article Modal */}
      {showAuthorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-400" />
                  Author Technical Knowledge Draft (Module 01)
                </h2>
                <p className="text-xs text-slate-400">
                  New procedures require peer review by an authorized reviewer prior to publication.
                </p>
              </div>
              <button
                onClick={() => setShowAuthorModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {authoringError && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs">
                {authoringError}
              </div>
            )}

            <form onSubmit={handleCreateArticle} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Procedure Title</label>
                <Input
                  id="new-title"
                  type="text"
                  placeholder="e.g., Ceramic Spindle Runout Zeroing Protocol"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs focus:border-brand-500 outline-none"
                >
                  <option value="OPERATING_PROCEDURE">Operating Procedure (SOP)</option>
                  <option value="MAINTENANCE">Preventive Maintenance</option>
                  <option value="TROUBLESHOOTING">Fault Troubleshooting</option>
                  <option value="SAFETY_PROTOCOL">Safety & Hazardous Checkpoints</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  Detailed Procedural Content
                </label>
                <textarea
                  rows={5}
                  placeholder="Describe step-by-step instructions, indicators, dial readings, and zeroing rules..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 text-xs focus:border-brand-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  Operating Conditions & Tolerances
                </label>
                <Input
                  id="new-conditions"
                  type="text"
                  placeholder="e.g., Ambient temp 20°C, spindle speed 6,000 RPM max, 5.5 bar air"
                  value={newOperatingConditions}
                  onChange={(e) => setNewOperatingConditions(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-amber-300 mb-1 font-medium">
                  Mandatory Safety Warnings & Hazards
                </label>
                <Input
                  id="new-safety"
                  type="text"
                  placeholder="e.g., E-STOP engaged before hand rotation; flying chip hazard"
                  value={newSafetyWarnings}
                  onChange={(e) => setNewSafetyWarnings(e.target.value)}
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowAuthorModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={submitting}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  {submitting ? 'Submitting...' : 'Submit Draft for Peer Review'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
