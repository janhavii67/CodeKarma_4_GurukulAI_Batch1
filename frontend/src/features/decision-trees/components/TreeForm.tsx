import React, { useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { getApiUrl } from '../../../lib/api/client';
import { decisionTreeApi } from '../api';
import type { DecisionGuide, Difficulty, GuideInput, MediaRef, Severity } from '../types';

const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DIFFICULTIES: Difficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
const NEWLINE = String.fromCharCode(10);
export const PROBLEM_CATEGORIES = ['Mechanical', 'Electrical', 'Image quality', 'Noise / sound', 'Thermal', 'Software', 'Startup / power', 'Calibration'];

interface TreeFormProps {
  machines: Array<{ id: string; name: string }>;
  initial?: DecisionGuide;
  submitLabel: string;
  /** Optional AI prompt field shown when creating a tree. */
  allowAIDraft?: boolean;
  onSubmit: (values: GuideInput, aiPrompt: string | null) => Promise<void>;
  onCancel: () => void;
}

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const label = 'mb-1 block text-xs font-semibold text-slate-600';

export const TreeForm: React.FC<TreeFormProps> = ({ machines, initial, submitLabel, allowAIDraft, onSubmit, onCancel }) => {
  const [values, setValues] = useState({
    title: initial?.title || '',
    machine_id: initial?.machine_id || '',
    problem_category: initial ? initial.problem_category.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '',
    description: initial?.description || '',
    difficulty: (initial?.difficulty || 'INTERMEDIATE') as Difficulty,
    severity: (initial?.severity || 'MEDIUM') as Severity,
    tags: (initial?.tags || []).join(', '),
    estimated_minutes: initial?.estimated_minutes ? String(initial.estimated_minutes) : '',
  });
  const [cover, setCover] = useState<MediaRef | null>(initial?.cover_media || null);
  const initialSim = initial?.simulation || {};
  const [sim, setSim] = useState({
    enabled: Boolean(initialSim.enabled),
    leaderboard: Boolean(initialSim.leaderboard),
    mission_code: initialSim.mission_code || '',
    alert: initialSim.alert || '',
    scenario: initialSim.scenario || '',
    objective: initialSim.objective || '',
    symptoms: (initialSim.symptoms || []).join(NEWLINE),
    equipment: (initialSim.equipment || []).join(', '),
    skills: (initialSim.skills || []).join(', '),
    xp_reward: initialSim.xp_reward ? String(initialSim.xp_reward) : '',
  });
  const setSimField = (key: keyof typeof sim, value: string | boolean) => setSim((current) => ({ ...current, [key]: value }));
  const [coverState, setCoverState] = useState<{ uploading: boolean; error?: string }>({ uploading: false });
  const [useAI, setUseAI] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const uploadCover = async (file: File | undefined) => {
    if (!file || !values.machine_id) return;
    setCoverState({ uploading: true });
    try {
      const asset = await decisionTreeApi.uploadMachineMedia(values.machine_id, file, `${values.title || 'Decision tree'} cover`);
      if (asset.kind !== 'image') throw new Error('The cover must be an image.');
      setCover(asset);
      setCoverState({ uploading: false });
    } catch (err) {
      setCoverState({ uploading: false, error: err instanceof Error ? err.message : 'Upload failed' });
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        title: values.title.trim(),
        machine_id: values.machine_id || null,
        problem_category: values.problem_category.trim(),
        description: values.description.trim() || null,
        difficulty: values.difficulty,
        severity: values.severity,
        tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        estimated_minutes: values.estimated_minutes ? Number(values.estimated_minutes) : null,
        cover_media_id: cover?.id || null,
        simulation: {
          enabled: sim.enabled,
          leaderboard: sim.leaderboard,
          mission_code: sim.mission_code.trim() || undefined,
          alert: sim.alert.trim() || undefined,
          scenario: sim.scenario.trim() || undefined,
          objective: sim.objective.trim() || undefined,
          symptoms: sim.symptoms.split(NEWLINE).map((item) => item.trim()).filter(Boolean),
          equipment: sim.equipment.split(',').map((item) => item.trim()).filter(Boolean),
          skills: sim.skills.split(',').map((item) => item.trim()).filter(Boolean),
          xp_reward: sim.xp_reward ? Number(sim.xp_reward) : undefined,
        },
      }, useAI ? aiPrompt.trim() || values.description.trim() || values.title.trim() : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision tree.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label={initial ? 'Edit tree details' : 'Create decision tree'} className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className={label}>Machine</span>
        <select required value={values.machine_id} onChange={(e) => set('machine_id', e.target.value)} className={field}>
          <option value="">Select a machine</option>
          {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={label}>Problem category</span>
        <input required minLength={2} list="dt-categories" value={values.problem_category} onChange={(e) => set('problem_category', e.target.value)} placeholder="Mechanical" className={field} />
        <datalist id="dt-categories">{PROBLEM_CATEGORIES.map((category) => <option key={category} value={category} />)}</datalist>
      </label>
      <label className="block md:col-span-2">
        <span className={label}>Decision tree title</span>
        <input required minLength={3} value={values.title} onChange={(e) => set('title', e.target.value)} placeholder="Unusual machine vibration" className={field} />
      </label>
      <label className="block md:col-span-2">
        <span className={label}>Problem description</span>
        <textarea rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} placeholder="What the operator notices and when it happens" className={`${field} resize-y`} />
      </label>
      <fieldset>
        <legend className={label}>Difficulty</legend>
        <div className="flex flex-wrap gap-1.5">
          {DIFFICULTIES.map((difficulty) => (
            <label key={difficulty} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 transition ${values.difficulty === difficulty ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>
              <input type="radio" name="difficulty" value={difficulty} checked={values.difficulty === difficulty} onChange={() => set('difficulty', difficulty)} className="sr-only" />
              {difficulty.toLowerCase()}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={label}>Severity</legend>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((severity) => (
            <label key={severity} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 transition ${values.severity === severity ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>
              <input type="radio" name="severity" value={severity} checked={values.severity === severity} onChange={() => set('severity', severity)} className="sr-only" />
              {severity.toLowerCase()}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className={label}>Tags</span>
        <input value={values.tags} onChange={(e) => set('tags', e.target.value)} placeholder="gantry, bearings" className={field} />
      </label>
      <label className="block">
        <span className={label}>Estimated duration (minutes)</span>
        <input type="number" min={1} max={600} value={values.estimated_minutes} onChange={(e) => set('estimated_minutes', e.target.value)} className={field} />
      </label>
      <div className="md:col-span-2">
        <span className={label}>Cover image (optional)</span>
        <div className="flex items-center gap-3">
          {cover ? (
            <span className="relative">
              <img src={getApiUrl(`${cover.url}?inline=true`)} alt="Cover preview" className="h-16 w-24 rounded-xl object-cover ring-1 ring-slate-200" />
              <button type="button" aria-label="Remove cover image" onClick={() => setCover(null)} className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 shadow ring-1 ring-slate-200"><X className="h-3.5 w-3.5" /></button>
            </span>
          ) : null}
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-blue-400 ${!values.machine_id ? 'pointer-events-none opacity-50' : ''}`}>
            {coverState.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {cover ? 'Replace image' : 'Upload image'}
            <input type="file" accept="image/*" className="sr-only" disabled={!values.machine_id} onChange={(e) => void uploadCover(e.target.files?.[0])} />
          </label>
          {!values.machine_id && <span className="text-xs text-slate-400">Choose a machine first.</span>}
          {coverState.error && <span role="alert" className="text-xs text-rose-600">{coverState.error}</span>}
        </div>
      </div>
      <details className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 md:col-span-2" open={sim.enabled}>
        <summary className="cursor-pointer text-sm font-semibold text-amber-900">Training simulation (Mission Control)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
            <input type="checkbox" checked={sim.enabled} onChange={(e) => setSimField('enabled', e.target.checked)} className="h-4 w-4 accent-amber-600" />
            Offer this tree to trainees as a troubleshooting mission once published
          </label>
          <label className="block"><span className={label}>Mission code</span>
            <input value={sim.mission_code} onChange={(e) => setSimField('mission_code', e.target.value)} placeholder="CT-014" className={field} /></label>
          <label className="block"><span className={label}>Alert headline</span>
            <input value={sim.alert} onChange={(e) => setSimField('alert', e.target.value)} placeholder="Unexpected image noise detected" className={field} /></label>
          <label className="block md:col-span-2"><span className={label}>Scenario briefing</span>
            <textarea rows={3} value={sim.scenario} onChange={(e) => setSimField('scenario', e.target.value)} placeholder="What the trainee is told when the mission starts" className={`${field} resize-y`} /></label>
          <label className="block md:col-span-2"><span className={label}>Objective</span>
            <input value={sim.objective} onChange={(e) => setSimField('objective', e.target.value)} placeholder="Identify the likely cause and select the correct corrective procedure" className={field} /></label>
          <label className="block"><span className={label}>Reported symptoms (one per line)</span>
            <textarea rows={3} value={sim.symptoms} onChange={(e) => setSimField('symptoms', e.target.value)} className={`${field} resize-y`} /></label>
          <div className="space-y-3">
            <label className="block"><span className={label}>Available equipment</span>
              <input value={sim.equipment} onChange={(e) => setSimField('equipment', e.target.value)} placeholder="Vibration meter, torque wrench" className={field} /></label>
            <label className="block"><span className={label}>Skills tested</span>
              <input value={sim.skills} onChange={(e) => setSimField('skills', e.target.value)} placeholder="Vibration analysis, safety isolation" className={field} /></label>
          </div>
          <label className="block"><span className={label}>XP reward (default by difficulty)</span>
            <input type="number" min={1} max={5000} value={sim.xp_reward} onChange={(e) => setSimField('xp_reward', e.target.value)} className={field} /></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={sim.leaderboard} onChange={(e) => setSimField('leaderboard', e.target.checked)} className="h-4 w-4 accent-amber-600" />
            Show a leaderboard for this mission
          </label>
          <p className="text-xs text-amber-800/80 md:col-span-2">In the builder, mark each answer's simulation outcome and add the evidence trainees discover. Nothing is invented for trainees — they only see what you author.</p>
        </div>
      </details>
      {allowAIDraft && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-violet-900">
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} className="h-4 w-4 accent-violet-600" />
            Draft the first version with the AI assistant
          </label>
          {useAI && (
            <textarea rows={2} value={aiPrompt} onChange={(e) => setAIPrompt(e.target.value)} aria-label="AI drafting instructions"
              placeholder="e.g. Create a troubleshooting tree for unusual vibration in a CT scanner"
              className="mt-3 w-full rounded-xl border border-violet-200 bg-white p-3 text-sm focus:border-violet-500 focus:outline-none" />
          )}
          <p className="mt-2 text-xs text-violet-800/80">The AI uses approved knowledge for this machine. Everything it creates stays a draft that you review and edit before submitting.</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700 md:col-span-2">{error}</p>}
      <div className="flex items-center gap-2 md:col-span-2">
        <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
      </div>
    </form>
  );
};
