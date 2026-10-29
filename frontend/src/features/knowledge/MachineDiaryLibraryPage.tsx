import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Cpu,
  FileText,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  Search,
  Video,
  X,
} from 'lucide-react';
import { ApiClientError, getApiUrl } from '../../lib/api/client';
import type { MediaAsset } from '../knowledge-capture/media/types';
import {
  fetchMachineDiaryAssets,
  fetchMachineDiaryLibrary,
  useMachineDiaryLibrary,
  type MachineDiaryMachine,
} from './machineDiaryApi';
import { isMachineActive } from '../machines/registeredMachines';
import './machineDiary.css';

const bookPalettes = [
  ['#1976D2', '#1976C9', '#125EA3'],
  ['#047857', '#047857', '#065F46'],
];

const displayedKnowledgeCount = (machine: MachineDiaryMachine) =>
  machine.counts.video + machine.counts.image + machine.counts.document + machine.counts.notes;

export const MachineDiaryLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const machineLibraryQuery = useMachineDiaryLibrary();
  const machines = machineLibraryQuery.data ?? [];
  const loading = machineLibraryQuery.isLoading;
  const cause = machineLibraryQuery.error;
  const error = cause instanceof Error ? cause.message : '';
  const sessionExpired = cause instanceof ApiClientError && cause.status === 401;
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('');

  const loadMachines = () => { void machineLibraryQuery.refetch(); };

  const diaryMachines = machines;

  const visibleMachines = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return diaryMachines.filter(machine => {
      const machineCategory = machine.category_name || machine.category || '';
      const searchFields = [machine.name, machine.id, machine.code, machine.model_number,
        machine.serial_number, machine.manufacturer, machineCategory, machine.location];
      return (!query || searchFields.some(value => value?.toLocaleLowerCase().includes(query)))
        && (!machineFilter || machine.id === machineFilter);
    });
  }, [diaryMachines, search, machineFilter]);

  return (
    <main className="diary-page" aria-labelledby="machine-library-title">
      <div className="diary-page-inner">
        <header className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="diary-eyebrow flex items-center gap-2"><BookOpen size={15} /> Field knowledge archive</div>
            <h1 id="machine-library-title" className="diary-heading mt-3">Your Knowledge Library</h1>
            <p className="diary-subtitle mt-3">Every registered machine keeps its own technical diary. Open a volume to browse its videos, photos, documents, and field notes.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-start xl:self-auto">
            <Link to="/app/knowledge-assets?kind=video" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#1976C9]/20 bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#125EA3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976C9]">
              <ClipboardList size={17} /> Capture knowledge
            </Link>
          </div>
        </header>

        <section className="diary-toolbar mt-8 grid gap-3 rounded-2xl p-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:p-4" aria-label="Search machine diaries">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#536779]" size={18} />
            <input className="diary-control w-full pl-11 pr-4 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, machine ID, model, or location…" aria-label="Search machines" />
          </label>
          <label className="sr-only" htmlFor="diary-machine-filter">Filter by machine</label>
          <select id="diary-machine-filter" className="diary-control px-3.5 text-sm" aria-label="Filter by machine" value={machineFilter} onChange={event => setMachineFilter(event.target.value)}>
            <option value="">Choose a machine…</option>
            {machines.map(machine => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
          </select>
        </section>

        {loading && <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-busy="true" aria-label="Loading machine diaries">
          <span className="sr-only">Loading machine knowledge library…</span>
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[19rem] animate-pulse rounded-2xl border border-[#E2E8F0] bg-white" />)}
        </div>}

        {machineLibraryQuery.isError && <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert">
          <p className="font-semibold">The machine library could not be loaded.</p><p className="mt-1 text-sm text-rose-700">{sessionExpired ? 'Your sign-in session has expired. Sign in again to view machine knowledge.' : error || 'Could not load the machine library.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sessionExpired && <Link to="/login" className="inline-flex items-center rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium hover:bg-rose-100">Sign in</Link>}
            <button type="button" onClick={loadMachines} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"><RefreshCw size={15} /> Try again</button>
          </div>
        </div>}

        {!loading && !error && machines.length === 0 && <div className="mt-8 rounded-2xl border border-[#E2E8F0] bg-white px-6 py-14 text-center">
          <Cpu className="mx-auto text-[#1976C9]" size={34} /><h2 className="mt-4 text-xl font-semibold text-[#173B5E]">No registered machines yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#536779]">Machine diaries appear here once equipment is registered. Ask a machine manager to add the equipment before capturing its knowledge.</p>
        </div>}

        {!loading && !error && machines.length > 0 && visibleMachines.length === 0 && <div className="mt-8 rounded-2xl border border-[#E2E8F0] bg-white px-6 py-12 text-center">
          <Search className="mx-auto text-[#536779]" size={28} /><h2 className="mt-3 text-lg font-semibold text-[#173B5E]">No diaries match those filters</h2><p className="mt-1 text-sm text-[#536779]">Try another search or choose one of the available machines.</p>
        </div>}

        {!loading && !error && visibleMachines.length > 0 && <section className="mt-8" aria-label="Machine volumes">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold tracking-wide text-[#173B5E]">MACHINE VOLUMES <span className="ml-2 text-[#536779]">{visibleMachines.length}</span></h2><span className="text-xs text-[#536779]">Select a book to open its archive</span></div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleMachines.map((machine, index) => {
              const [accent, mid, dark] = bookPalettes[index % 2];
              const machineLabel = machine.name;
              return <button key={machine.id} type="button" className="diary-book-button group" onClick={() => navigate(`/app/knowledge/machine/${encodeURIComponent(machine.id)}`)} aria-label={`Open knowledge diary for ${machineLabel}`}>
                <div className="diary-book" style={{ '--book-a': accent, '--book-b': mid, '--book-c': dark } as React.CSSProperties}>
                  <span className="diary-book-spine" aria-hidden="true" /><span className="diary-book-pages" aria-hidden="true" />
                  <div className="diary-book-cover"><div className="diary-book-content">
                    <div className="flex items-start justify-between gap-3"><span className="diary-book-mark"><Cpu size={21} /></span><span className="rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-[.65rem] font-semibold uppercase tracking-[.12em] text-white">{machine.status || 'Registered'}</span></div>
                    <div className="mt-6"><p className="text-[.62rem] font-bold uppercase tracking-[.2em] text-white/60">Machine diary</p><h3 className="diary-book-title mt-2">{machineLabel}</h3><p className="diary-book-meta mt-2 font-mono">{machine.code || machine.model_number || machine.id}</p></div>
                    <div className="mt-auto pt-4"><div className="diary-book-divider border-t" /><div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2">
                      <span className="diary-book-count flex items-center gap-1.5"><Video size={13} /> {machine.counts.video} <span>videos</span></span>
                      <span className="diary-book-count flex items-center gap-1.5"><ImageIcon size={13} /> {machine.counts.image} <span>photos</span></span>
                      <span className="diary-book-count flex items-center gap-1.5"><FileText size={13} /> {machine.counts.document} <span>documents</span></span>
                      <span className="diary-book-count flex items-center gap-1.5"><ClipboardList size={13} /> {machine.counts.notes} <span>notes</span></span>
                    </div><div className="diary-book-link"><span>{displayedKnowledgeCount(machine)} entries</span><ArrowUpRight size={16} /></div></div>
                  </div></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 pl-2 text-left text-xs text-[#536779]">
                  {(machine.category_name || machine.category) && <span>{machine.category_name || machine.category}</span>}
                  {machine.location && <span className="inline-flex items-center gap-1"><MapPin size={12} />{machine.location}</span>}
                  {machine.manufacturer && <span>{machine.manufacturer}</span>}
                </div>
              </button>;
            })}
          </div>
        </section>}
      </div>
    </main>
  );
};

type DiaryFilter = 'all' | 'video' | 'image' | 'document' | 'notes';
type DiaryCategory = Exclude<DiaryFilter, 'all'>;
const diaryTabs: { id: DiaryCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'video', label: 'Videos', icon: <Video size={15} /> },
  { id: 'image', label: 'Photos', icon: <ImageIcon size={15} /> },
  { id: 'document', label: 'Documents', icon: <FileText size={15} /> },
  { id: 'notes', label: 'Notes', icon: <ClipboardList size={15} /> },
];

function assetDate(asset: MediaAsset): string {
  const date = new Date(asset.created_at);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function previewFor(asset: MediaAsset, compact = false) {
  const fileUrl = getApiUrl(`/media/${asset.id}`);
  if (asset.kind === 'image') return <img src={fileUrl} alt={asset.title || asset.original_name} loading="lazy" />;
  if (asset.kind === 'video') return <video src={fileUrl} muted preload="metadata" aria-label={`Video preview: ${asset.title || asset.original_name}`} />;
  const Icon = asset.kind === 'notes' ? ClipboardList : FileText;
  return <div className="flex flex-col items-center gap-2 px-5 text-center">
    <Icon size={compact ? 25 : 34} />
    <span className="max-w-full truncate text-xs text-[#536779]">{asset.kind === 'document' ? (asset.mime === 'application/pdf' ? 'PDF document' : asset.mime) : asset.kind}</span>
  </div>;
}

export const MachineDiaryPage: React.FC = () => {
  const { machineId = '' } = useParams<{ machineId: string }>();
  const [machine, setMachine] = useState<MachineDiaryMachine | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DiaryFilter>('all');
  const [selected, setSelected] = useState<MediaAsset | null>(null);

  const loadDiary = () => {
    setLoading(true);
    setError('');
    Promise.all([
      fetchMachineDiaryLibrary(machineId),
      fetchMachineDiaryAssets(machineId),
    ]).then(([machines, machineAssets]) => {
      setMachine(machines[0] || null);
      // Treat the backend association as authoritative and retain a client-side
      // guard so a malformed response cannot leak another machine's assets.
      const visibleKinds = new Set(['video', 'image', 'document', 'notes']);
      setAssets(machineAssets.filter(asset => asset.machine_id === machineId && visibleKinds.has(asset.kind)));
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load this machine diary.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDiary(); setSelected(null); }, [machineId]);

  const allEntries = useMemo(() => [...assets].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [assets]);
  const counts = useMemo(() => {
    const result: Record<DiaryFilter, number> = { all: 0, video: 0, image: 0, document: 0, notes: 0 };
    allEntries.forEach(asset => {
      result.all += 1;
      if (asset.kind === 'video' || asset.kind === 'image' || asset.kind === 'document' || asset.kind === 'notes') {
        result[asset.kind] += 1;
      }
    });
    return result;
  }, [allEntries]);
  const visibleEntries = allEntries.filter(asset => (filter === 'all' || asset.kind === filter)
    && (!search.trim() || [asset.title, asset.original_name, asset.description, asset.tags, asset.content]
      .some(value => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))));

  const countCards = [
    { label: 'Video', count: machine?.counts.video || 0, Icon: Video },
    { label: 'Photo', count: machine?.counts.image || 0, Icon: ImageIcon },
    { label: 'Document', count: machine?.counts.document || 0, Icon: FileText },
    { label: 'Note', count: machine?.counts.notes || 0, Icon: ClipboardList },
  ];

  const captureHref = `/app/knowledge-assets?kind=video&machine=${encodeURIComponent(machineId)}`;

  return <main className="diary-page diary-opening" aria-labelledby="machine-diary-title">
    <div className="diary-page-inner">
      <nav aria-label="Breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-[#536779]">
        <Link to="/app/knowledge" className="rounded px-1 py-1 hover:text-[#1976C9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1976C9]">Knowledge Library</Link><span aria-hidden="true">/</span><span className="truncate text-[#173B5E]">{machine ? machine.name : 'Machine diary'}</span>
      </nav>

      {loading && <div role="status" aria-live="polite" className="space-y-5"><div className="h-8 w-64 animate-pulse rounded bg-[#E2E8F0]" /><div className="h-5 w-96 max-w-full animate-pulse rounded bg-[#E2E8F0]" /><div className="h-72 animate-pulse rounded-2xl border border-[#E2E8F0] bg-white" /><span className="text-sm text-[#536779]">Loading this machine diary…</span></div>}
      {!loading && error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert"><h1 className="text-xl font-semibold">Could not open this machine diary</h1><p className="mt-2 text-sm text-rose-700">{error}</p><button type="button" onClick={loadDiary} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm hover:bg-rose-100"><RefreshCw size={15} /> Retry</button></div>}
      {!loading && !error && !machine && <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center"><h1 className="text-xl font-semibold text-[#173B5E]">Machine not found</h1><p className="mt-2 text-sm text-[#536779]">This machine may have been removed or is no longer available to your account.</p><Link to="/app/knowledge" className="mt-5 inline-flex rounded-lg border border-[#C8D6E4] px-4 py-2 text-sm text-[#173B5E]">Back to library</Link></div>}

      {!loading && !error && machine && <>
        <header className="flex flex-col gap-5 border-b border-[#E2E8F0] pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="diary-eyebrow flex items-center gap-2"><BookOpen size={15} /> Machine field diary</div><h1 id="machine-diary-title" className="diary-heading mt-3">{machine.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#536779]">
              <span className="font-mono text-[#173B5E]">{machine.code || machine.model_number || machine.id}</span>
              {(machine.category_name || machine.category) && <span>{machine.category_name || machine.category}</span>}
              {machine.manufacturer && <span>{machine.manufacturer}</span>}
              {machine.location && <span className="inline-flex items-center gap-1"><MapPin size={14} />{machine.location}</span>}
            </div>
          </div>
          {isMachineActive(machine) ? <Link to={captureHref} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#1976C9] bg-[#1976C9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#125EA3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976C9] lg:self-auto"><ClipboardList size={16} /> Add to this diary</Link> : <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">This machine is inactive. Existing records remain available; new capture is disabled.</p>}
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Knowledge counts">
          {countCards.map(({ label, count, Icon }) => <div key={label} className="diary-stat flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EFF4FF] text-[#1976C9]"><Icon size={17} /></span><div><div className="text-lg font-semibold leading-tight text-[#173B5E]">{count}</div><div className="text-xs text-[#536779]">{label}{count === 1 ? '' : 's'}</div></div></div>)}
        </section>

        <section className="diary-toolbar mt-7 rounded-2xl p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filter diary entries">
              {diaryTabs.map(tab => <button key={tab.id} type="button" className="diary-tab inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.icon}<span>{tab.label}</span><span className="text-[.68rem] text-[#536779]">{counts[tab.id]}</span></button>)}
            </div>
            <label className="relative block xl:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#536779]" size={16} /><input className="diary-control w-full pl-9 pr-3 text-sm" aria-label="Search this machine diary" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search diary entries…" /></label>
          </div>
        </section>

        {visibleEntries.length === 0 ? <div className="mt-7 rounded-2xl border border-[#E2E8F0] bg-white px-6 py-14 text-center">
          <BookOpen className="mx-auto text-[#1976C9]" size={31} /><h2 className="mt-4 text-lg font-semibold text-[#173B5E]">{allEntries.length === 0 ? 'This diary is ready for its first entry' : search.trim() ? 'No entries match your search' : `No ${diaryTabs.find(tab => tab.id === filter)?.label.toLowerCase() || 'entries'} in this diary yet`}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#536779]">{allEntries.length === 0 ? 'Capture a video, photo, document, or field note and it will be stored with this machine.' : search.trim() ? 'Try another search or choose a different section.' : 'Capture a new entry and it will be stored with this machine.'}</p>
          {allEntries.length === 0 && isMachineActive(machine) && <Link to={captureHref} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125EA3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976C9]"><ClipboardList size={16} /> Capture the first entry</Link>}
        </div> : <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Machine knowledge entries">
          {visibleEntries.map(asset => <article key={`${asset.kind}-${asset.id}`} className="diary-asset">
            <button type="button" className="diary-asset-preview w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-200" onClick={() => setSelected(asset)} aria-label={`Preview ${asset.title || asset.original_name}`}>
              {previewFor(asset, true)}
            </button>
            <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><button type="button" onClick={() => setSelected(asset)} className="block max-w-full truncate text-left text-sm font-semibold text-[#173B5E] hover:text-[#1976C9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1976C9]">{asset.title || asset.original_name}</button><p className="mt-1 truncate text-xs text-[#536779]">{asset.original_name}</p></div><span className="shrink-0 rounded-full border border-[#DCE6F0] bg-[#F8FAFC] px-2 py-1 text-[.65rem] capitalize text-[#536779]">{asset.kind === 'image' ? 'photo' : asset.kind}</span></div>
              {asset.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#536779]">{asset.description}</p>}
              {asset.kind === 'notes' && asset.content && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-[#173B5E]">{asset.content}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 text-[.68rem] text-[#536779]"><span className="inline-flex items-center gap-1"><CalendarDays size={12} />{assetDate(asset)}</span><span>{asset.verification_status || 'Pending review'}</span></div>
            </div>
          </article>)}
        </div>}
      </>}
    </div>

    {selected && <div className="diary-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="diary-modal p-5 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="diary-asset-title" onKeyDown={event => { if (event.key === 'Escape') setSelected(null); }}>
        <header className="mb-5 flex items-start justify-between gap-4"><div className="min-w-0"><p className="diary-eyebrow">{selected.kind === 'image' ? 'Photo' : selected.kind} · {assetDate(selected)}</p><h2 id="diary-asset-title" className="mt-2 break-words text-xl font-semibold text-[#173B5E]">{selected.title || selected.original_name}</h2><p className="mt-1 break-all text-xs text-[#536779]">{selected.original_name}</p></div><button autoFocus type="button" onClick={() => setSelected(null)} aria-label="Close preview" className="rounded-lg p-2 text-[#536779] hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1976C9]"><X size={19} /></button></header>
        {selected.kind === 'video' && <video className="max-h-[62vh] w-full rounded-xl bg-black" controls autoPlay src={getApiUrl(`/media/${selected.id}`)} />}
        {selected.kind === 'image' && <img className="mx-auto max-h-[62vh] max-w-full rounded-xl object-contain" src={getApiUrl(`/media/${selected.id}`)} alt={selected.title || selected.original_name} />}
        {selected.kind === 'document' && <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center"><FileText className="mx-auto text-[#1976C9]" size={38} /><p className="mt-3 text-sm text-[#536779]">{selected.mime === 'application/pdf' ? 'PDF document' : selected.mime}</p><a className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125EA3]" href={getApiUrl(`/media/${selected.id}`)} target="_blank" rel="noreferrer">Open document <ArrowUpRight size={15} /></a></div>}
        {selected.kind === 'notes' && <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5"><p className="whitespace-pre-wrap text-sm leading-7 text-[#173B5E]">{selected.content || 'No text content is available for this entry.'}</p></div>}
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#536779]">{selected.tags?.split(',').filter(Boolean).map(tag => <span key={tag.trim()} className="rounded-full border border-[#DCE6F0] px-2.5 py-1">{tag.trim()}</span>)}{selected.author_name && <span className="ml-auto">Added by {selected.author_name}</span>}</div>
      </section>
    </div>}
  </main>;
};
