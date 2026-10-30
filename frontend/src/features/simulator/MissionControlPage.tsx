import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Award, CheckCircle2, Clock3, Crosshair, History, Loader2, Lock, PlayCircle, Radar, ShieldCheck, Sparkles, Target, Trophy } from 'lucide-react';
import { getApiUrl } from '../../lib/api/client';
import { simulatorApi } from './api';
import type { MissionDifficulty, MissionSummary } from './types';
import { DIFFICULTY, formatClock, pretty, surface } from './ui';

const ACHIEVEMENT_ICONS: Record<string, React.ElementType> = {
  first_responder: Radar, sharp_observer: Crosshair, safety_first: ShieldCheck, root_cause_master: Target,
  diagnostic_expert: Trophy, independent_investigator: Sparkles,
};

const DifficultyBars: React.FC<{ difficulty: MissionDifficulty }> = ({ difficulty }) => (
  <span className="flex items-end gap-0.5" aria-hidden="true">
    {[1, 2, 3, 4].map((bar) => (
      <span key={bar} className={`w-1 rounded-sm ${bar <= DIFFICULTY[difficulty].bars ? 'bg-current' : 'bg-white/15'}`} style={{ height: 4 + bar * 3 }} />
    ))}
  </span>
);

const MissionCard: React.FC<{ mission: MissionSummary; index: number; reducedMotion: boolean; starting: boolean; onStart: (mission: MissionSummary) => void }> = ({ mission, index, reducedMotion, starting, onStart }) => {
  const difficulty = DIFFICULTY[mission.difficulty] || DIFFICULTY.INTERMEDIATE;
  const content = (
    <>
      <div className="relative h-36 overflow-hidden rounded-t-2xl bg-[#1d2127]">
        {mission.cover_media
          ? <img src={getApiUrl(`${mission.cover_media.url}?inline=true`)} alt="" className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-90" />
          : <div className="h-full w-full" style={{ backgroundImage: 'linear-gradient(135deg, rgba(245,158,11,0.10), transparent 60%), radial-gradient(circle, rgba(148,163,184,0.14) 1px, transparent 1.3px)', backgroundSize: '100% 100%, 18px 18px' }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#171a1f] via-[#171a1f]/30 to-transparent" />
        <span className="absolute left-4 top-4 font-mono text-[11px] font-bold tracking-widest text-amber-300">{mission.mission_code}</span>
        <span className={`absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${difficulty.className}`}>
          <DifficultyBars difficulty={mission.difficulty} />{difficulty.label}
        </span>
        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{mission.machine_name || 'Equipment'} · {pretty(mission.problem_category)}</p>
          <h3 className="mt-0.5 text-lg font-bold leading-snug text-white">{mission.title}</h3>
        </div>
        {mission.locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f1114]/80 backdrop-blur-[2px]">
            <Lock className="h-6 w-6 text-slate-400" />
            <p className="max-w-[80%] text-center text-xs text-slate-300">{mission.locked_reason}</p>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm leading-relaxed text-slate-400">{mission.briefing_preview || mission.alert}</p>
        {mission.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{mission.skills.slice(0, 3).map((skill) => <span key={skill} className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-300">{skill}</span>)}</div>
        )}
        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-center">
          <div><dt className={surface.label}>Reward</dt><dd className="mt-0.5 font-mono text-sm font-bold text-amber-300">{mission.xp_reward} XP</dd></div>
          <div><dt className={surface.label}>Time</dt><dd className="mt-0.5 font-mono text-sm font-bold text-slate-200">{mission.estimated_minutes ? `~${mission.estimated_minutes}m` : '—'}</dd></div>
          <div><dt className={surface.label}>Best</dt><dd className="mt-0.5 font-mono text-sm font-bold text-slate-200">{mission.best_score ?? '—'}</dd></div>
        </dl>
        <div className="flex items-center justify-between text-xs">
          <span className={mission.status === 'completed' ? 'inline-flex items-center gap-1 text-emerald-300' : mission.status === 'in_progress' ? 'inline-flex items-center gap-1 text-amber-300' : 'text-slate-500'}>
            {mission.status === 'completed' ? <><CheckCircle2 className="h-3.5 w-3.5" />Completed</> : mission.status === 'in_progress' ? <><Clock3 className="h-3.5 w-3.5" />In progress</> : 'Not attempted'}
          </span>
          <span className="text-slate-500">{mission.attempts} attempt{mission.attempts === 1 ? '' : 's'}</span>
        </div>
      </div>
    </>
  );
  const motionProps = reducedMotion ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(index, 8) * 0.05 } };
  return (
    <motion.li {...motionProps}>
      {mission.locked ? (
        <div aria-label={`${mission.title} (locked)`} className={`${surface.panel} flex h-full cursor-not-allowed flex-col opacity-80`}>{content}</div>
      ) : (
        <Link to={`/app/troubleshooting/interactive/missions/${mission.id}`} onClick={(event) => { event.preventDefault(); if (!starting) onStart(mission); }} aria-disabled={starting} aria-label={`Start interactive tree ${mission.mission_code}: ${mission.title}`}
          className={`${surface.panel} group flex h-full flex-col text-left transition hover:-translate-y-1 hover:border-amber-400/40 hover:shadow-[0_24px_60px_-30px_rgba(245,158,11,0.45)] ${starting ? 'cursor-wait opacity-70' : ''}`}>
          {content}
        </Link>
      )}
    </motion.li>
  );
};

/** Trainee entry point: available missions, progression, achievements and history. */
export const MissionControlPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reducedMotion = Boolean(useReducedMotion());
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'missions' | 'progress' | 'history') || 'missions';
  const [difficulty, setDifficulty] = useState<'ALL' | MissionDifficulty>('ALL');
  const [category, setCategory] = useState('');
  const [startingMission, setStartingMission] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const missionsQuery = useQuery({ queryKey: ['sim-missions'], queryFn: simulatorApi.missions });
  const profileQuery = useQuery({ queryKey: ['sim-profile'], queryFn: simulatorApi.profile });
  const missions = missionsQuery.data || [];
  const profile = profileQuery.data;
  const categories = useMemo(() => Array.from(new Set(missions.map((m) => m.problem_category))).sort(), [missions]);
  const visible = missions.filter((m) => (difficulty === 'ALL' || m.difficulty === difficulty) && (!category || m.problem_category === category));
  const resume = missions.find((m) => m.in_progress_attempt_id && !m.locked);
  const levelFloor = profile ? (profile.level - 1) ** 2 * 100 : 0;
  const levelPct = profile ? Math.min(100, ((profile.total_xp - levelFloor) / Math.max(1, profile.next_level_xp - levelFloor)) * 100) : 0;
  const startMission = async (mission: MissionSummary) => {
    setStartingMission(mission.id);
    setLaunchError(null);
    try {
      const attempt = await simulatorApi.start(mission.id);
      void queryClient.invalidateQueries({ queryKey: ['sim-missions'] });
      navigate(`/app/troubleshooting/interactive/attempts/${attempt.id}`);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'This troubleshooting tree could not be started.');
      setStartingMission(null);
    }
  };

  return (
    <div className={`min-h-[calc(100vh-7.5rem)] rounded-[28px] px-4 py-6 sm:px-6 lg:px-8 ${surface.page}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className={`${surface.panel} relative overflow-hidden p-6 sm:p-8`}>
          <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.10) 1px, transparent 1.3px)', backgroundSize: '22px 22px' }} />
          <div className="relative flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400"><Radar className="h-4 w-4" />Published expert trees</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Interactive troubleshooting</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-400">Explore the complete published branching tree, investigate with evidence, and follow a safe expert-approved path.</p>
            </div>
            {profile && (
              <div className={`${surface.inset} w-full max-w-sm p-4`}>
                <div className="flex items-baseline justify-between">
                  <span className={surface.label}>Technician level</span>
                  <span className="font-mono text-xs text-slate-400">{profile.total_xp} / {profile.next_level_xp} XP</span>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="font-mono text-3xl font-bold text-amber-300">L{profile.level}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-label="Progress to next level" aria-valuenow={Math.round(levelPct)} aria-valuemin={0} aria-valuemax={100}>
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" initial={false} animate={{ width: `${levelPct}%` }} transition={{ duration: reducedMotion ? 0 : 0.8 }} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{profile.completed} missions completed · {profile.achievements.filter((a) => a.earned_at).length}/{profile.achievements.length} badges</p>
              </div>
            )}
          </div>
        </header>

        {resume && tab === 'missions' && (
          <Link to={`/app/troubleshooting/interactive/attempts/${resume.in_progress_attempt_id}`} className={`${surface.panel} flex items-center gap-4 border-amber-400/30 p-4 transition hover:border-amber-400/60`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><PlayCircle className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Resume mission {resume.mission_code}</span>
              <span className="block truncate text-xs text-slate-400">{resume.title} — your progress and evidence are saved</span>
            </span>
            <span className="text-sm font-bold text-amber-300">Resume</span>
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Interactive troubleshooting sections" className="flex rounded-xl bg-white/[0.04] p-1">
            {([['missions', 'Missions', Target], ['progress', 'Badges & skills', Award], ['history', 'History', History]] as const).map(([key, label, Icon]) => (
              <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setParams(key === 'missions' ? {} : { tab: key })}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === key ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-white'}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          {tab === 'missions' && (
            <>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by difficulty">
                {(['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const).map((key) => (
                  <button key={key} type="button" aria-pressed={difficulty === key} onClick={() => setDifficulty(key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${difficulty === key ? 'bg-amber-500 text-[#1a1206]' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`}>
                    {key === 'ALL' ? 'All' : DIFFICULTY[key].label}
                  </button>
                ))}
              </div>
              {categories.length > 1 && (
                <select aria-label="Filter by fault category" value={category} onChange={(e) => setCategory(e.target.value)}
                  className="ml-auto rounded-lg border border-white/10 bg-[#171a1f] px-3 py-2 text-sm text-slate-200 focus:border-amber-400 focus:outline-none">
                  <option value="">All fault categories</option>
                  {categories.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
                </select>
              )}
            </>
          )}
        </div>

        {launchError && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{launchError}</p>}

        {tab === 'missions' && (missionsQuery.isLoading ? (
          <div className="flex justify-center py-20 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading missions" /></div>
        ) : missionsQuery.isError ? (
          <p role="alert" className={`${surface.panel} p-6 text-sm text-rose-300`}>Missions could not be loaded. Try again shortly.</p>
        ) : visible.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Available interactive troubleshooting trees">
            {visible.map((mission, index) => <MissionCard key={mission.id} mission={mission} index={index} reducedMotion={reducedMotion} starting={startingMission === mission.id} onStart={startMission} />)}
          </ul>
        ) : (
          <div className={`${surface.panel} py-16 text-center`}>
            <Radar className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-300">{missions.length ? 'No missions match these filters' : 'No missions available yet'}</p>
            <p className="mt-1 text-sm text-slate-500">Experts publish missions here once their troubleshooting trees are approved.</p>
          </div>
        ))}

        {tab === 'progress' && profile && (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <section className={`${surface.panel} p-5`} aria-labelledby="badges-heading">
              <h2 id="badges-heading" className={surface.label}>Achievement badges</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {profile.achievements.map((achievement) => {
                  const Icon = ACHIEVEMENT_ICONS[achievement.code] || Award;
                  const earned = Boolean(achievement.earned_at);
                  return (
                    <li key={achievement.code} className={`${surface.inset} flex items-start gap-3 p-3.5 ${earned ? '' : 'opacity-50'}`}>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${earned ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30' : 'bg-white/[0.04] text-slate-500'}`}><Icon className="h-5 w-5" /></span>
                      <span>
                        <span className="block text-sm font-semibold">{achievement.title}</span>
                        <span className="block text-xs text-slate-400">{achievement.description}</span>
                        {earned && <span className="mt-1 block text-[11px] text-amber-300/80">Earned {new Date(achievement.earned_at!).toLocaleDateString()}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className={`${surface.panel} p-5`} aria-labelledby="skills-heading">
              <h2 id="skills-heading" className={surface.label}>Skill progression</h2>
              {profile.skills.length ? (
                <ul className="mt-4 space-y-4">
                  {profile.skills.map((skill) => (
                    <li key={skill.skill}>
                      <div className="flex justify-between text-sm"><span className="font-semibold">{skill.skill}</span><span className="font-mono text-slate-400">{skill.score}</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-sky-400" style={{ width: `${skill.score}%` }} /></div>
                      <p className="mt-1 text-[11px] text-slate-500">Best score across {skill.missions} mission{skill.missions === 1 ? '' : 's'}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-slate-500">Complete a mission to start building your skill profile.</p>}
            </section>
          </div>
        )}

        {tab === 'history' && profile && (
          profile.history.length ? (
            <ul className="space-y-2" aria-label="Mission history">
              {profile.history.map((item) => (
                <li key={item.attempt_id}>
                  <Link to={item.status === 'abandoned' ? `/app/troubleshooting/interactive/missions/${item.mission_id}` : `/app/troubleshooting/interactive/attempts/${item.attempt_id}`}
                    className={`${surface.panel} flex flex-wrap items-center gap-4 p-4 transition hover:border-white/20`}>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${item.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : item.status === 'in_progress' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.05] text-slate-400'}`}>{item.status.replace('_', ' ')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
                    <span className="font-mono text-xs text-slate-400">{new Date(item.started_at).toLocaleDateString()} · {formatClock(item.time_seconds)}</span>
                    <span className="w-16 text-right font-mono text-sm font-bold">{item.score ?? '—'}</span>
                    <span className="w-16 text-right font-mono text-xs text-amber-300">+{item.xp} XP</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className={`${surface.panel} p-8 text-center text-sm text-slate-500`}>No missions attempted yet.</p>
        )}
      </div>
    </div>
  );
};
