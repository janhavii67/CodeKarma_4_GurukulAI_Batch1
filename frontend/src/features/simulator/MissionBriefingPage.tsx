import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Briefcase, ClipboardCheck, Clock3, Loader2, Lock, PlayCircle, RotateCcw, ShieldAlert, Siren, Target, Trophy } from 'lucide-react';
import { getApiUrl } from '../../lib/api/client';
import { simulatorApi } from './api';
import { DIFFICULTY, ZONE_META, formatClock, pretty, surface } from './ui';

/** Cinematic mission briefing shown before a trainee starts or resumes a mission. */
export const MissionBriefingPage: React.FC = () => {
  const { missionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reducedMotion = Boolean(useReducedMotion());
  const briefingQuery = useQuery({ queryKey: ['sim-briefing', missionId], queryFn: () => simulatorApi.briefing(missionId) });
  const brief = briefingQuery.data;
  const leaderboardQuery = useQuery({ queryKey: ['sim-leaderboard', missionId], queryFn: () => simulatorApi.leaderboard(missionId), enabled: Boolean(brief?.leaderboard) });
  const [starting, setStarting] = useState<'start' | 'restart' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const launch = async (restart: boolean) => {
    setStarting(restart ? 'restart' : 'start');
    setError(null);
    try {
      const attempt = await simulatorApi.start(missionId, restart);
      void queryClient.invalidateQueries({ queryKey: ['sim-missions'] });
      navigate(`/app/troubleshooting/interactive/attempts/${attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The mission could not be started.');
      setStarting(null);
    }
  };

  if (briefingQuery.isLoading) return <div className={`flex h-[60vh] items-center justify-center rounded-[28px] ${surface.page}`}><Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Loading briefing" /></div>;
  if (briefingQuery.isError || !brief) {
    return (
      <div className={`rounded-[28px] p-12 text-center ${surface.page}`}>
        <p className="text-sm text-slate-300">This mission is not available.</p>
        <Link to="/app/troubleshooting/interactive" className="mt-4 inline-block text-sm font-semibold text-amber-300">Back to interactive troubleshooting</Link>
      </div>
    );
  }

  const difficulty = DIFFICULTY[brief.difficulty] || DIFFICULTY.INTERMEDIATE;
  const reveal = (delay: number) => (reducedMotion ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.4 } });

  return (
    <div className={`min-h-[calc(100vh-7.5rem)] rounded-[28px] px-4 py-6 sm:px-8 ${surface.page}`}>
      <div className="mx-auto max-w-6xl">
        <Link to="/app/troubleshooting/interactive" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Interactive troubleshooting</Link>

        <section className="relative mt-4 overflow-hidden rounded-3xl border border-white/[0.07]">
          <div className="absolute inset-0 bg-[#171a1f]">
            {brief.cover_media && <img src={getApiUrl(`${brief.cover_media.url}?inline=true`)} alt="" className="h-full w-full object-cover opacity-35" />}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0f1114] via-[#0f1114]/90 to-[#0f1114]/40" />
          </div>
          <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <motion.p {...reveal(0)} className="font-mono text-xs font-bold tracking-[0.25em] text-amber-400">MISSION #{brief.mission_code}</motion.p>
              <motion.p {...reveal(0.1)} className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Machine: <span className="text-slate-200">{brief.machine_name || 'Equipment'}</span></motion.p>
              <motion.div {...reveal(0.2)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5">
                <Siren className="h-4 w-4 text-amber-400" /><span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-200">Alert: {brief.alert}</span>
              </motion.div>
              <motion.h1 {...reveal(0.3)} className="mt-5 text-3xl font-bold leading-tight sm:text-4xl">{brief.title}</motion.h1>
              <motion.div {...reveal(0.4)}>
                <p className={`${surface.label} mt-6`}>Scenario</p>
                <p className="mt-2 max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed text-slate-300">{brief.scenario}</p>
                <p className={`${surface.label} mt-6`}>Objective</p>
                <p className="mt-2 flex max-w-2xl gap-2 text-[15px] leading-relaxed text-white"><Target className="mt-1 h-4 w-4 shrink-0 text-amber-400" />{brief.objective}</p>
              </motion.div>
            </div>
            <motion.aside {...reveal(0.5)} className="space-y-3 self-end">
              <div className="grid grid-cols-3 gap-2">
                <div className={`${surface.inset} p-3`}><p className={surface.label}>Level</p><p className={`mt-1 text-sm font-bold ${difficulty.className.split(' ')[0]}`}>{difficulty.label}</p></div>
                <div className={`${surface.inset} p-3`}><p className={surface.label}>Est. time</p><p className="mt-1 flex items-center gap-1 font-mono text-sm font-bold"><Clock3 className="h-3.5 w-3.5 text-slate-500" />{brief.estimated_minutes ? `${brief.estimated_minutes}m` : '—'}</p></div>
                <div className={`${surface.inset} p-3`}><p className={surface.label}>Reward</p><p className="mt-1 font-mono text-sm font-bold text-amber-300">{brief.xp_reward} XP</p></div>
              </div>
              {brief.best_score !== null && <p className="text-xs text-slate-400">Personal best <span className="font-mono font-bold text-white">{brief.best_score}</span> after {brief.attempts} attempt{brief.attempts === 1 ? '' : 's'}.</p>}
              {error && <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
              {brief.locked ? (
                <p className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-3 text-sm text-slate-300"><Lock className="h-4 w-4" />{brief.locked_reason}</p>
              ) : brief.in_progress_attempt_id ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => navigate(`/app/troubleshooting/interactive/attempts/${brief.in_progress_attempt_id}`)} className={`${surface.amberButton} flex-1`}><PlayCircle className="h-5 w-5" />Resume mission</button>
                  <button type="button" disabled={Boolean(starting)} onClick={() => void launch(true)} className={surface.ghostButton}>
                    {starting === 'restart' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Start over
                  </button>
                </div>
              ) : (
                <button type="button" disabled={Boolean(starting)} onClick={() => void launch(false)} className={`${surface.amberButton} w-full py-3.5 text-base tracking-wide`}>
                  {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}START MISSION
                </button>
              )}
            </motion.aside>
          </div>
        </section>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <section className={`${surface.panel} p-5`} aria-labelledby="symptoms-heading">
            <h2 id="symptoms-heading" className={`${surface.label} flex items-center gap-1.5`}><AlertTriangle className="h-3.5 w-3.5" />Reported symptoms</h2>
            {brief.symptoms.length ? <ul className="mt-3 space-y-2 text-sm text-slate-300">{brief.symptoms.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{s}</li>)}</ul>
              : <p className="mt-3 text-sm text-slate-500">See the scenario above.</p>}
            {brief.zones.length > 0 && (
              <>
                <p className={`${surface.label} mt-5`}>Systems you can inspect</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{brief.zones.map((zone) => {
                  const meta = ZONE_META[zone] || ZONE_META.general;
                  const Icon = meta.icon;
                  return <span key={zone} className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1 text-xs text-slate-300"><Icon className="h-3 w-3" />{meta.label}</span>;
                })}</div>
              </>
            )}
          </section>
          <section className={`${surface.panel} p-5`} aria-labelledby="safety-heading">
            <h2 id="safety-heading" className={`${surface.label} flex items-center gap-1.5 text-rose-300`}><ShieldAlert className="h-3.5 w-3.5" />Safety instructions</h2>
            {brief.safety.length ? <ul className="mt-3 space-y-2 text-sm text-slate-300">{brief.safety.map((s) => <li key={s} className="flex gap-2"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />{s}</li>)}</ul>
              : <p className="mt-3 text-sm text-slate-500">No special precautions were listed. Follow your site's standard safety rules.</p>}
            {brief.equipment.length > 0 && (
              <>
                <p className={`${surface.label} mt-5 flex items-center gap-1.5`}><Briefcase className="h-3.5 w-3.5" />Equipment & resources</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">{brief.equipment.map((e) => <li key={e} className="rounded-md bg-white/[0.05] px-2 py-1 text-xs text-slate-300">{e}</li>)}</ul>
              </>
            )}
          </section>
          <section className={`${surface.panel} p-5`} aria-labelledby="criteria-heading">
            <h2 id="criteria-heading" className={`${surface.label} flex items-center gap-1.5`}><ClipboardCheck className="h-3.5 w-3.5" />Performance criteria</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">{brief.criteria.map((c) => <li key={c} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />{c}</li>)}</ul>
            <p className="mt-4 text-xs text-slate-500">Hints are available during the mission and reduce only your assistance score. Unsafe actions are blocked and cost safety points.</p>
            {brief.skills.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{brief.skills.map((s) => <span key={s} className="rounded-md bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200">{s}</span>)}</div>}
          </section>
        </div>

        {brief.leaderboard && leaderboardQuery.data && leaderboardQuery.data.length > 0 && (
          <section className={`${surface.panel} mt-5 p-5`} aria-labelledby="leaderboard-heading">
            <h2 id="leaderboard-heading" className={`${surface.label} flex items-center gap-1.5`}><Trophy className="h-3.5 w-3.5 text-amber-400" />Leaderboard</h2>
            <ol className="mt-3 divide-y divide-white/[0.05]">
              {leaderboardQuery.data.map((row) => (
                <li key={row.rank} className="flex items-center gap-4 py-2 text-sm">
                  <span className="w-6 font-mono font-bold text-amber-300">{row.rank}</span>
                  <span className="flex-1">{row.name}</span>
                  <span className="font-mono text-xs text-slate-500">{formatClock(row.time_seconds)}</span>
                  <span className="w-10 text-right font-mono font-bold">{row.score}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <p className="mt-6 text-center text-xs text-slate-600">{pretty(brief.problem_category)} · Scenario authored and approved by your experts.</p>
      </div>
    </div>
  );
};
