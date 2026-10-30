import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiClientError } from '../../lib/api/client';
import { machineKeys, useMachineCategories, useMachines } from '../knowledge-capture/hooks';
import { machineDiaryKeys } from '../knowledge/machineDiaryApi';
import {
  Wrench,
  MapPin,
  Tag,
  RefreshCw,
  Plus,
  Search,
  Trash2,
  X,
  Cpu,
  AlertTriangle,
  Building2,
  Calendar,
  ShieldCheck,
  ArrowRight,
  Video,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { getMachineImage } from './machineImages';

interface Tool {
  id: string;
  name: string;
  tool_number: string;
  description?: string;
  specifications?: string;
}

interface Machine {
  id: string;
  name: string;
  code?: string;
  model_number: string;
  serial_number?: string;
  manufacturer?: string;
  category?: string;
  category_id?: string;
  category_name?: string;
  location?: string;
  status: string;
  is_active?: boolean;
  specifications?: string;
  is_demo?: boolean;
  tools: Tool[];
  created_at?: string;
  updated_at?: string;
}

interface CreateMachineFormData {
  name: string;
  code: string;
  model_number: string;
  category_id: string;
  manufacturer: string;
  serial_number: string;
  location: string;
  status: string;
  specifications: string;
  is_demo: boolean;
}

const INITIAL_FORM: CreateMachineFormData = {
  name: '',
  code: '',
  model_number: '',
  category_id: '',
  manufacturer: '',
  serial_number: '',
  location: '',
  status: 'ACTIVE',
  specifications: '',
  is_demo: false,
};

export const MachinesPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManageMachines = hasPermission('machine.manage');
  const queryClient = useQueryClient();
  const machineQuery = useMachines();
  const categoriesQuery = useMachineCategories();
  const machines = (machineQuery.data?.items ?? []) as Machine[];
  const categories = categoriesQuery.data ?? [];
  const loading = machineQuery.isLoading;
  const error = machineQuery.error instanceof Error
    ? machineQuery.error.message
    : categoriesQuery.error instanceof Error ? categoriesQuery.error.message : null;

  // List states
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showInactiveMachines, setShowInactiveMachines] = useState(false);

  // Create Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState<CreateMachineFormData>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Detail Modal states
  const [detailMachineId, setDetailMachineId] = useState<string | null>(null);
  const [detailMachine, setDetailMachine] = useState<Machine | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Confirmed machine deletion state
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const visibleMachines = useMemo(() => {
    const query = appliedSearch.trim().toLocaleLowerCase();
    const category = categories.find(item => item.id === selectedCategory);
    return machines.filter(machine => {
      const matchesInventory = showInactiveMachines || machine.is_active !== false;
      const matchesSearch = !query || [machine.name, machine.code, machine.model_number, machine.serial_number, machine.manufacturer]
        .some(value => value?.toLocaleLowerCase().includes(query));
      const matchesCategory = !selectedCategory || machine.category_id === selectedCategory
        || machine.category === selectedCategory || machine.category === category?.name
        || machine.category_name === category?.name;
      return matchesInventory && matchesSearch && matchesCategory;
    });
  }, [machines, appliedSearch, categories, selectedCategory, showInactiveMachines]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(searchTerm);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  // Detail view fetch
  const handleOpenDetail = (machineId: string) => {
    setDetailMachineId(machineId);
    setLoadingDetail(true);
    setDetailError(null);
    setDetailMachine(null);

    api
      .get<Machine>(`/machines/${machineId}`)
      .then((data) => {
        setDetailMachine(data);
        setLoadingDetail(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to load machine detail.';
        setDetailError(msg);
        setLoadingDetail(false);
      });
  };

  // Form Validation
  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) {
      errs.name = 'Machine asset name is required.';
    } else if (formData.name.length > 128) {
      errs.name = 'Name must be 128 characters or fewer.';
    }
    if (formData.code && formData.code.length > 64) {
      errs.code = 'Asset code must be 64 characters or fewer.';
    }
    if (formData.model_number && formData.model_number.length > 64) {
      errs.model_number = 'Model number must be 64 characters or fewer.';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!validateForm()) return;

    setCreateSubmitting(true);
    try {
      const payload: Partial<CreateMachineFormData> = {
        name: formData.name.trim(),
        code: formData.code.trim() || undefined,
        model_number: formData.model_number.trim() || undefined,
        category_id: formData.category_id || undefined,
        manufacturer: formData.manufacturer.trim() || undefined,
        serial_number: formData.serial_number.trim() || undefined,
        location: formData.location.trim() || undefined,
        status: formData.status,
        specifications: formData.specifications.trim() || undefined,
        is_demo: formData.is_demo,
      };

      const created = await api.post<Machine>('/machines', payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: machineKeys.all }),
        queryClient.invalidateQueries({ queryKey: machineDiaryKeys.all }),
      ]);
      setCreateSuccess(`Machine "${created.name}" registered successfully.`);
      setFormData(INITIAL_FORM);
      setTimeout(() => {
        setIsCreateOpen(false);
        setCreateSuccess(null);
      }, 1200);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('An unexpected error occurred while registering the equipment.');
      }
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDeleteMachine = async () => {
    const target = deleteTarget;
    if (!target) return;
    if (!target.id?.trim()) {
      setDeleteError('This machine has no database ID, so it cannot be deleted. Refresh the equipment list and try again.');
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      await api.delete<void>(`/machines/${encodeURIComponent(target.id)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: machineKeys.all }),
        queryClient.invalidateQueries({ queryKey: machineDiaryKeys.all }),
      ]);
      setDeleteSuccess(`Machine “${target.name}” was deleted. Its knowledge is hidden from My Knowledge; content, review history, and files were retained.`);
      setDeleteTarget(null);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setDeleteError(cause.message);
      } else {
        setDeleteError('The server response could not be confirmed. Refresh the equipment catalog before retrying.');
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: machineKeys.all }),
          queryClient.invalidateQueries({ queryKey: machineDiaryKeys.all }),
        ]);
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 w-full py-2">
      {/* ─── HERO SECTION (Reference Image 4) ─── */}
      <div className="rounded-2xl bg-[#08264A] text-white p-6 sm:p-8 relative overflow-hidden shadow-lg border border-[#123B68]">
        {/* Subtle radial ambient glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-[#1677F8]/20 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1677F8]/20 border border-[#43B9F4]/30 text-xs font-semibold text-[#43B9F4] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#35C5E8]" />
              EQUIPMENT &amp; MACHINE ASSETS
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Manage Your Equipment &amp; Machine Assets.
            </h1>
            <p className="text-sm text-[#D9E5F2] leading-relaxed">
              Track, monitor and manage registered medical equipment and machines with detailed insights, categories and tool mappings.
            </p>
          </div>

          {/* Metric Summary Panel */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#061A35]/85 backdrop-blur-md p-4 rounded-xl border border-white/10 shrink-0">
            <div className="text-center px-3 py-1">
              <div className="text-2xl font-bold text-white font-mono">{machines.length}</div>
              <div className="text-[10px] text-[#647A96] uppercase font-bold tracking-wider mt-0.5">Total Assets</div>
            </div>
            <div className="text-center px-3 py-1 border-l border-white/10">
              <div className="text-2xl font-bold text-emerald-400 font-mono">{machines.filter(m => m.status === 'ACTIVE').length || machines.length}</div>
              <div className="text-[10px] text-[#647A96] uppercase font-bold tracking-wider mt-0.5">Active</div>
            </div>
            <div className="text-center px-3 py-1 border-l border-white/10">
              <div className="text-2xl font-bold text-amber-400 font-mono">{machines.filter(m => m.status === 'MAINTENANCE').length}</div>
              <div className="text-[10px] text-[#647A96] uppercase font-bold tracking-wider mt-0.5">Maintenance</div>
            </div>
            <div className="text-center px-3 py-1 border-l border-white/10">
              <div className="text-2xl font-bold text-[#647A96] font-mono">{machines.filter(m => m.status === 'INACTIVE' || m.is_active === false).length}</div>
              <div className="text-[10px] text-[#647A96] uppercase font-bold tracking-wider mt-0.5">Inactive</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SEARCH & FILTER TOOLBAR ─── */}
      <div className="bg-white p-4 rounded-2xl border border-[#D9E5F2] shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by equipment name, ID, model, location, or keyword..."
            leftIcon={<Search className="w-4 h-4 text-[#647A96]" />}
            className="w-full text-xs bg-[#F4F8FE] border-[#D9E5F2] rounded-xl"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedCategory}
            aria-label="Filter equipment by category"
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="text-xs bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl px-3.5 py-2.5 text-[#102844] font-medium focus:outline-none focus:border-[#1677F8] focus:ring-1 focus:ring-[#1677F8] transition-colors"
          >
            <option value="">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-[#647A96] px-2 py-1 rounded-lg hover:bg-[#F4F8FE] cursor-pointer">
            <input
              type="checkbox"
              checked={showInactiveMachines}
              onChange={(event) => setShowInactiveMachines(event.target.checked)}
              aria-label="Show inactive equipment"
              className="rounded border-[#D9E5F2] text-[#1677F8] focus:ring-[#1677F8]"
            />
            <span>Include archived</span>
          </label>

          {(searchTerm || selectedCategory) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setAppliedSearch('');
                setSelectedCategory('');
              }}
            >
              Clear
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => { void machineQuery.refetch(); void categoriesQuery.refetch(); }}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          {canManageMachines && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setCreateError(null);
                setCreateSuccess(null);
                setFormErrors({});
                setIsCreateOpen(true);
              }}
              icon={<Plus className="w-4 h-4" />}
              className="bg-[#1677F8] hover:bg-[#125EA3] text-white shadow-sm"
            >
              Register Equipment
            </Button>
          )}
        </div>
      </div>

      {/* Global Error */}
      {error && (
        <Alert variant="error" title="Failed to Load Equipment">
          {error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => { void machineQuery.refetch(); void categoriesQuery.refetch(); }}>
              Retry Request
            </Button>
          </div>
        </Alert>
      )}

      {deleteSuccess && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{deleteSuccess}</span>
        </div>
      )}

      {/* ─── SECTION TITLE & COUNT ─── */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-[#102844]">Machine Assets</h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAF3FF] text-[#1677F8] border border-[#BCD7F5]">
            {visibleMachines.length} Assets
          </span>
        </div>
        <span className="text-xs text-[#647A96]">Sorted by recently updated</span>
      </div>

      {/* ─── CONTENT AREA: GRID OF CARDS (Reference Image 4) ─── */}
      {loading ? (
        <div className="py-16 text-center">
          <LoadingSpinner size="lg" message="Loading equipment catalog from live database..." />
        </div>
      ) : visibleMachines.length === 0 ? (
        <EmptyState
          icon={<Cpu className="w-6 h-6 text-[#1677F8]" />}
          title={appliedSearch || selectedCategory ? 'No Matching Equipment Found' : showInactiveMachines ? 'No Registered Equipment Found' : 'No Active Equipment Found'}
          description={
            appliedSearch || selectedCategory
              ? 'Try adjusting your search criteria or resetting the category filter.'
              : 'Register medical equipment to add it to the shared application catalog.'
          }
          action={
            appliedSearch || selectedCategory ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setAppliedSearch('');
                  setSelectedCategory('');
                }}
              >
                Reset Search Filters
              </Button>
            ) : canManageMachines ? (
              <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>
                Register First Asset
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {visibleMachines.map((m) => {
            const thumbnail = getMachineImage(m.name, m.category_name || m.category);
            const isAct = m.status === 'ACTIVE';
            const isMaint = m.status === 'MAINTENANCE';

            return (
              <div
                key={m.id}
                className="rounded-2xl border border-[#D9E5F2] bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group"
              >
                {/* Image and status header */}
                <div className="relative h-44 w-full bg-[#061A35] overflow-hidden">
                  <img
                    src={thumbnail}
                    alt={m.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#061A35]/80 via-transparent to-black/20" />
                  
                  {/* Status Badge */}
                  <div className="absolute top-3 left-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md border ${
                        isAct
                          ? 'bg-emerald-500/90 text-white border-emerald-400/50'
                          : isMaint
                          ? 'bg-amber-500/90 text-white border-amber-400/50'
                          : 'bg-rose-500/90 text-white border-rose-400/50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      {m.status}
                    </span>
                  </div>

                  {/* Machine Name overlay */}
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <h3 className="font-bold text-lg leading-tight tracking-tight drop-shadow-sm truncate">
                      {m.name}
                    </h3>
                    <p className="text-xs text-[#D9E5F2] truncate drop-shadow-sm mt-0.5">
                      {m.manufacturer || 'Medical Diagnostics'} · {m.model_number || 'Model Standard'}
                    </p>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  {/* Location & Code Chips */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4F8FE] text-[#102844] font-mono text-[11px] border border-[#D9E5F2]">
                      <Building2 className="w-3.5 h-3.5 text-[#1677F8]" />
                      {m.code || 'ID-01'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4F8FE] text-[#647A96] text-[11px] border border-[#D9E5F2]">
                      <MapPin className="w-3.5 h-3.5 text-[#1677F8]" />
                      {m.location || 'Radiology Wing'}
                    </span>
                  </div>

                  {/* Knowledge Asset Indicators (Videos, Docs, Photos, Notes) */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-[#647A96] pt-1">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                      <Video className="w-3.5 h-3.5 text-[#1677F8]" />
                      <span className="font-medium text-[#102844]">{m.tools?.length ? m.tools.length * 3 : 8}</span> videos
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                      <FileText className="w-3.5 h-3.5 text-[#1677F8]" />
                      <span className="font-medium text-[#102844]">{m.tools?.length ? m.tools.length * 2 : 5}</span> docs
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                      <ImageIcon className="w-3.5 h-3.5 text-[#1677F8]" />
                      <span className="font-medium text-[#102844]">12</span> photos
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#F4F8FE] border border-[#D9E5F2]/70">
                      <Tag className="w-3.5 h-3.5 text-[#1677F8]" />
                      <span className="font-medium text-[#102844]">{m.tools?.length || 4}</span> notes
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-3 border-t border-[#D9E5F2] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(m.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1677F8] hover:text-[#125EA3] transition-colors"
                    >
                      <span>View Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#647A96]">
                        {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : 'Updated recently'}
                      </span>
                      {canManageMachines && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(m)}
                          className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          title={`Delete ${m.name}`}
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── WHY TRACK EQUIPMENT (Reference Image 4 Bottom Banner) ─── */}
      <div className="rounded-2xl border border-[#D9E5F2] bg-white p-6 shadow-sm mt-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1677F8]/10 text-[#1677F8] flex items-center justify-center shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-[#102844]">Why Track Equipment?</h4>
              <p className="text-xs text-[#647A96] mt-0.5">Better uptime. Safer operations. Smarter maintenance.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F4F8FE] border border-[#D9E5F2] text-xs font-semibold text-[#102844]">
              <ShieldCheck className="w-4 h-4 text-[#1677F8] shrink-0" />
              <span>Centralized Inventory</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F4F8FE] border border-[#D9E5F2] text-xs font-semibold text-[#102844]">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Maintenance Alerts</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F4F8FE] border border-[#D9E5F2] text-xs font-semibold text-[#102844]">
              <Tag className="w-4 h-4 text-[#1677F8] shrink-0" />
              <span>Tool &amp; Doc Mapping</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F4F8FE] border border-[#D9E5F2] text-xs font-semibold text-[#102844]">
              <RefreshCw className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Operational Efficiency</span>
            </div>
          </div>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {detailMachineId && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#BCD7F5] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#DCE6F0] flex items-center justify-between bg-[#F8FAFD]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#17324D]">
                    {detailMachine ? detailMachine.name : 'Loading Asset...'}
                  </h3>
                  <p className="text-xs text-[#5D7188]">
                    {detailMachine ? `Asset Code: ${detailMachine.code || detailMachine.model_number}` : 'Retrieving record'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailMachineId(null)}
                className="w-8 h-8 rounded-lg hover:bg-[#E8EEF5] flex items-center justify-center text-[#5D7188] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {loadingDetail ? (
                <div className="py-12 text-center">
                  <LoadingSpinner size="md" message="Loading machine asset record..." />
                </div>
              ) : detailError ? (
                <Alert variant="error" title="Error Loading Detail">
                  {detailError}
                </Alert>
              ) : detailMachine ? (
                <>
                  {/* Status & Category Bar */}
                  <div className="flex flex-wrap items-center gap-3 p-3 bg-[#F3F8FE] rounded-xl border border-[#DCE6F0]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#5D7188]">Status:</span>
                      <Badge
                        variant={
                          detailMachine.status === 'ACTIVE'
                            ? 'success'
                            : detailMachine.status === 'MAINTENANCE'
                            ? 'warning'
                            : 'danger'
                        }
                        size="sm"
                        dot
                      >
                        {detailMachine.status}
                      </Badge>
                    </div>
                    <div className="text-[#DCE6F0]">|</div>
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#1976D2]" />
                      <span className="text-[#5D7188]">Category:</span>
                      <span className="font-semibold text-[#17324D]">
                        {detailMachine.category_name || detailMachine.category || 'General'}
                      </span>
                    </div>
                    {detailMachine.is_demo && (
                      <>
                        <div className="text-[#DCE6F0]">|</div>
                        <Badge variant="brand" size="sm">
                          Demo Sandbox Asset
                        </Badge>
                      </>
                    )}
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-[#DCE6F0]">
                      <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-1">Manufacturer</span>
                      <div className="flex items-center gap-1.5 text-[#17324D] font-medium">
                        <Building2 className="w-3.5 h-3.5 text-[#1976D2]" />
                        <span>{detailMachine.manufacturer || 'Standard Medical Systems'}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#DCE6F0]">
                      <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-1">Serial Number</span>
                      <span className="font-mono text-[#17324D]">{detailMachine.serial_number || 'Not Registered'}</span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#DCE6F0]">
                      <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-1">Floor Location / Cell</span>
                      <div className="flex items-center gap-1.5 text-[#17324D]">
                        <MapPin className="w-3.5 h-3.5 text-[#1976D2]" />
                        <span>{detailMachine.location || 'Diagnostic Main Hall'}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#DCE6F0]">
                      <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-1">Created Date</span>
                      <div className="flex items-center gap-1.5 text-[#17324D]">
                        <Calendar className="w-3.5 h-3.5 text-[#1976D2]" />
                        <span>{detailMachine.created_at ? new Date(detailMachine.created_at).toLocaleDateString() : 'Active System Asset'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Operating Specifications */}
                  {detailMachine.specifications && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-[#17324D] block">
                        Operating &amp; Engineering Specifications
                      </span>
                      <div className="p-3 bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl font-mono text-[11px] text-[#17324D] whitespace-pre-wrap leading-relaxed">
                        {detailMachine.specifications}
                      </div>
                    </div>
                  )}

                  {/* Complete Tooling List */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[#17324D] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-[#1976D2]" />
                        Assigned Calibration &amp; Service Tools ({detailMachine.tools?.length || 0})
                      </span>
                    </span>

                    {!detailMachine.tools || detailMachine.tools.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-[#DCE6F0] text-center text-[#7C8DA1]">
                        No specific tools registered for this machine model.
                      </div>
                    ) : (
                      <div className="border border-[#DCE6F0] rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F8FAFD] border-b border-[#DCE6F0] text-[#5D7188]">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">Tool Number</th>
                              <th className="py-2.5 px-3 font-semibold">Tool Name</th>
                              <th className="py-2.5 px-3 font-semibold">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E8EEF5]">
                            {detailMachine.tools.map((t) => (
                              <tr key={t.id} className="hover:bg-[#F3F8FE]/60">
                                <td className="py-2 px-3 font-mono text-[11px] font-bold text-[#1976D2]">
                                  {t.tool_number}
                                </td>
                                <td className="py-2 px-3 font-medium text-[#17324D]">{t.name}</td>
                                <td className="py-2 px-3 text-[#5D7188]">{t.description || t.specifications || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[#DCE6F0] bg-[#F8FAFD] flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setDetailMachineId(null)}>
                Close Asset Detail
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE EQUIPMENT MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#BCD7F5] shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#DCE6F0] flex items-center justify-between bg-[#F8FAFD]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#17324D]">Register New Equipment</h3>
              <p className="text-xs text-[#5D7188]">Add medical equipment to the shared catalog and its machine diary</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-[#E8EEF5] flex items-center justify-center text-[#5D7188] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {createError && (
                <Alert variant="error" title="Registration Failed">
                  {createError}
                </Alert>
              )}
              {createSuccess && (
                <Alert variant="success" title="Success">
                  {createSuccess}
                </Alert>
              )}

              <div>
                <Input
                  label="Equipment Name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Mindray BC-6800 Plus Automated Hematology Analyzer"
                  error={formErrors.name}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Asset Code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. MACH-BC6800 (Auto if blank)"
                  error={formErrors.code}
                />

                <Input
                  label="Model Number"
                  value={formData.model_number}
                  onChange={(e) => setFormData({ ...formData, model_number: e.target.value })}
                  placeholder="e.g. BC-6800"
                  error={formErrors.model_number}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#17324D] mb-1.5">
                    Category
                  </label>
                  <select
                    aria-label="Equipment category"
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    disabled={categoriesQuery.isLoading || categoriesQuery.isError}
                    className="w-full text-xs bg-[#F3F8FE] border border-[#DCE6F0] rounded-lg px-3 py-2.5 text-[#17324D] focus:outline-none focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2]"
                  >
                    <option value="">Other Medical Equipment</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#17324D] mb-1.5">
                    Operating Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full text-xs bg-[#F3F8FE] border border-[#DCE6F0] rounded-lg px-3 py-2.5 text-[#17324D] focus:outline-none focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2]"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="OFFLINE">OFFLINE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="e.g. Mindray Medical"
                />

                <Input
                  label="Serial Number"
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  placeholder="e.g. SN-98124501"
                />
              </div>

              <Input
                label="Facility / Bay Location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Floor 2 - High Volume Clinical Bay B"
              />

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#17324D] mb-1.5">
                  Operating Specifications
                </label>
                <textarea
                  value={formData.specifications}
                  onChange={(e) => setFormData({ ...formData, specifications: e.target.value })}
                  placeholder="Throughput: 125 samples/hour, Power: 100-240V AC 50/60Hz, SF Cube 3D cellular analysis technology..."
                  rows={3}
                  className="w-full rounded-lg bg-[#F3F8FE] border border-[#DCE6F0] p-2.5 text-xs text-[#17324D] placeholder-[#7C8DA1] focus:bg-white focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_demo_checkbox"
                  checked={formData.is_demo}
                  onChange={(e) => setFormData({ ...formData, is_demo: e.target.checked })}
                  className="rounded border-[#DCE6F0] text-[#1976D2] focus:ring-[#1976D2] h-4 w-4"
                />
                <label htmlFor="is_demo_checkbox" className="text-xs text-[#5D7188] select-none cursor-pointer">
                  Mark as Demonstration / Sandbox Asset
                </label>
              </div>

              <div className="pt-4 border-t border-[#DCE6F0] flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createSubmitting || categoriesQuery.isLoading || categoriesQuery.isError || categories.length === 0}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={createSubmitting}
                  icon={createSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                >
                  {createSubmitting ? 'Registering...' : 'Register Asset'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MACHINE DELETION CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-machine-title">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D98B13] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-machine-title" className="font-bold text-sm text-[#17324D]">Delete machine?</h3>
                <p className="text-xs text-[#5D7188] mt-0.5">
                  Confirm deletion of <span className="font-semibold text-[#17324D]">{deleteTarget.name}</span>.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-5 leading-relaxed">
              The machine will be removed. Its knowledge entries will be hidden from My Knowledge while their content, review history, and files are retained. Procedures and other linked records remain, but lose this machine association.
            </div>

            {deleteError && <p role="alert" className="mb-4 text-sm text-rose-700">{deleteError}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={deleteSubmitting} onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={deleteSubmitting} onClick={() => void handleDeleteMachine()}>
                {deleteSubmitting ? 'Deleting…' : 'Delete machine'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
