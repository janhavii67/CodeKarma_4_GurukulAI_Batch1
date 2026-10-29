import React, { useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Cpu,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Edit3,
  GitBranch,
  Sparkles,
  ExternalLink,
  Wrench,
  Info,
  Calendar,
  AlertOctagon,
  Layers,
  GraduationCap,
  ListChecks,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useKnowledgeDetail, useCreateRevision } from '../knowledge-capture/hooks';
import { StatusBadge } from '../knowledge-capture/StatusBadge';
import { MediaPanel } from '../knowledge-capture/media/MediaPanel';
import { ApiClientError } from '../../lib/api/client';
import type { KnowledgeSourceReference, Step } from '../knowledge-capture/types';

export const KnowledgeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const versionIdParam = searchParams.get('version_id') ?? undefined;

  const { data, isLoading, isError, error } = useKnowledgeDetail(id || '', versionIdParam);

  // Revision Dialog state for authorized experts
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const createRevisionMutation = useCreateRevision(id || '');

  const canCreate = hasPermission('knowledge.create');
  const isAdmin = user?.role_id === 'ADMIN';
  const isExpert = user?.role_id === 'EXPERT' || isAdmin;
  const isTrainee = user?.role_id === 'TRAINEE';
  const isOperator = user?.role_id === 'OPERATOR';

  const handleCreateRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevisionError(null);
    try {
      const newVersion = await createRevisionMutation.mutateAsync({
        revision_reason: revisionReason.trim() || 'New revision created from published version',
      });
      setShowRevisionModal(false);
      navigate(`/app/knowledge/${id}/edit?version_id=${newVersion.id}`);
    } catch (err) {
      setRevisionError(err instanceof ApiClientError ? err.message : 'Failed to create revision.');
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return 'Not recorded';
    return new Date(iso).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pb-20 font-sans" aria-busy="true">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-14 w-3/4 bg-slate-200 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-4">
              <div className="h-40 bg-white rounded-2xl border border-slate-200 animate-pulse" />
              <div className="h-96 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            </div>
            <div className="lg:col-span-4 space-y-4">
              <div className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error State / Not Found
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Knowledge Item Unavailable</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error instanceof ApiClientError ? error.message : 'The requested knowledge item or SOP could not be loaded.'}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link
              to="/app/knowledge"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const v = data.version;
  const isPublished = v.status === 'published';
  const isEditable = !isPublished && (canCreate || isExpert);
  const steps: Step[] = v.steps || [];
  const sourceRefs: KnowledgeSourceReference[] = v.source_refs || [];
  const machine = data.machine;

  // Trainee / Operator Access Guard for Unpublished Knowledge
  if ((isTrainee || isOperator) && !isPublished) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Unpublished Procedure</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            This procedure is currently in <strong>{v.status.replace('_', ' ')}</strong> status and is undergoing technical review. In accordance with safety compliance, it has not yet been approved or published for apprentice or operator execution.
          </p>
          <div className="pt-2 flex justify-center">
            <Link
              to="/app/knowledge"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Knowledge Library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans pb-24">
      {/* ── TOP HEADER / BREADCRUMB STRIP ─────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Link to="/app/knowledge" className="hover:text-teal-700 flex items-center gap-1 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Knowledge Library</span>
            </Link>
            <span className="text-slate-300">/</span>
            {machine && (
              <>
                <Link
                  to={`/app/knowledge/machine/${encodeURIComponent(machine.id)}`}
                  className="hover:text-teal-700 transition-colors truncate max-w-[150px]"
                >
                  {machine.name}
                </Link>
                <span className="text-slate-300">/</span>
              </>
            )}
            <span className="text-slate-900 font-bold truncate max-w-[240px] sm:max-w-md">{data.title}</span>
          </nav>

          {/* Action Controls for Experts / Trainees */}
          <div className="flex items-center gap-2.5">
            {/* Ask AI Tutor */}
            {isPublished && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/app/assistant?q=Explain%20steps%20and%20safety%20precautions%20for%20${encodeURIComponent(
                      data.title
                    )}`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                title="Ask AI Knowledge Assistant about this procedure"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Ask AI Tutor</span>
              </button>
            )}

            {/* Expert Editing Controls (Hidden for Trainees & Operators) */}
            {(canCreate || isAdmin) && (
              <>
                {isEditable ? (
                  <Link
                    to={`/app/knowledge/${id}/edit${versionIdParam ? `?version_id=${versionIdParam}` : ''}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1473E6] hover:bg-[#1060C4] text-white text-xs font-bold shadow-xs transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Draft</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRevisionModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                    <span>New Revision</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT CONTAINER ────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Role Learning Perspective Notice */}
        {isTrainee && (
          <div className="rounded-2xl p-4 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white border border-emerald-200 shadow-2xs flex items-center justify-between gap-3 text-xs text-emerald-950">
            <div className="flex items-center gap-2.5">
              <GraduationCap className="w-5 h-5 text-emerald-700 shrink-0" />
              <span>
                <strong>Apprentice Protocol Study View:</strong> You are studying an official, peer-verified Standard Operating Procedure. Review tooling setup, safety limits, and each sequential step before field operation.
              </span>
            </div>
            <span className="shrink-0 font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px]">
              Verified Training Curriculum
            </span>
          </div>
        )}

        {isOperator && (
          <div className="rounded-2xl p-4 bg-gradient-to-r from-amber-50 via-orange-50/50 to-white border border-amber-200 shadow-2xs flex items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-amber-700 shrink-0" />
              <span>
                <strong>Shopfloor Operational SOP:</strong> Ensure all PPE prerequisites and machine operating tolerances are verified before operating equipment.
              </span>
            </div>
            <span className="shrink-0 font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px]">
              Active SOP Execution
            </span>
          </div>
        )}

        {/* ── HERO DOCUMENT HEADER ────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200 inline-flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-teal-700" />
              Standard Operating Procedure
            </span>
            <StatusBadge status={v.status} />
            <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              v{v.version_no}
            </span>
            {isPublished && (
              <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Verified Baseline
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">
            {data.title}
          </h1>

          {/* Machine & Metadata Strip */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <Cpu className="w-4 h-4 text-teal-600" />
              <span>{machine?.name || 'Unassigned Equipment'}</span>
              {machine?.model_number && (
                <span className="font-mono text-slate-500 font-normal">({machine.model_number})</span>
              )}
            </div>

            {machine?.category && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Category:</span>
                <span className="font-semibold text-slate-800">{machine.category}</span>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Published / Updated: {formatDate(v.published_at || v.updated_at)}</span>
            </div>

            {data.rag_indexed && (
              <div className="flex items-center gap-1 text-teal-800 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 text-[11px]">
                <Sparkles className="w-3 h-3 text-teal-600" />
                <span>Indexed for AI Tutor ({data.rag_chunks_count ?? 1} chunks)</span>
              </div>
            )}
          </div>
        </div>

        {/* ── TWO-COLUMN DOCUMENT LAYOUT ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ════ LEFT: SOP CONTENT DOCUMENT (lg:col-span-8) ════════════════ */}
          <div className="lg:col-span-8 space-y-6">

            {/* 1. OVERVIEW & SCOPE */}
            <section
              id="overview"
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4"
              aria-labelledby="overview-heading"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <FileText className="w-5 h-5 text-teal-600" />
                <h2 id="overview-heading" className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                  1. Overview, Purpose &amp; Scope
                </h2>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-slate-800">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Summary Overview
                  </h3>
                  <p className="font-medium text-slate-900 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
                    {v.summary || 'Not provided in the verified source'}
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Purpose &amp; Operational Context
                  </h3>
                  <p className="text-slate-700">
                    {v.description || 'Not provided in the verified source'}
                  </p>
                </div>

                {v.operating_conditions && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Operating Conditions &amp; Baseline Tolerances
                    </h3>
                    <p className="font-mono text-xs text-slate-800 bg-slate-100/70 p-3 rounded-lg border border-slate-200">
                      {v.operating_conditions}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* 2. PREREQUISITES & REQUIRED TOOLING */}
            <section
              id="prerequisites"
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4"
              aria-labelledby="prerequisites-heading"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Wrench className="w-5 h-5 text-indigo-600" />
                <h2 id="prerequisites-heading" className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                  2. Required Equipment &amp; Prerequisites
                </h2>
              </div>

              {v.prerequisites ? (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                    <ListChecks className="w-4 h-4 text-indigo-700" />
                    <span>Mandatory Inspection &amp; Tooling Setup:</span>
                  </div>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed pl-6">
                    {v.prerequisites}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 rounded-xl bg-slate-50 border border-slate-100">
                  Not provided in the verified source
                </p>
              )}
            </section>

            {/* 3. STEP-BY-STEP PROCEDURE */}
            <section
              id="procedure-steps"
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6"
              aria-labelledby="steps-heading"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-teal-600" />
                  <h2 id="steps-heading" className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                    3. Step-by-Step Procedure
                  </h2>
                </div>
                {steps.length > 0 && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                    {steps.length} Sequenced {steps.length === 1 ? 'Step' : 'Steps'}
                  </span>
                )}
              </div>

              {steps.length > 0 ? (
                <div className="space-y-4" role="list" aria-label="Procedure steps">
                  {steps.map((step, idx) => (
                    <article
                      key={step.order ?? idx}
                      className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-5 space-y-3.5 hover:bg-white hover:border-slate-300 transition-all"
                      role="listitem"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="h-7 w-7 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                            {idx + 1}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">
                            {step.title || `Step ${idx + 1}`}
                          </h3>
                        </div>

                        {step.tools && step.tools.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            {step.tools.map((tool, tIdx) => (
                              <span
                                key={tIdx}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Instruction Text */}
                      <p className="text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-wrap pl-9">
                        {step.instruction}
                      </p>

                      {/* Safety Warning in Step */}
                      {step.safety_warning && (
                        <div className="ml-9 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold text-amber-900">Safety Caution: </strong>
                            <span>{step.safety_warning}</span>
                          </div>
                        </div>
                      )}

                      {/* Expected Result */}
                      {step.expected_result && (
                        <div className="ml-9 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-950 flex items-start gap-2.5 shadow-2xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold text-emerald-900">Expected Result: </strong>
                            <span>{step.expected_result}</span>
                          </div>
                        </div>
                      )}

                      {/* Stop Condition */}
                      {step.stop_condition && (
                        <div className="ml-9 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-950 flex items-start gap-2.5 shadow-2xs">
                          <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold text-rose-900">Abort Condition: </strong>
                            <span>{step.stop_condition}</span>
                          </div>
                        </div>
                      )}

                      {/* Step Note */}
                      {step.note && (
                        <p className="ml-9 text-xs text-slate-500 italic">
                          Note: {step.note}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : v.content ? (
                /* Fallback to original content when structured steps are not stored */
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Displaying original procedural documentation from the verified source record.</span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 font-sans text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {v.content}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 rounded-xl bg-slate-50 border border-slate-100">
                  Not provided in the verified source
                </p>
              )}
            </section>

            {/* 4. SAFETY, PRECAUTIONS & COMMON MISTAKES */}
            <section
              id="safety"
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4"
              aria-labelledby="safety-heading"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 id="safety-heading" className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                  4. Warnings, Precautions &amp; Common Mistakes
                </h2>
              </div>

              <div className="space-y-4">
                {/* Mandatory Safety Warnings */}
                {v.safety_warnings ? (
                  <div className="rounded-xl border border-rose-300 bg-rose-50/90 p-4 space-y-1.5 text-rose-950">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-900">
                      <AlertOctagon className="w-4 h-4 text-rose-600" />
                      Mandatory Safety Precautions
                    </div>
                    <p className="text-sm font-semibold leading-relaxed pl-6">
                      {v.safety_warnings}
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Safety Warnings
                    </h3>
                    <p className="text-xs text-slate-500 italic">Not provided in the verified source</p>
                  </div>
                )}

                {/* Common Mistakes */}
                {v.common_mistakes ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-1 text-amber-950">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                      <Info className="w-4 h-4 text-amber-700" />
                      Common Trainee &amp; Operator Mistakes
                    </div>
                    <p className="text-xs leading-relaxed pl-6 whitespace-pre-wrap">
                      {v.common_mistakes}
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Common Mistakes
                    </h3>
                    <p className="text-xs text-slate-500 italic">Not provided in the verified source</p>
                  </div>
                )}

                {/* Corrective Actions */}
                {v.corrective_actions && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-1 text-emerald-950">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      Approved Corrective Actions &amp; Recovery
                    </div>
                    <p className="text-xs leading-relaxed pl-6 whitespace-pre-wrap">
                      {v.corrective_actions}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* 5. EXPECTED OUTCOME / COMPLETION CHECKLIST */}
            <section
              id="outcome"
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4"
              aria-labelledby="outcome-heading"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h2 id="outcome-heading" className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                  5. Expected Outcome &amp; Completion Criteria
                </h2>
              </div>

              {v.corrective_actions || v.operating_conditions ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2 text-emerald-950">
                  <p className="text-xs font-semibold leading-relaxed">
                    Verify all tolerance parameters, electrical returns, and mounting checks match the baseline specifications outlined in this protocol before returning equipment to clinical operation.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 rounded-xl bg-slate-50 border border-slate-100">
                  Not provided in the verified source
                </p>
              )}
            </section>

            {/* 6. TECHNICAL SOURCE MANUALS & VERIFICATION REFERENCES */}
            <section
              id="source-references"
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4"
              aria-labelledby="sources-heading"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h2 id="sources-heading" className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                  6. Source Manuals, Revision &amp; Verification Status
                </h2>
              </div>

              {sourceRefs.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {sourceRefs.map((ref, idx) => {
                    const isVerified = ref.verification?.status === 'verified';
                    const verifiedDate = ref.verification?.verified_at
                      ? formatDate(ref.verification.verified_at)
                      : null;
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-slate-900 truncate">
                            {ref.source_title || ref.title || 'Technical Manual Reference'}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isVerified
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isVerified ? '✓ Verified Source' : 'Standard'}
                          </span>
                        </div>

                        <div className="space-y-1 text-slate-600">
                          {ref.manual_number && (
                            <div>Manual No: <span className="font-mono text-slate-800">{ref.manual_number}</span></div>
                          )}
                          {ref.revision && (
                            <div>Revision: <span className="font-mono text-slate-800">{ref.revision}</span></div>
                          )}
                          {(ref.pdf_pages || ref.pdf_page) && (
                            <div>PDF Page(s): <span className="font-mono text-slate-800">{Array.isArray(ref.pdf_pages) ? ref.pdf_pages.join(', ') : ref.pdf_page}</span></div>
                          )}
                          {ref.section && (
                            <div>Section: <span className="text-slate-800">{ref.section}</span></div>
                          )}
                        </div>

                        {ref.verification?.verified_by_name && (
                          <div className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-500">
                            Verified by: <strong className="text-slate-700">{ref.verification.verified_by_name}</strong>
                            {verifiedDate && ` on ${verifiedDate}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 rounded-xl bg-slate-50 border border-slate-100">
                  Not provided in the verified source
                </p>
              )}
            </section>

            {/* 7. MEDIA ATTACHMENTS */}
            <section
              id="media"
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4"
              aria-labelledby="media-heading"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <BookOpen className="w-5 h-5 text-teal-600" />
                <h2 id="media-heading" className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                  7. Attached Media &amp; Audio Evidence
                </h2>
              </div>
              <MediaPanel versionId={v.id} canEdit={false} />
            </section>
          </div>

          {/* ════ RIGHT: STICKY TOC & MACHINE SUMMARY (lg:col-span-4) ═══════ */}
          <div className="lg:col-span-4 space-y-6 sticky top-6">
            {/* Table of Contents */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Procedure Navigation
              </h3>
              <nav className="space-y-1 text-xs font-semibold">
                <a
                  href="#overview"
                  className="block px-3 py-2 rounded-lg text-slate-700 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                >
                  1. Overview, Purpose &amp; Scope
                </a>
                <a
                  href="#prerequisites"
                  className="block px-3 py-2 rounded-lg text-slate-700 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                >
                  2. Equipment &amp; Prerequisites
                </a>
                <a
                  href="#procedure-steps"
                  className="block px-3 py-2 rounded-lg text-slate-700 hover:text-teal-700 hover:bg-slate-50 transition-colors flex items-center justify-between"
                >
                  <span>3. Step-by-Step Procedure</span>
                  {steps.length > 0 && (
                    <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.2 rounded text-slate-500">
                      {steps.length}
                    </span>
                  )}
                </a>
                <a
                  href="#safety"
                  className="block px-3 py-2 rounded-lg text-slate-700 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                >
                  4. Warnings &amp; Mistakes
                </a>
                <a
                  href="#outcome"
                  className="block px-3 py-2 rounded-lg text-slate-700 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                >
                  5. Expected Outcome
                </a>
                <a
                  href="#source-references"
                  className="block px-3 py-2 rounded-lg text-slate-700 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                >
                  6. Technical Manuals
                </a>
                <a
                  href="#media"
                  className="block px-3 py-2 rounded-lg text-slate-700 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                >
                  7. Media Attachments
                </a>
              </nav>
            </div>

            {/* Machine Specs Card */}
            {machine && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Associated Machine
                  </h3>
                  <Link
                    to={`/app/knowledge/machine/${encodeURIComponent(machine.id)}`}
                    className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1"
                  >
                    <span>View Archive</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <Cpu className="w-4 h-4 text-teal-600" />
                    <span>{machine.name}</span>
                  </div>
                  <div className="text-slate-600">
                    Model: <strong className="text-slate-800">{machine.model_number || machine.code}</strong>
                  </div>
                  {machine.manufacturer && (
                    <div className="text-slate-600">
                      Manufacturer: <strong className="text-slate-800">{machine.manufacturer}</strong>
                    </div>
                  )}
                  {machine.category && (
                    <div className="text-slate-600">
                      Category: <strong className="text-slate-800">{machine.category}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Assistant Help Callout */}
            <div className="bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-white rounded-2xl border border-teal-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-teal-900 font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-teal-700" />
                AI Knowledge Assistant
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Have questions regarding calibration tolerances or safety checks in this protocol? Consult the AI Tutor for grounded explanations.
              </p>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/app/assistant?q=Explain%20steps%20and%20safety%20precautions%20for%20${encodeURIComponent(
                      data.title
                    )}`
                  )
                }
                className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer text-center"
              >
                Launch AI Tutor Consultation →
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── CREATE REVISION DIALOG MODAL (FOR EXPERTS) ───────────────────── */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create New Procedure Revision</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Create an editable draft revision derived from published <strong>v{v.version_no}</strong>. The published SOP remains live on the shopfloor until the new revision is peer-reviewed.
            </p>

            {revisionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{revisionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRevision} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Revision Reason <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  placeholder="e.g., Updated torque values and added PPE requirement..."
                  rows={3}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRevisionMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {createRevisionMutation.isPending ? 'Creating…' : 'Create Draft Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
