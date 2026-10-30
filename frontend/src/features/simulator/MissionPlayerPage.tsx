import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, Bot, Check, ClipboardList, Crosshair, Gauge, Info, Lightbulb, ListChecks, Loader2, LogOut, Pause, Play,
  ScanSearch, Send, ShieldAlert, ShieldCheck, Sparkles, Target, Timer, Workflow, Wrench, XCircle,
} from 'lucide-react';
import { MediaShowcase } from '../workflows/MediaShowcase';
import type { Explanation } from '../decision-trees/types';
import { simulatorApi } from './api';
import { InvestigationMap } from './components/InvestigationMap';
import { MachineSchematic } from './components/MachineSchematic';
import { PerformanceReport } from './components/PerformanceReport';
import { InteractiveTroubleshootingTree } from './components/InteractiveTroubleshootingTree';
import type { Evidence, MissionAttempt, MissionEvent, Reading } from './types';
import { DIFFICULTY, formatClock, surface, zoneLabel } from './ui';

const ReadingView: React.FC<{ reading: Reading }> = ({ reading }) => (
  <div className="mt-2 flex items-end justify-between gap-3 rounded-lg bg-black/30 px-3 py-2">
    <span className="text-[11px] uppercase tracking-wider text-slate-500">{reading.label || 'Reading'}</span>
    <span className="text-right">
      <span className="font-mono text-lg font-bold text-white">{reading.value}<span className="ml-1 text-xs text-slate-400">{reading.unit}</span></span>
      {reading.normal && <span className="block font-mono text-[10.5px] text-slate-500">ref {reading.normal}</span>}
    </span>
  </div>
);

const FEEDBACK_STYLE: Record<string, { title: string; className: string; icon: React.ElementType }> = {
  evidence: { title: 'Clue discovered', className: 'border-amber-400/40 bg-amber-500/10 text-amber-100', icon: ScanSearch },
  unsafe: { title: 'Safety violation — action blocked', className: 'border-rose-500/50 bg-rose-500/15 text-rose-100', icon: ShieldAlert },
  wrong: { title: 'That decision doesn’t fit the evidence', className: 'border-orange-400/40 bg-orange-500/10 text-orange-100', icon: XCircle },
  premature: { title: 'Not yet', className: 'border-sky-400/40 bg-sky-500/10 text-sky-100', icon: Info },
  unnecessary: { title: 'Already checked', className: 'border-white/15 bg-white/[0.04] text-slate-200', icon: Info },
  failed: { title: 'Verification failed', className: 'border-rose-500/50 bg-rose-500/15 text-rose-100', icon: XCircle },
  passed: { title: 'Verification passed', className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100', icon: ShieldCheck },
  correct: { title: 'Good call', className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100', icon: Check },
  acceptable: { title: 'Works, but not the most efficient path', className: 'border-amber-400/30 bg-amber-500/5 text-amber-100', icon: Info },
};

const FeedbackCard: React.FC<{ event: MissionEvent | null; reducedMotion: boolean }> = ({ event, reducedMotion }) => {
  const style = event?.outcome ? FEEDBACK_STYLE[event.outcome] : undefined;
  return (
    <AnimatePresence mode="wait">
      {event && style && (event.feedback || event.clue || event.outcome === 'unsafe') && (
        <motion.div key={event.at} role={event.outcome === 'unsafe' || event.outcome === 'failed' ? 'alert' : 'status'}
          initial={reducedMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0 }}
          className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${style.className}`}>
          <style.icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{style.title}{event.label ? ` · ${event.label}` : ''}</p>
            {event.clue && <p className="mt-0.5">{event.clue}</p>}
            {event.feedback && <p className="mt-0.5 opacity-80">{event.feedback}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/** Live troubleshooting mission over an expert's published tree. */
export const MissionPlayerPage: React.FC = () => {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reducedMotion = Boolean(useReducedMotion());
  const key = ['sim-attempt', attemptId];
  const attemptQuery = useQuery({ queryKey: key, queryFn: () => simulatorApi.attempt(attemptId), enabled: Boolean(attemptId) });
  const attempt = attemptQuery.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [panel, setPanel] = useState<'evidence' | 'readings'>('evidence');
  const [question, setQuestion] = useState('');
  const [explanation, setExplanation] = useState<{ loading: boolean; result?: Explanation; error?: string }>({ loading: false });
  const [replaying, setReplaying] = useState(false);
  const [selectedTreeNode, setSelectedTreeNode] = useState<string | null>(null);
  const lastNode = useRef<string | null>(null);

  useEffect(() => { if (attempt) setElapsed(attempt.elapsed_seconds); }, [attempt?.elapsed_seconds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!attempt || attempt.status !== 'in_progress' || attempt.paused) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [attempt?.status, attempt?.paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const nodeId = attempt ? `${attempt.current?.id}-${attempt.stage}` : null;
    if (nodeId !== lastNode.current) {
      lastNode.current = nodeId;
      setChecked(new Set());
      setSelected([]);
      setZone(null);
      setExplanation({ loading: false });
    }
  }, [attempt]);
  useEffect(() => { setSelectedTreeNode(attempt?.tree?.current_node_id || null); }, [attempt?.tree?.current_node_id, attempt?.stage]);

  const apply = async (action: () => Promise<MissionAttempt>) => {
    setBusy(true);
    setError(null);
    try {
      queryClient.setQueryData(key, await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const zones = useMemo(() => {
    if (!attempt) return [] as string[];
    return Array.from(new Set([
      ...(attempt.mission.zones || []),
      ...attempt.evidence.map((e) => e.zone).filter(Boolean) as string[],
      ...(attempt.current?.actions.map((a) => a.zone).filter(Boolean) as string[] || []),
    ]));
  }, [attempt]);

  if (attemptQuery.isLoading) return <div role="status" className={`flex h-[70vh] flex-col items-center justify-center gap-3 rounded-[28px] ${surface.page}`}><Loader2 className="h-8 w-8 animate-spin text-amber-300" aria-label="Loading troubleshooting tree" /><p className="text-sm font-semibold text-slate-300">Loading your troubleshooting tree…</p></div>;
  if (attemptQuery.isError || !attempt) {
    return (
      <div className={`rounded-[28px] p-12 text-center ${surface.page}`} role="alert">
        <p className="text-base font-semibold text-slate-200">This troubleshooting tree could not be loaded.</p>
        <p className="mt-2 text-sm text-slate-400">{attemptQuery.error instanceof Error ? attemptQuery.error.message : 'Check your connection and try again.'}</p>
        <button type="button" onClick={() => void attemptQuery.refetch()} className={`${surface.ghostButton} mt-4`}>Try again</button>
        <Link to="/app/troubleshooting/interactive" className="mt-4 inline-block text-sm font-semibold text-amber-300">Back to interactive troubleshooting</Link>
      </div>
    );
  }

  if (!Array.isArray(attempt.tree?.nodes) || !Array.isArray(attempt.tree?.edges) || !attempt.score_preview?.breakdown) {
    return (
      <div className={`rounded-[28px] p-12 text-center ${surface.page}`} role="alert">
        <p className="text-base font-semibold text-slate-200">Tree data is unavailable for this attempt.</p>
        <p className="mt-2 text-sm text-slate-400">Reload the troubleshooting tree list and start or resume this attempt again.</p>
        <button type="button" onClick={() => void attemptQuery.refetch()} className={`${surface.ghostButton} mt-4`}>Reload tree data</button>
        <Link to="/app/troubleshooting" className="ml-3 inline-block text-sm font-semibold text-amber-300">Back to troubleshooting trees</Link>
      </div>
    );
  }

  const current = attempt.current;
  const investigating = attempt.stage === 'investigate' && attempt.status === 'in_progress';
  const checks = current?.actions.filter((a) => a.kind === 'check') || [];
  const decisions = current?.actions.filter((a) => a.kind === 'advance') || [];
  const visibleChecks = zone ? checks.filter((a) => a.zone === zone) : checks;
  const activeZones = new Set(checks.filter((a) => !a.done && a.zone).map((a) => a.zone!));
  if (current?.zone && current.has_inspection && !current.inspected) activeZones.add(current.zone);
  const findings = attempt.evidence.reduce<Record<string, number>>((acc, e) => { if (e.zone) acc[e.zone] = (acc[e.zone] || 0) + 1; return acc; }, {});
  const safetyItems = current ? [
    ...(current.safety.warning ? [current.safety.warning] : []),
    ...current.safety.ppe.map((p) => `Wearing: ${p}`),
    ...current.safety.precautions,
    ...current.safety.restricted.map((r) => `I will not: ${r}`),
  ] : [];
  const needsAck = Boolean(current?.needs_ack);
  const allChecked = !needsAck || safetyItems.every((_, i) => checked.has(i));
  const inspectionPending = Boolean(current?.has_inspection && !current.inspected);
  const nodeEvidence = attempt.evidence.filter((e) => e.node_id === current?.id);
  const difficulty = DIFFICULTY[attempt.mission.difficulty] || DIFFICULTY.INTERMEDIATE;

  const takeAction = (edgeId: string) => void apply(() => simulatorApi.act(attemptId, edgeId, needsAck && allChecked));
  const askHint = async (level: 2 | 3) => {
    if (level === 3 && !window.confirm('Expert guidance reveals the approved next action and costs 2 assistance points. Continue?')) return;
    setBusy(true);
    setError(null);
    try {
      const result = await simulatorApi.hint(attemptId, level);
      queryClient.setQueryData(key, result.attempt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hints are unavailable right now.');
    } finally {
      setBusy(false);
    }
  };
  const ask = async (text: string) => {
    if (!text.trim()) return;
    setExplanation({ loading: true });
    try {
      setExplanation({ loading: false, result: await simulatorApi.explain(attemptId, text) });
    } catch (err) {
      setExplanation({ loading: false, error: err instanceof Error ? err.message : 'The AI Tutor is unavailable right now.' });
    }
  };
  const replay = async () => {
    setReplaying(true);
    try {
      const fresh = await simulatorApi.start(attempt.mission.id, true);
      void queryClient.invalidateQueries({ queryKey: ['sim-missions'] });
      navigate(`/app/troubleshooting/interactive/attempts/${fresh.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The mission could not be restarted.');
    } finally {
      setReplaying(false);
    }
  };

  return (
    <div className={`relative min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-[28px] ${surface.page}`}>
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.06] bg-[#13161a] px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] font-bold tracking-[0.16em] text-amber-400">{attempt.mission.machine_name || 'Equipment'} · TREE #{attempt.mission.code}</p>
          <h1 className="truncate text-sm font-bold sm:text-base">{attempt.mission.title}</h1>
        </div>
        <span className={`hidden rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase sm:inline ${difficulty.className}`}>{difficulty.label}</span>
        <div className="flex min-w-[140px] flex-1 items-center gap-2" aria-label={`Mission progress ${attempt.map.progress}%`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" initial={false} animate={{ width: `${attempt.map.progress}%` }} transition={{ duration: reducedMotion ? 0 : 0.6 }} />
          </div>
          <span className="font-mono text-xs text-slate-400">{attempt.map.progress}%</span>
        </div>
        <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-300" title="XP available for a perfect run"><Sparkles className="h-3.5 w-3.5" />{attempt.mission.xp_reward} XP</span>
        <span className="inline-flex items-center gap-1 font-mono text-xs text-white" aria-label={`Current score ${attempt.score_preview.total} out of 100`}><Target className="h-3.5 w-3.5 text-sky-300" />{attempt.score_preview.total}/100</span>
        <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-300" aria-label="Elapsed time"><Timer className="h-3.5 w-3.5" />{formatClock(elapsed)}</span>
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${attempt.safety.status === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
          {attempt.safety.status === 'ok' ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {attempt.safety.status === 'ok' ? 'Safe' : `${attempt.safety.violations} violation${attempt.safety.violations > 1 ? 's' : ''}`}
        </span>
        {attempt.status === 'in_progress' && (
          <div className="flex gap-1">
            <button type="button" disabled={busy} onClick={() => void apply(() => (attempt.paused ? simulatorApi.resume(attemptId) : simulatorApi.pause(attemptId)))}
              aria-label={attempt.paused ? 'Resume mission' : 'Pause mission'} className={`${surface.ghostButton} px-2.5 py-1.5`}>
              {attempt.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <Link to="/app/troubleshooting/interactive" aria-label="Exit mission (progress is saved)" title="Exit — your progress is saved" className={`${surface.ghostButton} px-2.5 py-1.5`}><LogOut className="h-4 w-4" /></Link>
          </div>
        )}
      </header>

      {error && <p role="alert" className="flex items-center gap-2 bg-rose-500/15 px-6 py-2 text-sm text-rose-200"><AlertTriangle className="h-4 w-4" />{error}</p>}

      {attempt.tree && <div className="px-4 pt-4 sm:px-6 sm:pt-6"><InteractiveTroubleshootingTree tree={attempt.tree} selectedNodeId={selectedTreeNode} onSelectNode={(node) => setSelectedTreeNode(node.id)} /></div>}

      {attempt.status === 'completed' && attempt.report ? (
        <div className="p-4 sm:p-6"><PerformanceReport attempt={attempt} reducedMotion={reducedMotion} replaying={replaying} onReplay={() => void replay()} /></div>
      ) : attempt.status === 'abandoned' ? (
        <div className="p-12 text-center">
          <p className="text-sm text-slate-300">This attempt was ended before completion.</p>
          <button type="button" onClick={() => void replay()} className={`${surface.amberButton} mt-4`}>Start a new attempt</button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Main area */}
            <main className="min-w-0 space-y-4">
              <MachineSchematic machineName={attempt.mission.machine_name} cover={attempt.mission.cover_media} zones={zones}
                activeZones={activeZones} findings={findings} currentZone={current?.zone} selectedZone={zone} status={attempt.safety.status}
                reducedMotion={reducedMotion} onSelect={setZone} />

              <FeedbackCard event={attempt.last_event} reducedMotion={reducedMotion} />

              <AnimatePresence mode="wait">
                <motion.section key={`${current?.id}-${attempt.stage}`} aria-label="Current diagnostic activity"
                  initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                  className={`${surface.panel} p-5 sm:p-6`}>
                  {investigating && current && (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-amber-300">{current.kind_label}</span>
                        {current.zone && <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-400">{zoneLabel(current.zone)}</span>}
                        {current.critical && <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">Critical checkpoint</span>}
                      </div>
                      <h2 className="mt-3 text-xl font-bold leading-snug sm:text-2xl">{current.title}</h2>
                      {current.instructions && <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-300">{current.instructions}</p>}

                      {current.terms.length > 0 && (
                        <details className="mt-3 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
                          <summary className="cursor-pointer text-slate-300">Technical terms ({current.terms.length})</summary>
                          <dl className="mt-2 space-y-1.5">{current.terms.map((t) => <div key={t.term}><dt className="font-semibold">{t.term}</dt><dd className="text-slate-400">{t.definition}</dd></div>)}</dl>
                        </details>
                      )}

                      {current.media.length > 0 && (
                        <div className="mt-4"><MediaShowcase assets={current.media} failedIds={new Set()} reducedMotion={reducedMotion} showStatus={false} onMediaError={() => undefined} onRetry={() => undefined} /></div>
                      )}

                      {needsAck && (
                        <fieldset className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4">
                          <legend className="flex items-center gap-1.5 px-1 text-sm font-bold text-rose-200"><ShieldAlert className="h-4 w-4" />Safety checkpoint — confirm each item</legend>
                          <ul className="mt-1 space-y-2">
                            {safetyItems.map((item, index) => (
                              <li key={item}>
                                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-200">
                                  <input type="checkbox" checked={checked.has(index)} className="mt-0.5 h-4 w-4 accent-rose-500"
                                    onChange={() => setChecked((prev) => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; })} />
                                  {item}
                                </label>
                              </li>
                            ))}
                          </ul>
                        </fieldset>
                      )}

                      {current.has_inspection && (
                        <div className="mt-5">
                          {inspectionPending ? (
                            <button type="button" disabled={busy || attempt.paused} onClick={() => void apply(() => simulatorApi.inspect(attemptId))} className={surface.amberButton}>
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}{current.kind === 'diagnostic_test' ? 'Run diagnostic test' : 'Perform inspection'}
                            </button>
                          ) : nodeEvidence.filter((e) => e.key === `node:${current.id}`).map((e) => (
                            <div key={e.key} className="rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-4">
                              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300"><ScanSearch className="h-3.5 w-3.5" />Finding recorded</p>
                              {e.clue && <p className="mt-1 text-sm text-slate-100">{e.clue}</p>}
                              {e.reading && <ReadingView reading={e.reading} />}
                            </div>
                          ))}
                        </div>
                      )}

                      {current.workflow && (
                        <p className="mt-4 flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2 text-sm text-sky-100">
                          <Workflow className="h-4 w-4" />Reference procedure: {current.workflow.title}
                        </p>
                      )}

                      {decisions.length > 0 && (
                        <div className="mt-6">
                          <p className={surface.label}>{current.kind === 'start' ? 'Ready?' : decisions.length > 1 ? 'Your decision' : 'Next'}</p>
                          <div className={`mt-2 grid gap-2.5 ${decisions.length > 1 ? 'sm:grid-cols-2' : ''}`} role="group" aria-label="Decisions">
                            {decisions.map((action) => (
                              <motion.button key={action.edge_id} type="button" whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                                disabled={busy || attempt.paused || !allChecked} onClick={() => takeAction(action.edge_id)}
                                className={`group flex min-h-[56px] items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                  action.attempted_wrong ? 'border-rose-500/30 bg-rose-500/[0.05] text-rose-200/70'
                                    : current.kind === 'start' || decisions.length === 1 ? 'border-amber-400/60 bg-amber-500 text-[#1a1206] hover:bg-amber-400'
                                      : 'border-white/10 bg-white/[0.03] hover:border-amber-400/60 hover:bg-amber-500/[0.06]'}`}>
                                {decisions.length > 1 && <Crosshair className="h-4 w-4 shrink-0 opacity-60" />}
                                <span className="flex-1">{current.kind === 'start' ? 'Begin investigation' : action.label === 'Next' ? (needsAck ? 'Confirm safety and continue' : 'Continue investigation') : action.label}</span>
                                <ArrowRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-0.5" />
                              </motion.button>
                            ))}
                          </div>
                          {current.min_checks > 0 && <p className="mt-2 text-xs text-slate-500">Evidence gathered here: {current.checks_done} of at least {current.min_checks} checks.</p>}
                          {needsAck && !allChecked && <p className="mt-2 text-xs text-rose-300">Confirm every safety item to continue.</p>}
                        </div>
                      )}
                    </>
                  )}

                  {attempt.stage === 'diagnose' && attempt.diagnosis && (
                    <div>
                      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-amber-300">Fault identification</span>
                      <h2 className="mt-3 text-xl font-bold sm:text-2xl">Submit your diagnosis</h2>
                      <p className="mt-1 text-sm text-slate-400">Choose the root cause your evidence supports. You get one submission — review your evidence log first.</p>
                      <div className="mt-4 grid gap-2.5 sm:grid-cols-2" role="group" aria-label="Possible root causes">
                        {attempt.diagnosis.options.map((cause) => {
                          const on = selected.includes(cause);
                          return (
                            <button key={cause} type="button" aria-pressed={on} onClick={() => setSelected(on ? selected.filter((c) => c !== cause) : [...selected, cause])}
                              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${on ? 'border-amber-400 bg-amber-500/15 text-amber-50' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}>
                              <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? 'border-amber-400 bg-amber-400 text-[#1a1206]' : 'border-white/25'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>{cause}
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" disabled={busy || !selected.length || attempt.paused} onClick={() => void apply(() => simulatorApi.diagnose(attemptId, selected))} className={`${surface.amberButton} mt-5`}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}Submit diagnosis
                      </button>
                    </div>
                  )}

                  {attempt.stage === 'correct' && attempt.corrective && (
                    <div>
                      <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-sky-300">Corrective action</span>
                      <h2 className="mt-3 text-xl font-bold sm:text-2xl">Restore the machine</h2>
                      <p className="mt-1 text-sm text-slate-400">Confirmed fault: <span className="font-semibold text-white">{attempt.corrective.fault}</span>. Select every approved action you would perform — and nothing else.</p>
                      {attempt.corrective.retries > 0 && <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">Your previous procedure did not restore the machine. Review and try again.</p>}
                      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
                        <div className="space-y-2" role="group" aria-label="Corrective actions">
                          {attempt.corrective.options.map((action) => {
                            const on = selected.includes(action);
                            return (
                              <label key={action} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${on ? 'border-sky-400 bg-sky-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}>
                                <input type="checkbox" checked={on} onChange={() => setSelected(on ? selected.filter((a) => a !== action) : [...selected, action])} className="h-4 w-4 accent-sky-400" />{action}
                              </label>
                            );
                          })}
                        </div>
                        <aside className="space-y-3 text-sm">
                          {attempt.corrective.tools.length > 0 && <div><p className={surface.label}>Tools</p><ul className="mt-1 space-y-1 text-slate-300">{attempt.corrective.tools.map((t) => <li key={t} className="flex gap-1.5"><Wrench className="mt-0.5 h-3.5 w-3.5 text-slate-500" />{t}</li>)}</ul></div>}
                          {attempt.corrective.safety.length > 0 && <div><p className={`${surface.label} text-rose-300`}>Safety requirements</p><ul className="mt-1 space-y-1 text-slate-300">{attempt.corrective.safety.map((s) => <li key={s} className="flex gap-1.5"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />{s}</li>)}</ul></div>}
                          {attempt.corrective.expected && <div><p className={surface.label}>Expected result</p><p className="mt-1 text-slate-300">{attempt.corrective.expected}</p></div>}
                        </aside>
                      </div>
                      <button type="button" disabled={busy || !selected.length || attempt.paused} onClick={() => void apply(() => simulatorApi.correct(attemptId, selected))} className={`${surface.amberButton} mt-5`}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}Apply corrective actions
                      </button>
                    </div>
                  )}

                  {attempt.stage === 'verify' && attempt.verification && (
                    <div>
                      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-emerald-300">Verification checkpoint</span>
                      <h2 className="mt-3 text-xl font-bold sm:text-2xl">Verify the machine is restored</h2>
                      <ul className="mt-4 space-y-2">{attempt.verification.conditions.map((c) => <li key={c} className="flex gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{c}</li>)}</ul>
                      <button type="button" disabled={busy || attempt.paused} onClick={() => void apply(() => simulatorApi.verify(attemptId))} className={`${surface.amberButton} mt-5`}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Run verification
                      </button>
                    </div>
                  )}
                </motion.section>
              </AnimatePresence>
            </main>

            {/* Right panel */}
            <aside className="space-y-4" aria-label="Mission panel">
              <section className={`${surface.panel} p-4`}>
                <p className={`${surface.label} flex items-center gap-1.5`}><Target className="h-3.5 w-3.5" />Objective</p>
                <p className="mt-1.5 text-sm text-slate-200">{attempt.mission.objective}</p>
                <p className={`${surface.label} mt-4`}>Current task</p>
                <p className="mt-1 text-sm font-semibold text-amber-200">
                  {attempt.stage === 'investigate' ? (current?.kind === 'start' ? 'Begin the investigation' : current?.title)
                    : attempt.stage === 'diagnose' ? 'Identify the root cause' : attempt.stage === 'correct' ? 'Choose the corrective procedure' : 'Verify the repair'}
                </p>
              </section>

              {investigating && checks.length > 0 && (
                <section className={`${surface.panel} p-4`} aria-labelledby="checks-heading">
                  <div className="flex items-center">
                    <p id="checks-heading" className={`${surface.label} flex items-center gap-1.5`}><Gauge className="h-3.5 w-3.5" />Diagnostic actions</p>
                    {zone && <button type="button" onClick={() => setZone(null)} className="ml-auto text-[11px] text-amber-300 hover:underline">{zoneLabel(zone)} · show all</button>}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {visibleChecks.map((action) => (
                      <li key={action.edge_id}>
                        <button type="button" disabled={busy || attempt.paused} onClick={() => takeAction(action.edge_id)}
                          className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:opacity-50 ${action.done ? 'border-emerald-400/25 bg-emerald-500/[0.06] text-emerald-100' : 'border-white/10 bg-white/[0.03] hover:border-amber-400/50'}`}>
                          {action.done ? <Check className="h-4 w-4 shrink-0 text-emerald-400" /> : <ScanSearch className="h-4 w-4 shrink-0 text-amber-300" />}
                          <span className="flex-1">{action.label}</span>
                          {action.zone && <span className="text-[10px] uppercase tracking-wider text-slate-500">{action.zone}</span>}
                        </button>
                      </li>
                    ))}
                    {visibleChecks.length === 0 && <li className="text-xs text-slate-500">No checks in this zone at this step.</li>}
                  </ul>
                </section>
              )}

              {attempt.status === 'in_progress' && (
                <section className={`${surface.panel} p-4`} aria-labelledby="assist-heading">
                  <p id="assist-heading" className={`${surface.label} flex items-center gap-1.5`}><Lightbulb className="h-3.5 w-3.5" />Assistance</p>
                  <p className="mt-1 text-xs text-slate-500">Level 1 — investigating independently. Hints only reduce your assistance score.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy || attempt.paused || Boolean(attempt.hints.current['2'])} onClick={() => void askHint(2)} className={`${surface.ghostButton} px-2 text-xs`}><Lightbulb className="h-3.5 w-3.5" />Smart hint</button>
                    <button type="button" disabled={busy || attempt.paused || Boolean(attempt.hints.current['3'])} onClick={() => void askHint(3)} className={`${surface.ghostButton} px-2 text-xs`}><ShieldCheck className="h-3.5 w-3.5" />Expert guidance</button>
                  </div>
                  {attempt.hints.current['2'] && <p className="mt-3 rounded-lg bg-amber-500/[0.07] p-2.5 text-sm text-amber-100"><strong className="text-amber-300">Hint:</strong> {attempt.hints.current['2']}</p>}
                  {attempt.hints.current['3'] && <p className="mt-2 rounded-lg bg-sky-500/[0.08] p-2.5 text-sm text-sky-100"><strong className="text-sky-300">Expert guidance:</strong> {attempt.hints.current['3']}</p>}
                  <form className="mt-3 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
                    <label htmlFor="mission-ai" className="sr-only">Ask the AI Tutor about this step</label>
                    <input id="mission-ai" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask AI Tutor about this evidence…" maxLength={1000}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#121418] px-3 py-2 text-sm placeholder:text-slate-600 focus:border-amber-400 focus:outline-none" />
                    <button type="submit" disabled={explanation.loading || !question.trim()} aria-label="Ask AI Tutor" className="rounded-lg bg-violet-600 px-3 text-white hover:bg-violet-500 disabled:opacity-40">
                      {explanation.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </form>
                  {explanation.result && (
                    <div className="mt-2 rounded-lg bg-violet-500/[0.08] p-2.5 text-sm text-violet-50">
                      <p className="flex gap-1.5"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />{explanation.result.answer}</p>
                      {explanation.result.notice && <p className="mt-1.5 text-xs text-amber-200">{explanation.result.notice}</p>}
                    </div>
                  )}
                  {explanation.error && <p role="alert" className="mt-2 text-xs text-rose-300">{explanation.error}</p>}
                </section>
              )}

              <section className={`${surface.panel} p-4`} aria-labelledby="evidence-heading">
                <div className="flex items-center">
                  <p id="evidence-heading" className={`${surface.label} flex items-center gap-1.5`}><ClipboardList className="h-3.5 w-3.5" />Investigation log ({attempt.evidence.length})</p>
                  {attempt.evidence.some((e) => e.reading) && (
                    <div role="tablist" className="ml-auto flex rounded-md bg-white/[0.04] p-0.5 text-[11px]">
                      {(['evidence', 'readings'] as const).map((tab) => (
                        <button key={tab} role="tab" aria-selected={panel === tab} type="button" onClick={() => setPanel(tab)} className={`rounded px-2 py-0.5 capitalize ${panel === tab ? 'bg-white/10 text-white' : 'text-slate-500'}`}>{tab === 'readings' ? 'Compare' : 'Clues'}</button>
                      ))}
                    </div>
                  )}
                </div>
                {attempt.evidence.length === 0 ? <p className="mt-3 text-xs text-slate-500">Evidence you discover will appear here.</p> : panel === 'readings' ? (
                  <table className="mt-3 w-full text-left text-xs">
                    <thead className="text-slate-500"><tr><th className="pb-1 font-semibold">Reading</th><th className="pb-1 text-right font-semibold">Value</th><th className="pb-1 text-right font-semibold">Reference</th></tr></thead>
                    <tbody>{attempt.evidence.filter((e): e is Evidence & { reading: Reading } => Boolean(e.reading)).map((e) => (
                      <tr key={e.key} className="border-t border-white/[0.05]">
                        <td className="py-1.5">{e.reading.label || e.title}</td>
                        <td className="py-1.5 text-right font-mono text-white">{e.reading.value} {e.reading.unit}</td>
                        <td className="py-1.5 text-right font-mono text-slate-400">{e.reading.normal || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : (
                  <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {attempt.evidence.map((e, index) => (
                      <motion.li key={e.key} initial={reducedMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className={`${surface.inset} p-3`}>
                        <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-300/90"><span className="font-mono">#{index + 1}</span>{e.title}</p>
                        {e.clue && <p className="mt-1 text-sm text-slate-200">{e.clue}</p>}
                        {e.reading && <ReadingView reading={e.reading} />}
                        <p className="mt-1 text-[10.5px] text-slate-500">{zoneLabel(e.zone)} · {e.step}</p>
                      </motion.li>
                    ))}
                  </ol>
                )}
              </section>
            </aside>
          </div>

          {/* Bottom: mission stages and live performance */}
          <footer className="border-t border-white/[0.06] bg-[#13161a] px-4 py-3 sm:px-6">
            <InvestigationMap map={attempt.map} reducedMotion={reducedMotion} />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className={`${surface.inset} px-3 py-2`}><p className={surface.label}>Current score</p><p className="mt-0.5 font-mono text-sm font-bold text-white">{attempt.score_preview.total}<span className="text-slate-500"> / 100</span></p></div>
              <div className={`${surface.inset} px-3 py-2`}><p className={surface.label}>Evidence</p><p className="mt-0.5 font-mono text-sm font-bold text-cyan-200">{attempt.score_preview.evidence_found}<span className="text-slate-500"> / {attempt.score_preview.evidence_available}</span></p></div>
              <div className={`${surface.inset} px-3 py-2`}><p className={surface.label}>Diagnostic accuracy</p><p className="mt-0.5 font-mono text-sm font-bold text-sky-200">{Math.round(attempt.score_preview.breakdown.root_cause / Math.max(1, attempt.score_preview.max.root_cause) * 100)}%</p></div>
              <div className={`${surface.inset} px-3 py-2`}><p className={surface.label}>Safety performance</p><p className={`mt-0.5 font-mono text-sm font-bold ${attempt.safety.status === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{attempt.score_preview.breakdown.safety}<span className="text-slate-500"> / {attempt.score_preview.max.safety}</span></p></div>
              <div className={`${surface.inset} px-3 py-2`}><p className={surface.label}>Projected XP</p><p className="mt-0.5 font-mono text-sm font-bold text-amber-200">{attempt.score_preview.xp_projected} XP</p></div>
            </div>
          </footer>
        </>
      )}

      {attempt.paused && attempt.status === 'in_progress' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0f1114]/85 backdrop-blur-sm">
          <div className="text-center">
            <p className="font-mono text-xs font-bold tracking-[0.25em] text-amber-400">MISSION PAUSED</p>
            <p className="mt-2 text-sm text-slate-400">The timer is stopped. Your evidence and progress are saved.</p>
            <button type="button" disabled={busy} onClick={() => void apply(() => simulatorApi.resume(attemptId))} className={`${surface.amberButton} mt-5`}><Play className="h-4 w-4" />Resume mission</button>
          </div>
        </div>
      )}
    </div>
  );
};
