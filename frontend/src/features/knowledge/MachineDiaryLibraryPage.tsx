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
  ShieldCheck,
  Lock,
  Cloud,
  PlusCircle,
  ArrowRight,
  Clock,
  Plus,
} from 'lucide-react';
import { getMachineImage } from '../machines/machineImages';
import { getApiUrl } from '../../lib/api/client';
import { useAuth } from '../../hooks/useAuth';
import type { MediaAsset } from '../knowledge-capture/media/types';
import { fetchKnowledgeList } from '../knowledge-capture/knowledgeApi';
import type { KnowledgeListItem } from '../knowledge-capture/types';
import {
  fetchMachineDiaryAssets,
  fetchMachineDiaryLibrary,
  type MachineDiaryMachine,
} from './machineDiaryApi';
import './machineDiary.css';

const bookPalettes = [
  ['#1976D2', '#1976C9', '#125EA3'],
  ['#047857', '#047857', '#065F46'],
];

const displayedKnowledgeCount = (machine: MachineDiaryMachine) =>
  machine.counts.video + machine.counts.image + machine.counts.document + machine.counts.notes;

const LIBRARY_PAGE_SIZE = 100;

async function fetchPublishedKnowledge(machineId?: string): Promise<KnowledgeListItem[]> {
  const firstPage = await fetchKnowledgeList({ page: 1, page_size: LIBRARY_PAGE_SIZE, status: 'published', machine_id: machineId });
  const pageCount = Math.ceil(firstPage.total / LIBRARY_PAGE_SIZE);
  const remainingPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
    fetchKnowledgeList({ page: index + 2, page_size: LIBRARY_PAGE_SIZE, status: 'published', machine_id: machineId }),
  ));
  return [firstPage, ...remainingPages].flatMap(page => page.items).filter(item =>
    item.version_status === 'published' && item.current_published_version_id === item.version_id,
  );
}

const machineCategory = (machine: Pick<MachineDiaryMachine, 'category' | 'category_name'> | null | undefined) =>
  machine?.category_name || machine?.category || '';

const isSupportedImage = (asset: MediaAsset) => ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime.toLowerCase());
const isSupportedVideo = (asset: MediaAsset) => ['video/mp4', 'video/webm', 'video/quicktime'].includes(asset.mime.toLowerCase());
const isSupportedDocument = (asset: MediaAsset) => asset.mime.toLowerCase() === 'application/pdf';

function UnsupportedFile({ asset }: { asset: MediaAsset }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center" role="status">
    <FileText className="mx-auto text-amber-700" size={34} />
    <p className="mt-3 text-sm font-semibold text-amber-900">Preview is unavailable for this file type.</p>
    <p className="mt-1 text-xs text-amber-800">{asset.mime || 'File type unavailable'}</p>
    <a className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125EA3]" href={getApiUrl(`/media/${asset.id}`)} target="_blank" rel="noreferrer">Open or download file <ArrowUpRight size={15} /></a>
  </div>;
}

export const MachineDiaryLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreateKnowledge = hasPermission('knowledge.create');
  const canManageMachines = hasPermission('machine.manage');
  const [machines, setMachines] = useState<MachineDiaryMachine[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [knowledgeLoading, setKnowledgeLoading] = useState(true);
  const [knowledgeError, setKnowledgeError] = useState('');
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const loadMachines = () => {
    setLoading(true);
    setError('');
    fetchMachineDiaryLibrary()
      .then(setMachines)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load the machine library.'))
      .finally(() => setLoading(false));
  };

  const loadPublishedItems = () => {
    setKnowledgeLoading(true);
    setKnowledgeError('');
    fetchPublishedKnowledge()
      .then(setKnowledgeItems)
      .catch((cause: unknown) => setKnowledgeError(cause instanceof Error ? cause.message : 'Could not load published knowledge.'))
      .finally(() => setKnowledgeLoading(false));
  };

  useEffect(() => { loadMachines(); loadPublishedItems(); }, []);

  const availableMachines = useMemo(() => machines.filter(machine =>
    canManageMachines || machine.status.toUpperCase() !== 'DECOMMISSIONED',
  ), [machines, canManageMachines]);
  const machineOptions = useMemo(() => availableMachines.map(machine => ({ label: machine.name, machine })), [availableMachines]);
  const categories = useMemo(() => [...new Set(availableMachines.map(machineCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [availableMachines]);

  const visibleMachines = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return availableMachines.filter(machine => {
      const category = machineCategory(machine);
      const searchFields = [machine.name, machine.id, machine.code, machine.model_number,
        machine.serial_number, machine.manufacturer, category, machine.location];
      return (!query || searchFields.some(value => value?.toLocaleLowerCase().includes(query)))
        && (!machineFilter || machine.id === machineFilter)
        && (!categoryFilter || category === categoryFilter);
    });
  }, [availableMachines, search, machineFilter, categoryFilter]);

  const visibleKnowledgeItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return knowledgeItems.filter(item => {
      const associatedMachine = machines.find(machine => machine.id === item.machine_id);
      const category = machineCategory(associatedMachine) || item.machine?.category || '';
      const machineName = associatedMachine?.name || item.machine?.name || '';
      const searchFields = [item.title, item.version_summary, machineName, item.machine_id, category];
      return (!query || searchFields.some(value => value?.toLocaleLowerCase().includes(query)))
        && (!machineFilter || item.machine_id === machineFilter)
        && (!categoryFilter || category === categoryFilter);
    });
  }, [knowledgeItems, machines, search, machineFilter, categoryFilter]);

  return (
    <main className="w-full p-4 sm:p-6 lg:p-8 space-y-8" aria-labelledby="machine-library-title">
      {/* ─── HERO BANNER (Reference Image 2) ─── */}
      <div className="rounded-2xl bg-[#08264A] text-white p-6 sm:p-8 relative overflow-hidden shadow-lg border border-[#123B68]">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-72 h-72 rounded-full bg-[#1677F8]/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1677F8]/20 border border-[#43B9F4]/30 text-xs font-semibold text-[#43B9F4] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#35C5E8]" />
              KNOWLEDGE LIBRARY
            </div>
            <h1 id="machine-library-title" className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Your Knowledge Library
            </h1>
            <p className="text-sm text-[#D9E5F2] leading-relaxed">
              Access machine diaries, expert notes, procedures, media and more — all in one place. Search, filter and capture new knowledge effortlessly.
            </p>
          </div>

          {canCreateKnowledge && (
            <Link
              to="/app/knowledge-assets?kind=video"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1677F8] hover:bg-[#125EA3] text-white text-sm font-semibold px-5 py-2.5 shadow-sm transition-colors shrink-0 self-start md:self-auto"
            >
              <ClipboardList size={17} />
              <span>Capture knowledge</span>
            </Link>
          )}
        </div>
      </div>

      {/* ─── TOOLBAR (Reference Image 2) ─── */}
      <section className="bg-white p-4 rounded-2xl border border-[#D9E5F2] shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3" aria-label="Search knowledge library">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#647A96]" size={18} />
          <input
            className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#102844] outline-none focus:border-[#1677F8] focus:bg-white transition-colors"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by machine, ID, model, location, or keyword…"
            aria-label="Search knowledge library"
          />
        </label>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor="diary-machine-filter">Filter by machine</label>
          <select
            id="diary-machine-filter"
            className="text-xs bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl px-3.5 py-2.5 text-[#102844] font-medium focus:outline-none focus:border-[#1677F8] focus:ring-1 focus:ring-[#1677F8] transition-colors"
            aria-label="Filter by machine"
            value={machineFilter}
            onChange={event => setMachineFilter(event.target.value)}
          >
            <option value="">All machines</option>
            {machineOptions.map(({ label, machine }) => <option key={machine.id} value={machine.id}>{label}</option>)}
          </select>

          <label className="sr-only" htmlFor="diary-category-filter">Filter by machine category</label>
          <select
            id="diary-category-filter"
            className="text-xs bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl px-3.5 py-2.5 text-[#102844] font-medium focus:outline-none focus:border-[#1677F8] focus:ring-1 focus:ring-[#1677F8] transition-colors"
            aria-label="Filter by machine category"
            value={categoryFilter}
            onChange={event => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>

          {canCreateKnowledge && (
            <Link
              to="/app/knowledge-assets?kind=video"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1677F8] hover:bg-[#125EA3] text-white text-xs font-bold px-4 py-2.5 shadow-sm transition-colors"
            >
              <Plus size={15} />
              <span>Capture Knowledge</span>
            </Link>
          )}
        </div>
      </section>

      {loading && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading machine diaries">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl border border-[#D9E5F2] bg-white" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert">
          <p className="font-semibold">The machine library could not be loaded.</p>
          <p className="mt-1 text-sm text-rose-700">{error}</p>
          <button type="button" onClick={loadMachines} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500">
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      )}

      {!loading && !error && machines.length === 0 && (
        <div className="rounded-2xl border border-[#D9E5F2] bg-white px-6 py-14 text-center">
          <Cpu className="mx-auto text-[#1677F8]" size={34} />
          <h2 className="mt-4 text-xl font-semibold text-[#102844]">No registered machines yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#647A96]">
            Machine diaries appear here once equipment is registered. Ask a machine manager to add the equipment before capturing its knowledge.
          </p>
        </div>
      )}

      {!loading && !error && machines.length > 0 && availableMachines.length === 0 && (
        <div className="rounded-2xl border border-[#D9E5F2] bg-white px-6 py-12 text-center">
          <Cpu className="mx-auto text-[#647A96]" size={30} />
          <h2 className="mt-3 text-lg font-semibold text-[#102844]">No active machine diaries to display</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[#647A96]">Ask a machine manager to make a machine available in the library.</p>
        </div>
      )}

      {!loading && !error && availableMachines.length > 0 && visibleMachines.length === 0 && (
        <div className="rounded-2xl border border-[#D9E5F2] bg-white px-6 py-12 text-center">
          <Search className="mx-auto text-[#647A96]" size={28} />
          <h2 className="mt-3 text-lg font-semibold text-[#102844]">No diaries match those filters</h2>
          <p className="mt-1 text-sm text-[#647A96]">Try another search or choose one of the available machines.</p>
        </div>
      )}

      {/* ─── MACHINE VOLUMES (Reference Image 2) ─── */}
      {!loading && !error && visibleMachines.length > 0 && (
        <section className="space-y-4" aria-label="Machine volumes">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-[#102844]">Machine Volumes</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAF3FF] text-[#1677F8] border border-[#BCD7F5]">
                {visibleMachines.length}
              </span>
            </div>
            <span className="text-xs text-[#647A96]">Sorted by recently added</span>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            {visibleMachines.map((machine) => {
              const thumbnail = getMachineImage(machine.name, machine.category_name || machine.category);
              const publishedProcedureCount = knowledgeItems.filter(item => item.machine_id === machine.id).length;
              const machineMediaCount = displayedKnowledgeCount(machine);
              const entryCountLabel = publishedProcedureCount > 0
                ? `${machineMediaCount} media · ${publishedProcedureCount} SOP${publishedProcedureCount === 1 ? '' : 's'}`
                : `${machineMediaCount} entries`;

              return (
                <button
                  key={machine.id}
                  type="button"
                  className="rounded-2xl border border-[#D9E5F2] bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group text-left"
                  onClick={() => navigate(`/app/knowledge/machine/${encodeURIComponent(machine.id)}`)}
                  aria-label={`Open knowledge diary for ${machine.name}`}
                >
                  {/* Image Header with status badge */}
                  <div className="relative h-44 w-full bg-[#061A35] overflow-hidden">
                    <img
                      src={thumbnail}
                      alt={machine.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#061A35]/80 via-transparent to-black/20" />
                    
                    {/* Status Badge */}
                    <div className="absolute top-3 left-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md border bg-emerald-500/90 text-white border-emerald-400/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        {machine.status || 'ACTIVE'}
                      </span>
                    </div>

                    {/* Title overlay */}
                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <h3 className="font-bold text-lg leading-tight tracking-tight drop-shadow-sm truncate">
                        {machine.name}
                      </h3>
                      <p className="text-xs text-[#D9E5F2] truncate drop-shadow-sm mt-0.5">
                        {machine.manufacturer || 'GE Healthcare'} · {machine.model_number || 'Standard Series'}
                      </p>
                    </div>
                  </div>

                  {/* Body Details */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between w-full">
                    {/* Meta location and ID */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4F8FE] text-[#102844] font-mono text-[11px] border border-[#D9E5F2]">
                        <Cpu className="w-3.5 h-3.5 text-[#1677F8]" />
                        {machine.code || machine.id}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4F8FE] text-[#647A96] text-[11px] border border-[#D9E5F2]">
                        <MapPin className="w-3.5 h-3.5 text-[#1677F8]" />
                        {machine.location || 'Diagnostic Wing'}
                      </span>
                    </div>

                    {/* Metric counts */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-[#647A96] pt-1">
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                        <Video className="w-3.5 h-3.5 text-[#1677F8]" />
                        <span className="font-medium text-[#102844]">{machine.counts.video}</span> videos
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                        <FileText className="w-3.5 h-3.5 text-[#1677F8]" />
                        <span className="font-medium text-[#102844]">{machine.counts.document}</span> documents
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                        <ImageIcon className="w-3.5 h-3.5 text-[#1677F8]" />
                        <span className="font-medium text-[#102844]">{machine.counts.image}</span> photos
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                        <ClipboardList className="w-3.5 h-3.5 text-[#1677F8]" />
                        <span className="font-medium text-[#102844]">{machine.counts.notes}</span> notes
                      </div>
                    </div>

                    {/* Footer Row */}
                    <div className="pt-3 border-t border-[#D9E5F2] flex items-center justify-between text-xs font-semibold text-[#1677F8] w-full">
                      <span className="inline-flex items-center gap-1 group-hover:underline">
                        <span>View Details</span>
                        <ArrowRight size={14} />
                      </span>
                      <span className="text-[11px] text-[#647A96] font-normal">
                        {entryCountLabel}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Missing a machine? Card (Reference Image 2) */}
            <div className="rounded-2xl border border-dashed border-[#BCD7F5] bg-[#F4F8FE] p-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-white border border-[#D9E5F2] flex items-center justify-center text-[#1677F8] shadow-xs">
                <Plus size={22} />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#102844]">Missing a machine?</h4>
                <p className="text-xs text-[#647A96] mt-1 max-w-[220px]">
                  Capture knowledge for a new machine or equipment.
                </p>
              </div>
              <Link
                to="/app/machines"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-[#1677F8] bg-white text-[#1677F8] hover:bg-[#1677F8] hover:text-white text-xs font-bold transition-all shadow-xs"
              >
                Add Machine
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── PUBLISHED PROCEDURES & KNOWLEDGE ─── */}
      <section className="space-y-4" aria-label="Published procedures and knowledge">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#102844]">Published Procedures &amp; Knowledge</h2>
            <p className="text-xs text-[#647A96]">Current approved versions available for study.</p>
          </div>
          {!knowledgeLoading && !knowledgeError && <span className="text-xs text-[#647A96]">{visibleKnowledgeItems.length} shown</span>}
        </div>
        
        {knowledgeLoading && <div role="status" aria-live="polite" className="rounded-2xl border border-[#D9E5F2] bg-white p-5 text-sm text-[#647A96]">Loading published procedures…</div>}
        {knowledgeError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert">
            <p className="font-semibold">Published knowledge could not be loaded.</p>
            <p className="mt-1 text-sm text-rose-700">{knowledgeError}</p>
            <button type="button" onClick={loadPublishedItems} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium hover:bg-rose-100">
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        )}
        {!knowledgeLoading && !knowledgeError && visibleKnowledgeItems.length === 0 && (
          <div className="rounded-2xl border border-[#D9E5F2] bg-white px-6 py-10 text-center">
            <BookOpen className="mx-auto text-[#1677F8]" size={30} />
            <h3 className="mt-3 text-base font-semibold text-[#102844]">{knowledgeItems.length === 0 ? 'No published procedures yet' : 'No published knowledge matches those filters'}</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#647A96]">{knowledgeItems.length === 0 ? 'Approved SOPs and learning documents will appear here when they are published.' : 'Try another search or choose a different machine or category.'}</p>
          </div>
        )}
        {!knowledgeLoading && !knowledgeError && visibleKnowledgeItems.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleKnowledgeItems.map(item => {
              const associatedMachine = machines.find(machine => machine.id === item.machine_id);
              const machineName = associatedMachine?.name || item.machine?.name || 'General procedure';
              const category = machineCategory(associatedMachine) || item.machine?.category || '';
              return (
                <article key={item.version_id} className="rounded-2xl border border-[#D9E5F2] bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 text-base font-bold text-[#102844]">{item.title}</h3>
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[.68rem] font-bold text-emerald-800 uppercase">Published</span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-5 text-[#647A96]">{item.version_summary || 'Published learning procedure'}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#647A96]">
                    <span className="inline-flex items-center gap-1 font-semibold text-[#102844]"><Cpu size={13} className="text-[#1677F8]" />{machineName}</span>
                    {category && <span className="rounded-full bg-[#F4F8FE] border border-[#D9E5F2] px-2 py-0.5 text-[11px]">{category}</span>}
                    <span className="rounded-full bg-[#F4F8FE] border border-[#D9E5F2] px-2 py-0.5 font-mono text-[11px]">v{item.version_no}</span>
                  </div>
                  <div className="pt-2 border-t border-[#D9E5F2]">
                    <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1677F8] hover:underline" to={`/app/knowledge/${encodeURIComponent(item.id)}?version_id=${encodeURIComponent(item.version_id)}`}>
                      <span>Open procedure</span>
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── TRUST INDICATORS FOOTER (Reference Image 2) ─── */}
      <footer className="rounded-2xl border border-[#D9E5F2] bg-white p-6 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] text-[#1677F8] flex items-center justify-center shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-[#102844]">Expert Reviewed</div>
              <div className="text-[11px] text-[#647A96]">Validated by domain experts</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] text-[#1677F8] flex items-center justify-center shrink-0">
              <Cloud size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-[#102844]">Available Offline</div>
              <div className="text-[11px] text-[#647A96]">Access anytime, anywhere</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] text-[#1677F8] flex items-center justify-center shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-[#102844]">Secure &amp; Compliant</div>
              <div className="text-[11px] text-[#647A96]">Enterprise-grade security</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] text-[#1677F8] flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-[#102844]">Always Up to Date</div>
              <div className="text-[11px] text-[#647A96]">Updated by your team</div>
            </div>
          </div>
        </div>
      </footer>
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
  if (asset.kind === 'image' && isSupportedImage(asset)) return <img src={fileUrl} alt={asset.title || asset.original_name} loading="lazy" />;
  if (asset.kind === 'video' && isSupportedVideo(asset)) return <video src={fileUrl} muted preload="metadata" aria-label={`Video preview: ${asset.title || asset.original_name}`} />;
  const Icon = asset.kind === 'notes' ? ClipboardList : FileText;
  return <div className="flex flex-col items-center gap-2 px-5 text-center">
    <Icon size={compact ? 25 : 34} />
    <span className="max-w-full truncate text-xs text-[#536779]">{asset.kind === 'document' ? (isSupportedDocument(asset) ? 'PDF document' : 'Unsupported file') : asset.kind}</span>
  </div>;
}

export const MachineDiaryPage: React.FC = () => {
  const { machineId = '' } = useParams<{ machineId: string }>();
  const { user, hasPermission } = useAuth();
  const canCreateKnowledge = hasPermission('knowledge.create');
  const isTrainee = user?.role_id === 'TRAINEE';
  const [machine, setMachine] = useState<MachineDiaryMachine | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [publishedItemsByVersion, setPublishedItemsByVersion] = useState<Map<string, KnowledgeListItem>>(new Map());
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
      isTrainee ? fetchPublishedKnowledge(machineId) : Promise.resolve([]),
    ]).then(([machines, machineAssets, publishedItems]) => {
      setMachine(machines[0] || null);
      const itemsByVersion = new Map(publishedItems.map(item => [item.version_id, item]));
      setPublishedItemsByVersion(itemsByVersion);
      // Treat the backend association as authoritative and retain a client-side
      // guard so a malformed response cannot leak another machine's assets.
      const visibleKinds = new Set(['video', 'image', 'document', 'notes']);
      setAssets(machineAssets.filter(asset => asset.machine_id === machineId && visibleKinds.has(asset.kind)
        && (!isTrainee || (!!asset.version_id && itemsByVersion.has(asset.version_id)))));
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load this machine diary.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDiary(); setSelected(null); }, [machineId, isTrainee]);

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
  const publishedProcedures = [...publishedItemsByVersion.values()].sort((a, b) => a.title.localeCompare(b.title));

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
        <Link to="/app/knowledge" className="rounded px-1 py-1 hover:text-[#1976C9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1976C9]">Knowledge Library</Link><span aria-hidden="true">/</span><span className="truncate text-[#173B5E]">{machine?.name || 'Machine diary'}</span>
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
          {canCreateKnowledge && <Link to={captureHref} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#1976C9] bg-[#1976C9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#125EA3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976C9] lg:self-auto"><ClipboardList size={16} /> Add to this diary</Link>}
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Knowledge counts">
          {countCards.map(({ label, count, Icon }) => <div key={label} className="diary-stat flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EFF4FF] text-[#1976C9]"><Icon size={17} /></span><div><div className="text-lg font-semibold leading-tight text-[#173B5E]">{count}</div><div className="text-xs text-[#536779]">{label}{count === 1 ? '' : 's'}</div></div></div>)}
        </section>

        {isTrainee && publishedProcedures.length > 0 && <section className="mt-7" aria-label="Published procedures">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold tracking-wide text-[#173B5E]">PUBLISHED PROCEDURES</h2><span className="text-xs text-[#536779]">{publishedProcedures.length}</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {publishedProcedures.map(item => <article key={item.version_id} className="rounded-2xl border border-[#DCE6F0] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 text-sm font-semibold text-[#173B5E]">{item.title}</h3><span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[.65rem] font-semibold text-emerald-800">Published</span></div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#536779]">{item.version_summary || 'Published learning procedure'}</p>
              <div className="mt-3 flex items-center justify-between gap-2"><span className="rounded-full bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#536779]">v{item.version_no}</span><Link className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#1976C9]/20 bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#125EA3] hover:bg-[#DBEAFE]" to={`/app/knowledge/${encodeURIComponent(item.id)}?version_id=${encodeURIComponent(item.version_id)}`}>Open procedure <ArrowUpRight size={14} /></Link></div>
            </article>)}
          </div>
        </section>}

        <section className="diary-toolbar mt-7 rounded-2xl p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filter diary entries">
              {diaryTabs.map(tab => <button key={tab.id} type="button" className="diary-tab inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.icon}<span>{tab.label}</span><span className="text-[.68rem] text-[#536779]">{counts[tab.id]}</span></button>)}
            </div>
            <label className="relative block xl:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#536779]" size={16} /><input className="diary-control w-full pl-9 pr-3 text-sm" aria-label="Search this machine diary" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search diary entries…" /></label>
          </div>
        </section>

        {visibleEntries.length === 0 ? <div className="mt-7 rounded-2xl border border-[#E2E8F0] bg-white px-6 py-14 text-center">
          <BookOpen className="mx-auto text-[#1976C9]" size={31} /><h2 className="mt-4 text-lg font-semibold text-[#173B5E]">{allEntries.length === 0 ? (isTrainee ? (publishedProcedures.length > 0 ? 'No published media files yet' : 'No published machine knowledge available') : 'This diary is ready for its first entry') : search.trim() ? 'No entries match your search' : `No ${diaryTabs.find(tab => tab.id === filter)?.label.toLowerCase() || 'entries'} in this diary yet`}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#536779]">{allEntries.length === 0 ? (isTrainee ? (publishedProcedures.length > 0 ? 'The published procedures above are available. Machine photos, videos, documents, and field notes will appear here when published.' : 'Published machine media and procedures will appear here when available.') : 'Capture a video, photo, document, or field note and it will be stored with this machine.') : search.trim() ? 'Try another search or choose a different section.' : (canCreateKnowledge ? 'Capture a new entry and it will be stored with this machine.' : 'There are no published entries in this section yet.')}</p>
          {allEntries.length === 0 && canCreateKnowledge && <Link to={captureHref} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125EA3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976C9]"><ClipboardList size={16} /> Capture the first entry</Link>}
        </div> : <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Machine knowledge entries">
          {visibleEntries.map(asset => <article key={`${asset.kind}-${asset.id}`} className="diary-asset">
            <button type="button" className="diary-asset-preview w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-200" onClick={() => setSelected(asset)} aria-label={`Preview ${asset.title || asset.original_name}`}>
              {previewFor(asset, true)}
            </button>
            <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><button type="button" onClick={() => setSelected(asset)} className="block max-w-full truncate text-left text-sm font-semibold text-[#173B5E] hover:text-[#1976C9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1976C9]">{asset.title || asset.original_name}</button><p className="mt-1 truncate text-xs text-[#536779]">{asset.original_name}</p></div><span className="shrink-0 rounded-full border border-[#DCE6F0] bg-[#F8FAFC] px-2 py-1 text-[.65rem] capitalize text-[#536779]">{asset.kind === 'image' ? 'photo' : asset.kind}</span></div>
              {asset.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#536779]">{asset.description}</p>}
              {asset.kind === 'notes' && asset.content && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-[#173B5E]">{asset.content}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 text-[.68rem] text-[#536779]"><span className="inline-flex items-center gap-1"><CalendarDays size={12} />{assetDate(asset)}</span><span>{publishedItemsByVersion.has(asset.version_id || '') ? `v${publishedItemsByVersion.get(asset.version_id || '')?.version_no} · Published` : asset.verification_status || 'Pending review'}</span></div>
            </div>
          </article>)}
        </div>}
      </>}
    </div>

    {selected && <div className="diary-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="diary-modal p-5 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="diary-asset-title" onKeyDown={event => { if (event.key === 'Escape') setSelected(null); }}>
        <header className="mb-5 flex items-start justify-between gap-4"><div className="min-w-0"><p className="diary-eyebrow">{selected.kind === 'image' ? 'Photo' : selected.kind} · {assetDate(selected)}</p><h2 id="diary-asset-title" className="mt-2 break-words text-xl font-semibold text-[#173B5E]">{selected.title || selected.original_name}</h2><p className="mt-1 break-all text-xs text-[#536779]">{selected.original_name}</p></div><button autoFocus type="button" onClick={() => setSelected(null)} aria-label="Close preview" className="rounded-lg p-2 text-[#536779] hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1976C9]"><X size={19} /></button></header>
        {selected.kind === 'video' && (isSupportedVideo(selected) ? <video className="max-h-[62vh] w-full rounded-xl bg-black" controls autoPlay src={getApiUrl(`/media/${selected.id}`)} /> : <UnsupportedFile asset={selected} />)}
        {selected.kind === 'image' && (isSupportedImage(selected) ? <img className="mx-auto max-h-[62vh] max-w-full rounded-xl object-contain" src={getApiUrl(`/media/${selected.id}`)} alt={selected.title || selected.original_name} /> : <UnsupportedFile asset={selected} />)}
        {selected.kind === 'document' && (isSupportedDocument(selected) ? <div className="space-y-3"><iframe className="h-[55vh] w-full rounded-xl border border-[#E2E8F0] bg-white" src={getApiUrl(`/media/${selected.id}`)} title={`PDF preview: ${selected.title || selected.original_name}`} /><a className="inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125EA3]" href={getApiUrl(`/media/${selected.id}`)} target="_blank" rel="noreferrer">Open or download PDF <ArrowUpRight size={15} /></a></div> : <UnsupportedFile asset={selected} />)}
        {selected.kind === 'notes' && <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5"><p className="whitespace-pre-wrap text-sm leading-7 text-[#173B5E]">{selected.content || 'No text content is available for this entry.'}</p></div>}
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#536779]">{selected.tags?.split(',').filter(Boolean).map(tag => <span key={tag.trim()} className="rounded-full border border-[#DCE6F0] px-2.5 py-1">{tag.trim()}</span>)}{selected.author_name && <span className="ml-auto">Added by {selected.author_name}</span>}</div>
      </section>
    </div>}
  </main>;
};
