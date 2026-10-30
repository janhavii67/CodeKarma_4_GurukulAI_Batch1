import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ClipboardList, Clock3, HelpCircle, Loader2, RotateCcw, Route, ShieldAlert, Siren, Workflow,
} from 'lucide-react';
import type { WalkReport } from '../types';

interface ResultReportProps {
  report: WalkReport;
  status: string;
  reducedMotion: boolean;
  escalated?: boolean;
  onRestart?: () => void;
  onChangeAnswer?: (index: number) => void;
  onEscalate?: (reason: string) => Promise<void>;
  onStartWorkflow?: (workflowId: string) => void;
  workflowBusy?: boolean;
}

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

const Card: React.FC<{ icon: React.ElementType; title: string; tone?: string; children: React.ReactNode }> = ({ icon: Icon, title, tone = 'text-slate-500', children }) => (
  <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-slate-700"><Icon className={`h-4 w-4 ${tone}`} />{title}</h3>
    <div className="mt-3">{children}</div>
  </section>
);

/** Final troubleshooting report. Observations are what the trainee reported; causes stay "possible". */
export const ResultReport: React.FC<ResultReportProps> = ({
  report, status, reducedMotion, escalated, onRestart, onChangeAnswer, onEscalate, onStartWorkflow, workflowBusy,
}) => {
  const [escalating, setEscalating] = useState(false);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duration = formatDuration(report.duration_seconds);

  const sendEscalation = async () => {
    if (!onEscalate || reason.trim().length < 3) return;
    setSending(true);
    setError(null);
    try {
      await onEscalate(reason.trim());
      setEscalating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not contact an expert.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <motion.header
        initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-xl shadow-emerald-900/20 sm:p-8">
        <motion.span initial={reducedMotion ? false : { scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 16 }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          <CheckCircle2 className="h-8 w-8" />
        </motion.span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">{status === 'escalated' ? 'Sent to an expert' : 'Troubleshooting completed'}</p>
        <h2 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{report.result_title}</h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-emerald-50">
          {report.machine_name && <span>Machine: <strong>{report.machine_name}</strong></span>}
          <span>Problem: <strong>{report.problem}</strong></span>
          {duration && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{duration}</span>}
        </div>
        {report.summary && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{report.summary}</p>}
      </motion.header>

      <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        This result follows an expert-approved decision path. Possible causes are not a confirmed diagnosis — confirm with an authorised expert before repairs.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={ClipboardList} title="What you observed" tone="text-blue-600">
          {report.observations.length ? (
            <ul className="space-y-2">
              {report.observations.map((item, index) => (
                <li key={index} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3.5 py-2.5 text-sm">
                  <span className="text-slate-600">{item.question}</span>
                  <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white">{item.answer}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No questions were answered on this path.</p>}
          <p className="mt-2 text-xs text-slate-400">Confirmed by you during this session.</p>
        </Card>

        <Card icon={HelpCircle} title="Possible causes" tone="text-amber-600">
          {report.possible_causes.length ? (
            <ul className="space-y-1.5 text-sm text-slate-700">{report.possible_causes.map((cause) => <li key={cause} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{cause}</li>)}</ul>
          ) : <p className="text-sm text-slate-500">The expert did not list specific causes for this result.</p>}
          <p className="mt-2 text-xs text-slate-400">Supported by the approved decision path — not confirmed.</p>
        </Card>
      </div>

      {report.recommended_actions.length > 0 && (
        <Card icon={ArrowRight} title="Recommended next actions" tone="text-emerald-600">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{report.recommended_actions.map((action) => <li key={action}>{action}</li>)}</ol>
        </Card>
      )}

      {report.safety.length > 0 && (
        <Card icon={ShieldAlert} title="Safety instructions" tone="text-rose-600">
          <ul className="space-y-1.5 text-sm text-rose-900">{report.safety.map((item) => <li key={item} className="flex gap-2"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />{item}</li>)}</ul>
        </Card>
      )}

      {report.workflow && (
        <section className="flex flex-wrap items-center gap-4 rounded-3xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-white p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700"><Workflow className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-700">Related Guided Workflow</p>
            <p className="font-semibold text-slate-900">{report.workflow.title}</p>
          </div>
          {report.workflow.available && onStartWorkflow
            ? <button type="button" disabled={workflowBusy} onClick={() => onStartWorkflow(report.workflow!.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">
                {workflowBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Start guided workflow
              </button>
            : !report.workflow.available && <p className="text-xs text-slate-500">Not currently published.</p>}
        </section>
      )}

      {report.references.length > 0 && (
        <Card icon={BookOpen} title="Supporting knowledge" tone="text-indigo-600">
          <ul className="space-y-1.5 text-sm">
            {report.references.map((ref) => (
              <li key={`${ref.type}-${ref.title}`}>
                {ref.item_id ? <Link to={`/app/knowledge/${ref.item_id}`} className="font-semibold text-blue-700 hover:underline">{ref.title}</Link> : <span className="text-slate-700">{ref.title}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card icon={Route} title="Your decision path" tone="text-slate-500">
        <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
          {report.decision_path.map((step, index) => (
            <li key={index} className="relative text-sm">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-400" />
              <span className="text-slate-600">{step.step}</span>
              {step.type === 'question' && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{step.answer}</span>}
              {onChangeAnswer && step.type === 'question' && (
                <button type="button" onClick={() => onChangeAnswer(index)} className="ml-2 text-xs font-semibold text-blue-600 hover:underline">Change</button>
              )}
            </li>
          ))}
          <li className="relative text-sm font-semibold text-emerald-700">
            <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />{report.result_title}
          </li>
        </ol>
      </Card>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        {escalated ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />An expert has been asked to review this session.</p>
        ) : escalating ? (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-800" htmlFor="escalation-reason">What should the expert know?</label>
            <textarea id="escalation-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The vibration got worse after the inspection"
              className="w-full rounded-2xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={sending || reason.trim().length < 3} onClick={() => void sendEscalation()} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}Send to expert
              </button>
              <button type="button" onClick={() => setEscalating(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {onEscalate && (
              <button type="button" onClick={() => setEscalating(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100">
                <Siren className="h-4 w-4" />Contact expert / escalate
              </button>
            )}
            {onRestart && (
              <button type="button" onClick={onRestart} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <RotateCcw className="h-4 w-4" />Restart troubleshooting
              </button>
            )}
          </div>
        )}
        {report.escalation && !escalated && <p className="mt-3 text-sm text-slate-600"><strong>When to escalate:</strong> {report.escalation}</p>}
      </section>
    </div>
  );
};
