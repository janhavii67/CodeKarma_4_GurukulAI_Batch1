import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const INDUSTRIES = ['Medical Equipment', 'Precision Manufacturing', 'Industrial Services', 'Energy & Utilities', 'Other'];
const INTERESTS = ['Knowledge Capture', 'AI Assistant', 'Training Programs', 'Sound Diagnostics', 'Full Platform'];

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export const ContactModal: React.FC<Props> = ({ open, onClose }) => {
  const [form, setForm] = useState({ name: '', email: '', org: '', industry: '', interest: '', message: '' });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  if (!open) return null;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const errs: Partial<typeof form> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) errs.email = 'Valid work email required';
    if (!form.org.trim()) errs.org = 'Required';
    if (!form.industry) errs.industry = 'Please select';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitState('submitting');
    // Simulate network delay – no real submission
    setTimeout(() => setSubmitState('success'), 1500);
  };

  const inputCls = (key: keyof typeof form) =>
    `w-full px-3.5 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800 dark:text-white transition-colors ${
      errors[key]
        ? 'border-red-400 focus:border-red-500'
        : 'border-slate-200 dark:border-slate-700 focus:border-brand-500 dark:focus:border-brand-400'
    } outline-none focus:ring-2 focus:ring-brand-500/20`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Get started with Gurukul AI"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="font-bold text-slate-900 dark:text-white text-lg">Get Started with Gurukul AI</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6">
          {submitState === 'success' ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Thank you!</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm">Your details have been received. We'll be in touch shortly.</p>
              <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors">
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Name *</label>
                  <input value={form.name} onChange={set('name')} className={inputCls('name')} placeholder="Your name" />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Email *</label>
                  <input type="email" value={form.email} onChange={set('email')} className={inputCls('email')} placeholder="you@company.com" />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Organisation *</label>
                <input value={form.org} onChange={set('org')} className={inputCls('org')} placeholder="Your organisation" />
                {errors.org && <p className="text-red-500 text-xs mt-1">{errors.org}</p>}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Industry *</label>
                  <div className="relative">
                    <select value={form.industry} onChange={set('industry')} className={`${inputCls('industry')} appearance-none pr-8`}>
                      <option value="">Select…</option>
                      {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  {errors.industry && <p className="text-red-500 text-xs mt-1">{errors.industry}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Area of interest</label>
                  <div className="relative">
                    <select value={form.interest} onChange={set('interest')} className={`${inputCls('interest')} appearance-none pr-8`}>
                      <option value="">Select…</option>
                      {INTERESTS.map(i => <option key={i}>{i}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Message (optional)</label>
                <textarea value={form.message} onChange={set('message')} rows={3} className={inputCls('message')} placeholder="Tell us about your knowledge management needs…" />
              </div>

              <button
                type="submit"
                disabled={submitState === 'submitting'}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-500 to-cyan-500 hover:shadow-lg hover:shadow-brand-500/25 transition-all disabled:opacity-60"
              >
                {submitState === 'submitting' ? 'Submitting…' : 'Submit'}
              </button>
              <p className="text-[10px] text-slate-400 text-center">No spam. No obligation. Illustrative form for demonstration purposes.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

