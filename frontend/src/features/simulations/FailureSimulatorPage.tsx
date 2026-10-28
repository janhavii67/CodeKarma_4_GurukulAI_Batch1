import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, CircleHelp, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { simulationApi } from './api';
import { useAuth } from '../../hooks/useAuth';

const EXAMPLE = {
  title: 'Out-of-tolerance part: first response',
  description: 'Practice following the approved inspection and escalation sequence for a dimensional nonconformance.',
  operation: 'Dimensional inspection', machine_id: null, difficulty: 'BEGINNER',
  initial_situation: 'A measured part dimension is outside the tolerance documented in the applicable inspection plan. This is a simulated training situation.',
  learning_objectives: ['Follow the documented containment and verification sequence', 'Use approved evidence before selecting a corrective action'],
  prerequisites: [], safety_precautions: ['Follow the approved site procedure and consult a supervisor if the situation is unclear.'],
  start_decision_id: 'inspect', source_version_ids: ['REPLACE_WITH_PUBLISHED_KNOWLEDGE_VERSION_ID'],
  related_workflow_ids: [], related_troubleshooting_ids: [],
  decision_points: [
    { id: 'inspect', situation: 'What should you do first?', evidence: ['The measurement is outside the documented tolerance.'], choices: [
      { id: 'verify', label: 'Verify the measurement using the approved inspection method.', consequence: 'The measurement is checked against the documented method.', observation: 'The result remains outside tolerance.', explanation: 'This follows the approved verification step before disposition.', next_decision_id: 'contain', terminal: false, preferred: true, safety_critical: false, source_refs: ['REPLACE_WITH_PUBLISHED_KNOWLEDGE_VERSION_ID'] },
      { id: 'adjust', label: 'Change the machine setting immediately.', consequence: 'The simulation stops this unsupported action.', observation: 'No machine setting is provided by this scenario.', explanation: 'The approved sources do not authorize changing machine settings based only on this observation.', next_decision_id: null, terminal: true, preferred: false, safety_critical: true, source_refs: ['REPLACE_WITH_PUBLISHED_KNOWLEDGE_VERSION_ID'] },
    ] },
    { id: 'contain', situation: 'The result remains outside tolerance. What next?', evidence: ['The approved inspection method confirms the deviation.'], choices: [
      { id: 'escalate', label: 'Follow the documented nonconformance and escalation process.', consequence: 'The issue is routed for qualified review.', observation: 'The simulation ends with escalation recorded.', explanation: 'The scenario sources support escalation; they do not specify an undocumented adjustment.', next_decision_id: null, terminal: true, preferred: true, safety_critical: false, source_refs: ['REPLACE_WITH_PUBLISHED_KNOWLEDGE_VERSION_ID'] },
      { id: 'release', label: 'Release the part without review.', consequence: 'The simulation records an inappropriate disposition.', observation: 'The deviation remains unresolved.', explanation: 'The documented process requires review for a confirmed out-of-tolerance result.', next_decision_id: null, terminal: true, preferred: false, safety_critical: true, source_refs: ['REPLACE_WITH_PUBLISHED_KNOWLEDGE_VERSION_ID'] },
    ] },
  ],
};

export const FailureSimulatorPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [approvedSources, setApprovedSources] = useState<any[]>([]);
  const [sourceQuery, setSourceQuery] = useState('');
  const [active, setActive] = useState<any | null>(null);
  const [scenario, setScenario] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [draftText, setDraftText] = useState(JSON.stringify(EXAMPLE, null, 2));
  const [draftId, setDraftId] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [reportText, setReportText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAuthoring, setShowAuthoring] = useState(false);

  const reload = async () => {
    const [s, runs] = await Promise.all([simulationApi.scenarios(search), simulationApi.sessions()]);
    setScenarios(s); setSessions(runs);
  };
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [search]);

  const decide = async (choiceId: string) => {
    if (!active) return;
    setBusy(true); setError('');
    try { const result = await simulationApi.decide(active.id, choiceId); setActive(result.session); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const start = async (scenarioId: string) => {
    setBusy(true); setError('');
    try { const run = await simulationApi.start(scenarioId); setActive(run); setScenario({ title: run.scenario_title, description: run.scenario_description, revision_no: run.revision_no }); await reload(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const resume = async (id: string) => {
    try { const run = await simulationApi.session(id); setActive(run); setScenario({ title: run.scenario_title, description: run.scenario_description, revision_no: run.revision_no }); setError(''); }
    catch (e) { setError(String(e)); }
  };
  const saveDraft = async () => {
    setError(''); setNotice('');
    try {
      const content = JSON.parse(draftText);
      const result = draftId ? await simulationApi.updateDraft(draftId, content) : await simulationApi.createDraft(content);
      setDraftId(result.revision_id); setDraftStatus(result.status); setNotice(`Draft revision ${result.revision_no} saved.`);
      setDrafts(await simulationApi.drafts());
    } catch (e) { setError(e instanceof SyntaxError ? 'Scenario JSON is invalid. Check the editor format.' : String(e)); }
  };
  const submitDraft = async () => {
    if (!draftId) return;
    try { const result = await simulationApi.submitDraft(draftId); setDraftStatus(result.status); setNotice('Submitted for independent expert review.'); setDrafts(await simulationApi.drafts()); }
    catch (e) { setError(String(e)); }
  };
  const beginRevision = async (scenarioId: string) => {
    try {
      const current = await simulationApi.scenarioForAuthoring(scenarioId);
      const created = await simulationApi.createRevision(scenarioId, current.content);
      setDraftId(created.revision_id); setDraftStatus(created.status); setDraftText(JSON.stringify(current.content, null, 2));
      setShowAuthoring(true); setDrafts(await simulationApi.drafts()); setNotice(`Revision ${created.revision_no} created as a draft.`);
    } catch (e) { setError(String(e)); }
  };
  const searchSources = async (q: string) => {
    setSourceQuery(q);
    try { setApprovedSources(await simulationApi.knowledgeSources(q)); }
    catch (e) { setError(String(e)); }
  };
  const activeDecisionIndex = active ? active.decisions.length + (active.status === 'in_progress' ? 1 : 0) : 0;
  const sourceById = useMemo(() => new Map((active?.source_refs || []).map((r: any) => [r.version_id, r])), [active]);

  return <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Module 09 · Failure Simulator</p><h1 className="text-2xl font-bold text-slate-900">Practice decisions safely</h1><p className="text-sm text-slate-600 mt-1">Training scenarios are simulated. They do not operate equipment or certify practical skill.</p></div>
      <Button variant="secondary" onClick={() => { setActive(null); setScenario(null); }}>Scenario library</Button>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

    {active ? <div className="space-y-4">
      <div className="flex items-center justify-between"><Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => { setActive(null); setScenario(null); }}>Back to scenarios</Button><span className="text-xs font-medium text-slate-500">SIMULATION ONLY · Revision {scenario?.revision_no}</span></div>
      <Card title={scenario?.title || 'Simulation session'} subtitle={`${scenario?.description || ''} · ${active.status === 'in_progress' ? `Decision ${activeDecisionIndex} of ${active.progress?.total || activeDecisionIndex}` : 'Session summary'}`}>
        {active.status === 'in_progress' && <div className="mb-4"><div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, (active.progress?.completed || 0) / Math.max(1, active.progress?.total || 1) * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-500">{active.progress?.completed || 0} decisions recorded · simulated progress only</p></div>}
        {active.blocked_reason && <div role="alert" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{active.blocked_reason}</div>}
        {(active.source_refs || []).length > 0 && <div className="mb-4 flex flex-wrap gap-2">{active.source_refs.map((ref: any) => <span key={ref.version_id} className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-800"><BookOpen className="w-3 h-3"/>{ref.title} · v{ref.version_no}</span>)}</div>}
        {active.status === 'in_progress' ? <>
          {active.current_decision && <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4"><h2 className="font-semibold text-slate-900">Current situation</h2><p className="mt-2 text-sm text-slate-700">{active.current_decision.situation}</p>{active.current_decision.evidence?.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">{active.current_decision.evidence.map((item: string) => <li key={item}>{item}</li>)}</ul>}</div>
            <h3 className="font-semibold text-slate-900">Choose your next action</h3>
            <div className="grid gap-2">{active.current_decision.choices.map((choice: any) => <button key={choice.id} disabled={busy} onClick={() => decide(choice.id)} className="text-left rounded-lg border border-slate-200 p-4 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-60 focus:ring-2 focus:ring-blue-500"><span className="font-medium text-sm text-slate-900">{choice.label}</span></button>)}</div>
          </div>}
        </> : <div className="space-y-4"><div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900"><strong>Learning review</strong><p>{active.report?.notice}</p></div><p className="text-sm text-slate-600">Preferred decisions: {active.report?.preferred_decisions} of {active.report?.decisions_made}. Safety critical errors: {active.report?.safety_critical_errors}. This is formative feedback only; there is no competency score.</p></div>}
        {active.decisions?.length > 0 && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold text-slate-900">Decision feedback</h3>{active.decisions.map((d: any, i: number) => <div key={`${d.decision_id}-${i}`} className={`rounded-lg border p-3 ${d.preferred ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-xs text-slate-500">{d.decision_id}</p><p className="text-sm font-medium mt-1">{d.choice_label}</p><p className="text-sm mt-2">{d.consequence}</p>{d.observation && <p className="text-sm text-slate-700 mt-1">Simulated observation: {d.observation}</p>}<p className="text-sm text-slate-700 mt-1">{d.explanation}</p><p className="mt-2 text-xs font-semibold">{d.preferred ? 'Documented preferred decision' : 'Not the preferred documented decision'}{d.safety_critical && !d.preferred ? ' · Safety critical' : ''}</p><div className="flex flex-wrap gap-2 mt-2">{(d.source_refs || []).map((id: string) => { const src: any = sourceById.get(id); return src && <span key={id} className="inline-flex gap-1 items-center text-xs text-blue-700"><BookOpen className="w-3 h-3" />{src.title} · v{src.version_no}</span>; })}</div></div>)}</div>}
        {active.safety_precautions?.length > 0 && <div className="border-t pt-3"><h3 className="text-sm font-semibold flex gap-2 items-center"><ShieldCheck className="w-4 h-4 text-emerald-700"/>Approved safety notes</h3><ul className="list-disc pl-5 mt-2 text-sm text-slate-600">{active.safety_precautions.map((v: string) => <li key={v}>{v}</li>)}</ul></div>}
        {(active.related_workflow_ids?.length > 0 || active.related_troubleshooting_ids?.length > 0) && <div className="border-t pt-3"><h3 className="text-sm font-semibold">Related approved resources</h3><p className="text-xs text-slate-500 mt-1">Opening these resources does not complete a real procedure or create a troubleshooting case.</p><div className="mt-2 flex flex-wrap gap-3">{active.related_workflow_ids?.length > 0 && <a className="text-sm text-blue-700 underline" href="/app/guided-workflows">View related workflow</a>}{active.related_troubleshooting_ids?.length > 0 && <a className="text-sm text-blue-700 underline" href="/app/troubleshooting">View related troubleshooting</a>}</div></div>}
        {active.status === 'in_progress' && <div className="border-t pt-4 flex flex-wrap gap-3"><Button variant="secondary" icon={<RotateCcw className="w-4 h-4" />} onClick={async () => { const next = await simulationApi.restart(active.id); setActive(next); setScenario({ title: next.scenario_title, description: next.scenario_description, revision_no: next.revision_no }); }}>Restart scenario</Button><div className="flex gap-2 flex-1 min-w-[250px]"><input value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder="Report unclear or incorrect content" className="flex-1 min-w-0 rounded border px-3 text-sm"/><Button variant="outline" icon={<CircleHelp className="w-4 h-4" />} disabled={reportText.trim().length < 3} onClick={async () => { await simulationApi.report(active.id, reportText, active.current_decision_id); setReportText(''); setNotice('Report submitted for expert review.'); }}>Report</Button></div></div>}
      </Card>
    </div> : <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
      <div className="space-y-4"><div className="flex gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search published scenarios" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></div>
        {scenarios.map((item) => <Card key={item.id} title={item.title} subtitle={`${item.operation || 'Manufacturing scenario'} · ${item.difficulty} · Revision ${item.revision_no}`}><p className="text-sm text-slate-600">{item.description}</p><ul className="list-disc pl-5 my-3 text-sm text-slate-600">{item.learning_objectives.map((o: string) => <li key={o}>{o}</li>)}</ul><div className="flex flex-wrap gap-2"><Button icon={<Play className="w-4 h-4" />} disabled={busy} onClick={() => start(item.id)}>Start simulation</Button>{hasPermission('knowledge.create') && <Button variant="secondary" onClick={() => beginRevision(item.id)}>Create revision</Button>}</div></Card>)}
        {scenarios.length === 0 && <Card title="No published scenarios yet"><p className="text-sm text-slate-600">An authorized expert can create a scenario draft grounded in published knowledge, then submit it for independent review.</p></Card>}
        {sessions.filter((s) => s.status === 'in_progress').length > 0 && <Card title="Resume a simulation"><div className="space-y-2">{sessions.filter((s) => s.status === 'in_progress').map((s) => <button key={s.id} className="block w-full text-left text-sm text-blue-700 underline" onClick={() => resume(s.id)}>Resume · {s.scenario_title || s.scenario_id.slice(0, 8)}</button>)}</div></Card>}
        {sessions.filter((s) => s.status === 'completed').length > 0 && <Card title="Review past sessions"><div className="space-y-2">{sessions.filter((s) => s.status === 'completed').slice(0, 10).map((s) => <button key={s.id} className="block w-full text-left text-sm text-blue-700 underline" onClick={() => resume(s.id)}>Review · {s.scenario_title || s.scenario_id.slice(0, 8)}</button>)}</div></Card>}
      </div>
      <div className="space-y-4">{hasPermission('knowledge.create') && <Card title="Scenario authoring" subtitle="Authorized experts can author documented scenario branches."><p className="text-sm text-slate-600">Drafts require published knowledge version IDs for citations and independent reviewer approval before operators can discover them.</p><Button className="mt-3" variant="secondary" onClick={async () => { try { setDrafts(await simulationApi.drafts()); if (!showAuthoring) setApprovedSources(await simulationApi.knowledgeSources()); setShowAuthoring(!showAuthoring); } catch (e) { setError(String(e)); } }}>{showAuthoring ? 'Close authoring' : 'Open authoring tools'}</Button>{showAuthoring && <div className="mt-4 space-y-3"><Card title="Published source revisions" subtitle="Use these approved version IDs in source_version_ids and choice source_refs."><input value={sourceQuery} onChange={(e) => searchSources(e.target.value)} placeholder="Search approved knowledge" className="w-full rounded border px-2 py-1 text-sm"/><div className="mt-2 max-h-40 overflow-y-auto space-y-1">{approvedSources.map((s) => <button type="button" key={s.version_id} onClick={() => navigator.clipboard?.writeText(s.version_id)} className="block w-full text-left rounded bg-slate-50 p-2 text-xs hover:bg-blue-50"><span className="font-medium">{s.title} · v{s.version_no}</span><code className="block break-all text-slate-500">{s.version_id}</code>{s.summary && <span className="block text-slate-600">{s.summary}</span>}</button>)}</div></Card><label htmlFor="scenario-json" className="text-xs font-semibold text-slate-700">Scenario definition (JSON)</label><textarea id="scenario-json" value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={18} readOnly={draftStatus === 'in_review' || draftStatus === 'published' || draftStatus === 'rejected'} className="w-full rounded border p-2 font-mono text-xs read-only:bg-slate-50"/><div className="flex flex-wrap gap-2"><Button size="sm" disabled={draftStatus === 'in_review' || draftStatus === 'published' || draftStatus === 'rejected'} onClick={saveDraft}>Save draft</Button>{draftId && (draftStatus === 'draft' || draftStatus === 'changes_requested') && <Button size="sm" variant="secondary" onClick={submitDraft}>Submit for review</Button>}</div><p className="text-xs text-slate-500">Use published knowledge revision IDs. The server checks citations, transitions, loops, and reachability before accepting a draft.</p>{drafts.map((d) => <div key={d.id} className="border-t pt-2"><button onClick={async () => { try { const loaded = await simulationApi.draft(d.id); setDraftId(d.id); setDraftStatus(loaded.status); setDraftText(JSON.stringify(loaded.content, null, 2)); } catch (e) { setError(String(e)); } }} className="block text-left text-xs text-blue-700">{d.title} · revision {d.revision_no} · {d.status}</button>{d.status === 'in_review' && hasPermission('knowledge.approve') && <div className="mt-1 flex gap-2"><Button size="sm" onClick={async () => { try { await simulationApi.publishDraft(d.id); setNotice('Reviewed and published the scenario revision.'); setDrafts(await simulationApi.drafts()); await reload(); } catch (e) { setError(String(e)); } }}>Publish</Button><Button size="sm" variant="outline" onClick={async () => { const comments = window.prompt('What changes should the author make?'); if (!comments) return; try { await simulationApi.reviewDraft(d.id, 'REJECTED', comments); setNotice('Changes requested from the author.'); setDrafts(await simulationApi.drafts()); } catch (e) { setError(String(e)); } }}>Reject revision</Button></div>}</div>)}</div>}</Card>}
        <Card title="Learning objectives"><p className="text-sm text-slate-600">Practice applying approved procedures and escalation logic. Simulated decisions are kept separate from actual workflows and troubleshooting cases.</p><div className="mt-3 flex items-center gap-2 text-xs text-emerald-800"><CheckCircle2 className="w-4 h-4"/>No live machine connection</div><div className="mt-2 flex items-center gap-2 text-xs text-amber-800"><AlertTriangle className="w-4 h-4"/>Training does not establish operator qualification</div></Card>
      </div>
    </div>}
  </div>;
};
