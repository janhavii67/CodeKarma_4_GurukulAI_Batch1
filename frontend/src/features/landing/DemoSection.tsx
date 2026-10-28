import React, { useState } from 'react';
import { AI_DEMO_MESSAGES, CAPTURE_STEPS, TROUBLESHOOTING_TREE } from './demoData';
import { Bot, FileText, Wrench, Volume2, CheckCircle, AlertTriangle, Play, Pause } from 'lucide-react';

/* ---- AI Assistant Demo ---- */
const AIAssistantDemo: React.FC = () => {
  const [showSources, setShowSources] = useState(false);
  const msg = AI_DEMO_MESSAGES[1];

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-100 dark:bg-slate-700/60 p-3 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-slate-400 dark:bg-slate-500" />
          <span className="font-medium text-slate-600 dark:text-slate-300 text-xs">Technician</span>
        </div>
        <p className="text-slate-700 dark:text-slate-200">{AI_DEMO_MESSAGES[0].text}</p>
      </div>

      <div className="rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800 p-3 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center">
            <Bot className="w-3 h-3 text-white" />
          </div>
          <span className="font-medium text-brand-700 dark:text-brand-300 text-xs">Gurukul AI Assistant</span>
          <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">Expert-reviewed</span>
        </div>
        <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
          Based on the approved service procedure (Rev 4, §3.2), the gradient coil mounting bolts require{' '}
          <strong className="text-brand-600 dark:text-brand-400">42 N·m ± 2 N·m</strong> using a calibrated torque wrench. Apply in a star pattern. Always verify with the current machine-specific procedure before working on live equipment.
        </p>
        <button
          onClick={() => setShowSources(s => !s)}
          className="mt-2 text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
        >
          {showSources ? 'Hide' : 'View'} {msg.sources!.length} sources →
        </button>
        {showSources && (
          <div className="mt-2 space-y-1.5">
            {msg.sources!.map(s => (
              <div key={s.id} className="flex items-start gap-2 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-700">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-slate-800 dark:text-white">{s.title}</p>
                  <p className="text-[10px] text-slate-400">{s.section}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-400 italic">
        ⚠ Illustrative demo. Not connected to a live knowledge base.
      </p>
    </div>
  );
};

/* ---- Capture Demo ---- */
const CaptureDemo: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 mb-3">
        {['PDF', 'Audio', 'Video', 'Text'].map(t => (
          <button key={t} className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-500 hover:text-brand-500 transition-colors">
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {CAPTURE_STEPS.map((step, i) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(i)}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl border text-sm transition-all ${
              i <= activeStep
                ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              i < activeStep ? 'bg-emerald-500 text-white' : i === activeStep ? 'bg-brand-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
            }`}>
              {i < activeStep ? '✓' : i + 1}
            </div>
            <div>
              <span className="font-semibold">{step.label}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-1.5">{step.description}</span>
            </div>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 italic">Simulated processing – not connected to a live backend.</p>
    </div>
  );
};

/* ---- Troubleshooting Demo ---- */
const TroubleshootingDemo: React.FC = () => {
  const [stepIdx, setStepIdx] = useState(0);
  const step = TROUBLESHOOTING_TREE.steps[stepIdx];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{TROUBLESHOOTING_TREE.symptom}</span>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Step {stepIdx + 1} of {TROUBLESHOOTING_TREE.steps.length}</span>
          <div className="flex gap-1">
            {TROUBLESHOOTING_TREE.steps.map((_, i) => (
              <div key={i} className={`w-6 h-1 rounded-full ${i <= stepIdx ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
            ))}
          </div>
        </div>
        <h4 className="font-bold text-slate-900 dark:text-white mb-1 text-sm">{step.label}</h4>
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">{step.description}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {step.references.map(r => (
            <span key={r} className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md">{r}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStepIdx(i => Math.max(0, i - 1))} disabled={stepIdx === 0} className="flex-1 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            ← Back
          </button>
          <button onClick={() => setStepIdx(i => Math.min(TROUBLESHOOTING_TREE.steps.length - 1, i + 1))} disabled={stepIdx === TROUBLESHOOTING_TREE.steps.length - 1} className="flex-1 py-1.5 text-xs rounded-lg bg-brand-500 text-white disabled:opacity-40 hover:bg-brand-600 transition-colors">
            Next →
          </button>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 italic">Illustrative decision tree – not a substitute for qualified technician assessment.</p>
    </div>
  );
};

/* ---- Sound Demo ---- */
const SoundDemo: React.FC = () => {
  const [playing, setPlaying] = useState(false);
  const genWave = (offset = 0, amp = 1) =>
    Array.from({ length: 80 }, (_, i) => {
      const x = (i / 79) * 400;
      const y = 30 + amp * 20 * Math.sin(i * 0.3 + offset) * Math.sin(i * 0.07 + offset);
      return `${x},${y}`;
    }).join(' ');

  return (
    <div className="space-y-3">
      {[
        { label: 'Reference (approved)', color: '#1976D2', wave: genWave(0, 1), note: 'Normal spindle operation · Expert verified' },
        { label: 'Uploaded recording', color: '#06b6d4', wave: genWave(1.2, 1.3), note: 'Similarity: 87% · Possible variance detected' },
      ].map(track => (
        <div key={track.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{track.label}</span>
            <button
              onClick={() => setPlaying(p => !p)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white"
              style={{ background: track.color }}
            >
              {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
            </button>
          </div>
          <svg viewBox="0 0 400 60" className="w-full h-12">
            <polyline points={track.wave} fill="none" stroke={track.color} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-[10px] text-slate-400 mt-1">{track.note}</p>
        </div>
      ))}
      <p className="text-[10px] text-slate-400 italic">
        ⚠ Similarity score is not a fault diagnosis. Illustrative waveforms only — no audio is playing.
      </p>
    </div>
  );
};

/* ---- Tab bar + switcher ---- */
const TABS = [
  { id: 'ai', label: 'AI Assistant', icon: Bot },
  { id: 'capture', label: 'Knowledge Capture', icon: FileText },
  { id: 'troubleshoot', label: 'Troubleshooting', icon: Wrench },
  { id: 'sound', label: 'Sound Intelligence', icon: Volume2 },
];

export const DemoSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState('ai');

  return (
    <section id="demos" className="py-24 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
            Product Demonstration Lab
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Explore illustrative product demonstrations. Clearly simulated — not connected to a live system.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          {/* Tab bar */}
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Demo panel */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 min-h-[320px]">
            {activeTab === 'ai' && <AIAssistantDemo />}
            {activeTab === 'capture' && <CaptureDemo />}
            {activeTab === 'troubleshoot' && <TroubleshootingDemo />}
            {activeTab === 'sound' && <SoundDemo />}
          </div>
        </div>
      </div>
    </section>
  );
};

