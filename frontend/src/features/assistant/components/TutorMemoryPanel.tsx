import React, { useCallback, useEffect, useState } from 'react';
import { Brain, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
  clearTutorMemories,
  createTutorMemory,
  deleteTutorMemory,
  listTutorMemories,
  updateTutorMemory,
} from '../api';
import type { TutorMemory, TutorMemoryCategory } from '../types';

const categories: { value: TutorMemoryCategory; label: string }[] = [
  { value: 'learning_goal', label: 'Learning goal' },
  { value: 'explanation_preference', label: 'How I like explanations' },
  { value: 'experience', label: 'My experience' },
  { value: 'machine_context', label: 'Machine context' },
  { value: 'other', label: 'Other' },
];

interface TutorMemoryPanelProps {
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

export const TutorMemoryPanel: React.FC<TutorMemoryPanelProps> = ({ onClose, onCountChange }) => {
  const [items, setItems] = useState<TutorMemory[]>([]);
  const [maxItems, setMaxItems] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<TutorMemoryCategory>('learning_goal');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<TutorMemoryCategory>('learning_goal');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listTutorMemories();
      setItems(result.items);
      setMaxItems(result.max_items);
      onCountChange?.(result.items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved memories.');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { void refresh(); }, [refresh]);

  const addMemory = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = newContent.trim();
    if (!content || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await createTutorMemory(newCategory, content);
      const next = [saved, ...items];
      setItems(next);
      setNewContent('');
      onCountChange?.(next.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this memory.');
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (item: TutorMemory) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditCategory(item.category);
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await updateTutorMemory(id, { content: editContent.trim(), category: editCategory });
      const next = items.map((item) => item.id === id ? saved : item);
      setItems(next);
      setEditingId(null);
      onCountChange?.(next.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this memory.');
    } finally {
      setBusy(false);
    }
  };

  const removeMemory = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteTutorMemory(id);
      const next = items.filter((item) => item.id !== id);
      setItems(next);
      if (editingId === id) setEditingId(null);
      onCountChange?.(next.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this memory.');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (busy || !items.length || !window.confirm('Delete all saved Tutor memories?')) return;
    setBusy(true);
    setError('');
    try {
      await clearTutorMemories();
      setItems([]);
      setEditingId(null);
      onCountChange?.(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear saved memories.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutor-memory-title"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700"><Brain className="h-5 w-5" /></div>
            <div>
              <h2 id="tutor-memory-title" className="text-base font-bold text-slate-900">Tutor memory</h2>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-600">
                Save learning goals and explanation preferences so the Tutor can personalize future chats. Memories are private to your account and included in Tutor requests for personalization; they never replace approved machine guidance.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Tutor memory" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          <form onSubmit={addMemory} className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Add a memory</h3>
              <span className="text-[11px] text-slate-500">{items.length} / {maxItems}</span>
            </div>
            <select
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as TutorMemoryCategory)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
              aria-label="Memory category"
            >
              {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
            <textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Example: I’m learning MRI safety and prefer short explanations with a quick recap."
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500">Avoid passwords or sensitive personal details.</span>
              <button type="submit" disabled={busy || !newContent.trim() || items.length >= maxItems} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Save memory
              </button>
            </div>
          </form>

          {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Saved memories</h3>
              {items.length > 0 && <button type="button" disabled={busy} onClick={() => void clearAll()} className="text-[11px] font-semibold text-rose-700 hover:text-rose-800 disabled:opacity-50">Clear all</button>}
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading memories…</div>
            ) : items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-xs text-slate-500">No memories saved yet. Add something you want the Tutor to remember across chats.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <select value={editCategory} onChange={(event) => setEditCategory(event.target.value as TutorMemoryCategory)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800" aria-label="Edit memory category">
                          {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                        </select>
                        <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={500} rows={2} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" aria-label="Edit memory text" />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
                          <button type="button" disabled={busy || !editContent.trim()} onClick={() => void saveEdit(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><Save className="h-3 w-3" /> Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">{categories.find((category) => category.value === item.category)?.label || item.category}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">{item.content}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" disabled={busy} onClick={() => beginEdit(item)} aria-label="Edit memory" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-700 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" disabled={busy} onClick={() => void removeMemory(item.id)} aria-label="Delete memory" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
