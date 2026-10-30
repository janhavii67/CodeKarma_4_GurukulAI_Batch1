import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Award, BookOpen, Check, CheckCircle2, Clock3, Film, Lightbulb, Loader2, RotateCcw, ShieldAlert, Target, Workflow, X, XCircle } from 'lucide-react';
import { getApiUrl } from '../../../lib/api/client';
import type { MissionAttempt, MissionReport } from '../types';
import { formatClock, surface } from '../ui';

const CATEGORY_LABELS: Array<[keyof MissionReport['score']['breakdown'], string]> = [
  ['root_cause', 'Root-cause accuracy'], ['decisions', 'Diagnostic reasoning'], ['safety', 'Safety compliance'],
  ['evidence', 'Evidence collection'], ['corrective', 'Corrective action'], ['assistance', 'Independence (hints)'], ['efficiency', 'Time efficiency'],
];

const ScoreRing: React.FC<{ value: number; reducedMotion: boolean }> = ({ value, reducedMotion }) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const tone = value >= 85 ? '#34d399' : value >= 60 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="relative h-36 w-36" role="img" aria-label={`Overall score ${value} out of 100`}>
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <motion.circle cx="64" cy="64" r={radius} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: circumference * (1 - value / 100) }} transition={{ duration: reducedMotion ? 0 : 1.2, ease: 'easeOut' }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-bold">{value}</span>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">/ 100</span>
      </span>
    </div>
  );
};

interface PerformanceReportProps {
  attempt: MissionAttempt;
  reducedMotion: boolean;
  replaying: boolean;
  onReplay: () => void;
}

export const PerformanceReport: React.FC<PerformanceReportProps> = ({ attempt, reducedMotion, replaying, onReplay }) => {
  const report = attempt.report!;
  const { score, stats } = report;
  return (
    <div className="space-y-5">
      <section className={`${surface.panel} relative overflow-hidden p-6`}>
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-8">
          <ScoreRing value={score.total} reducedMotion={reducedMotion} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-bold tracking-[0.2em] text-emerald-400">MISSION COMPLETE · {attempt.mission.code}</p>
            <h2 className="mt-1 text-2xl font-bold">{attempt.mission.title}</h2>
            {report.fault && <p className="mt-1 text-sm text-slate-400">Approved fault: <span className="text-slate-200">{report.fault.title}</span></p>}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 font-mono font-bold text-amber-300">+{score.xp_awarded} XP</span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-slate-300"><Clock3 className="h-3.5 w-3.5" />{formatClock(stats.time_seconds)}</span>
              {score.is_personal_best && <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300">Personal best</span>}
              {score.previous_best !== null && !score.is_personal_best && <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-slate-400">Best: {score.previous_best}</span>}
            </div>
            {score.xp_awarded < score.xp_earned && <p className="mt-2 text-[11px] text-slate-500">Replays award XP only for improving on your personal best.</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onReplay} disabled={replaying} className={surface.amberButton}>{replaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Replay mission</button>
            <Link to="/app/troubleshooting/interactive" className={surface.ghostButton}>Interactive troubleshooting</Link>
          </div>
        </div>
        {report.achievements.length > 0 && (
          <ul className="relative mt-6 flex flex-wrap gap-3" aria-label="Achievements unlocked">
            {report.achievements.map((achievement, index) => (
              <motion.li key={achievement.code} initial={reducedMotion ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + index * 0.15 }}
                className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                <Award className="h-5 w-5 text-amber-300" />
                <span><span className="block text-sm font-semibold text-amber-100">{achievement.title}</span><span className="block text-xs text-amber-200/70">{achievement.description}</span></span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className={`${surface.panel} p-5`} aria-labelledby="breakdown-heading">
          <h3 id="breakdown-heading" className={surface.label}>Score breakdown</h3>
          <ul className="mt-4 space-y-3">
            {CATEGORY_LABELS.map(([key, label]) => {
              const value = score.breakdown[key];
              const max = score.max[key];
              return (
                <li key={key}>
                  <div className="flex justify-between text-sm"><span className="text-slate-300">{label}</span><span className="font-mono text-slate-400">{value}/{max}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div className={`h-full rounded-full ${value === max ? 'bg-emerald-400' : value / max >= 0.5 ? 'bg-amber-400' : 'bg-rose-400'}`}
                      initial={{ width: 0 }} animate={{ width: `${(value / max) * 100}%` }} transition={{ duration: reducedMotion ? 0 : 0.8 }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
            {([['Wrong decisions', stats.wrong], ['Safety violations', stats.violations], ['Hints used', stats.hints_smart + stats.hints_expert],
              ['Evidence', `${score.evidence_found}/${score.evidence_available}`], ['Premature moves', stats.premature], ['Missed checkpoints', score.missed_checkpoints.length]] as const).map(([label, value]) => (
              <div key={label} className={`${surface.inset} p-2`}><dd className="font-mono text-base font-bold">{value}</dd><dt className="text-slate-500">{label}</dt></div>
            ))}
          </dl>
          {score.missed_checkpoints.length > 0 && <p className="mt-3 text-xs text-rose-300">Skipped checkpoints: {score.missed_checkpoints.join(', ')}</p>}
        </section>

        <section className={`${surface.panel} space-y-4 p-5`} aria-labelledby="diagnosis-heading">
          <h3 id="diagnosis-heading" className={surface.label}>Diagnosis & resolution</h3>
          {report.diagnosis && (
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Target className="h-4 w-4 text-amber-400" />Root cause</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Array.from(new Set([...report.diagnosis.chosen, ...report.diagnosis.correct])).map((cause) => {
                  const chosen = report.diagnosis!.chosen.includes(cause);
                  const correct = report.diagnosis!.correct.includes(cause);
                  return (
                    <li key={cause} className="flex items-center gap-2">
                      {chosen && correct ? <Check className="h-4 w-4 text-emerald-400" /> : chosen ? <X className="h-4 w-4 text-rose-400" /> : <span className="h-4 w-4 rounded-full border border-dashed border-emerald-400/60" />}
                      <span className={chosen && !correct ? 'text-rose-200 line-through' : correct ? 'text-slate-100' : ''}>{cause}</span>
                      {!chosen && correct && <span className="text-[11px] text-emerald-300/80">missed</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {report.corrective && (
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Workflow className="h-4 w-4 text-sky-400" />Corrective actions</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Array.from(new Set([...report.corrective.chosen, ...report.corrective.correct])).map((action) => {
                  const chosen = report.corrective!.chosen.includes(action);
                  const correct = report.corrective!.correct.includes(action);
                  return (
                    <li key={action} className="flex items-center gap-2">
                      {chosen && correct ? <Check className="h-4 w-4 text-emerald-400" /> : chosen ? <X className="h-4 w-4 text-rose-400" /> : <span className="h-4 w-4 rounded-full border border-dashed border-emerald-400/60" />}
                      <span className={chosen && !correct ? 'text-rose-200 line-through' : ''}>{action}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {report.did_well.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-emerald-300">What you did well</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">{report.did_well.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{item}</li>)}</ul>
            </div>
          )}
        </section>
      </div>

      {report.mistakes.length > 0 && (
        <section className={`${surface.panel} p-5`} aria-labelledby="mistakes-heading">
          <h3 id="mistakes-heading" className={surface.label}>Where your decisions differed</h3>
          <ul className="mt-3 space-y-2">
            {report.mistakes.map((mistake, index) => (
              <li key={index} className={`${surface.inset} p-3 text-sm`}>
                <p className="flex gap-2 font-semibold text-rose-200"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{mistake.what}</p>
                {mistake.why && <p className="mt-1 pl-6 text-slate-400">{mistake.why}</p>}
                {mistake.approved && <p className="mt-1 pl-6 text-emerald-300/90">{mistake.approved}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${surface.panel} p-5`} aria-labelledby="replay-heading">
        <h3 id="replay-heading" className={surface.label}>Diagnostic journey replay</h3>
        <ol className="relative mt-4 space-y-4 border-l border-white/10 pl-6">
          {report.replay.map((step) => (
            <li key={step.node_id} className="relative">
              <span className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full ${step.matches || !step.approved_choice ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {step.matches || !step.approved_choice ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
              </span>
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{step.kind_label}</p>
              <p className="text-sm font-semibold">{step.title}</p>
              {step.checks.length > 0 && <p className="mt-1 text-xs text-slate-400">Checks performed: {step.checks.join(', ')}</p>}
              {step.missteps.map((miss, i) => (
                <p key={i} className={`mt-1 flex gap-1.5 text-xs ${miss.outcome === 'unsafe' ? 'text-rose-300' : 'text-amber-200/80'}`}>
                  {miss.outcome === 'unsafe' ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                  “{miss.label}”{miss.feedback ? ` — ${miss.feedback}` : ''}
                </p>
              ))}
              {step.your_choice && step.approved_choice && (
                <p className="mt-1 text-xs"><span className="text-slate-400">You: </span><span className={step.matches ? 'text-emerald-300' : 'text-rose-200'}>{step.your_choice}</span>
                  {!step.matches && <><span className="text-slate-400"> · Expert: </span><span className="text-emerald-300">{step.approved_choice}</span></>}</p>
              )}
              {step.explanation && !step.matches && <p className="mt-1 flex gap-1.5 text-xs text-slate-400"><Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-400" />{step.explanation}</p>}
            </li>
          ))}
        </ol>
      </section>

      {report.resources.length > 0 && (
        <section className={`${surface.panel} p-5`} aria-labelledby="resources-heading">
          <h3 id="resources-heading" className={surface.label}>Recommended learning resources</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {report.resources.map((resource) => {
              const Icon = resource.type === 'workflow' ? Workflow : resource.type === 'media' ? Film : BookOpen;
              const href = resource.type === 'knowledge' ? `/app/knowledge/${resource.item_id}` : resource.type === 'workflow' ? '/app/guided-workflows' : null;
              const inner = <><Icon className="h-4 w-4 shrink-0 text-sky-400" /><span className="truncate">{resource.title}</span></>;
              return (
                <li key={`${resource.type}-${resource.title}`}>
                  {href ? <Link to={href} className={`${surface.inset} flex items-center gap-2 p-3 text-sm hover:border-white/20`}>{inner}</Link>
                    : <a href={getApiUrl(`${resource.url}?inline=true`)} target="_blank" rel="noreferrer" className={`${surface.inset} flex items-center gap-2 p-3 text-sm hover:border-white/20`}>{inner}</a>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};
