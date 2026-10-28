import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiClientError } from '../../lib/api/client';
import {
  Wrench,
  MapPin,
  Tag,
  RefreshCw,
  Plus,
  Search,
  Eye,
  Trash2,
  X,
  Cpu,
  AlertTriangle,
  Building2,
  Calendar,
} from 'lucide-react';

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
  specifications?: string;
  is_demo?: boolean;
  tools: Tool[];
  created_at?: string;
  updated_at?: string;
}

interface MachineCategory {
  id: string;
  name: string;
  description?: string;
}

interface CreateMachineFormData {
  name: string;
  code: string;
  model_number: string;
  category: string;
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
  category: '',
  manufacturer: '',
  serial_number: '',
  location: '',
  status: 'ACTIVE',
  specifications: '',
  is_demo: false,
};

export const MachinesPage: React.FC = () => {
  const { hasPermission, hasRole } = useAuth();
  const canManageMachines = hasPermission('machine.manage') || hasRole('ADMIN') || hasRole('EXPERT');

  // List states
  const [machines, setMachines] = useState<Machine[]>([]);
  const [categories, setCategories] = useState<MachineCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

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

  // Backend gap deletion confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);

  // Load categories
  const fetchCategories = () => {
    api
      .get<MachineCategory[]>('/machines/categories')
      .then((data) => {
        setCategories(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.warn('Could not load categories:', err);
      });
  };

  // Load machines
  const fetchMachines = (query?: string, category?: string) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (query?.trim()) params.append('q', query.trim());
    if (category?.trim()) params.append('category', category.trim());

    const endpoint = `/machines${params.toString() ? `?${params.toString()}` : ''}`;

    api
      .get<{ items: Machine[] } | Machine[]>(endpoint)
      .then((data) => {
        if (Array.isArray(data)) {
          setMachines(data);
        } else if (data && Array.isArray((data as any).items)) {
          setMachines((data as any).items);
        } else {
          setMachines([]);
        }
        setLoading(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to retrieve machine catalog.';
        setError(msg);
        setMachines([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCategories();
    fetchMachines();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMachines(searchTerm, selectedCategory);
  };

  const handleCategoryChange = (catName: string) => {
    setSelectedCategory(catName);
    fetchMachines(searchTerm, catName);
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
        category: formData.category.trim() || undefined,
        manufacturer: formData.manufacturer.trim() || undefined,
        serial_number: formData.serial_number.trim() || undefined,
        location: formData.location.trim() || undefined,
        status: formData.status,
        specifications: formData.specifications.trim() || undefined,
        is_demo: formData.is_demo,
      };

      const created = await api.post<Machine>('/machines', payload);
      setCreateSuccess(`Machine "${created.name}" registered successfully.`);
      setFormData(INITIAL_FORM);
      fetchMachines(searchTerm, selectedCategory);
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#DCE6F0]">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2] shadow-xs">
              <Cpu className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#17324D]">Equipment &amp; Machine Assets</h1>
            <Badge variant="brand" size="sm">
              M00 · Active Catalog
            </Badge>
          </div>
          <p className="text-xs text-[#5D7188] max-w-2xl">
            Live directory of industrial laboratory diagnostic equipment, centrifuges, and analyzers with tooling mappings.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchMachines(searchTerm, selectedCategory)}
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
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Register Equipment
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-[#DCE6F0] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by equipment name or asset code..."
            leftIcon={<Search className="w-4 h-4 text-[#7C8DA1]" />}
            className="w-full text-xs"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            aria-label="Filter equipment by category"
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="text-xs bg-[#F3F8FE] border border-[#DCE6F0] rounded-lg px-3 py-2.5 text-[#17324D] focus:outline-none focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] transition-colors"
          >
            <option value="">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {(searchTerm || selectedCategory) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('');
                fetchMachines('', '');
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Global Error */}
      {error && (
        <Alert variant="error" title="Failed to Load Equipment">
          {error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => fetchMachines(searchTerm, selectedCategory)}>
              Retry Request
            </Button>
          </div>
        </Alert>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="py-16 text-center">
          <LoadingSpinner size="lg" message="Loading equipment catalog from live database..." />
        </div>
      ) : machines.length === 0 ? (
        <EmptyState
          icon={<Cpu className="w-6 h-6 text-[#1976D2]" />}
          title={searchTerm || selectedCategory ? 'No Matching Equipment Found' : 'No Equipment Assets Registered'}
          description={
            searchTerm || selectedCategory
              ? 'Try adjusting your search criteria or resetting the category filter.'
              : 'There are currently no machine assets in the database. Use Register Equipment to add one.'
          }
          action={
            searchTerm || selectedCategory ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('');
                  fetchMachines('', '');
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
          {machines.map((m) => (
            <Card
              key={m.id}
              title={m.name}
              subtitle={`${m.manufacturer || 'Medical Diagnostics'} · Code ${m.code || m.model_number || 'N/A'}`}
              badge={
                <Badge
                  variant={
                    m.status === 'ACTIVE'
                      ? 'success'
                      : m.status === 'MAINTENANCE'
                      ? 'warning'
                      : 'danger'
                  }
                  size="sm"
                  dot
                >
                  {m.status}
                </Badge>
              }
            >
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2 py-2 border-y border-[#E8EEF5] bg-[#F3F8FE] rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 text-[#5D7188]">
                    <Tag className="w-3.5 h-3.5 text-[#1976D2]" />
                    <span>Category:</span>
                    <span className="font-semibold text-[#17324D]">{m.category_name || m.category || 'General'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#5D7188]">
                    <MapPin className="w-3.5 h-3.5 text-[#1976D2]" />
                    <span>Cell:</span>
                    <span className="text-[#17324D]">{m.location || 'Diagnostic Wing'}</span>
                  </div>
                  <div className="col-span-2 text-[11px] font-mono text-[#5D7188] truncate">
                    SN: {m.serial_number || 'N/A'}
                  </div>
                </div>

                {m.specifications && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#5D7188] block mb-1">
                      Operating Specifications:
                    </span>
                    <p className="text-[11px] text-[#17324D] font-mono bg-[#F3F8FE] p-2 rounded-lg border border-[#DCE6F0] line-clamp-2">
                      {m.specifications}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-[#5D7188] flex items-center gap-1.5 mb-1.5">
                    <Wrench className="w-3.5 h-3.5 text-[#1976D2]" />
                    Associated Tooling ({m.tools?.length || 0}):
                  </span>
                  {!m.tools || m.tools.length === 0 ? (
                    <span className="text-[#7C8DA1] italic">No tools assigned.</span>
                  ) : (
                    <div className="space-y-1">
                      {m.tools.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-[#F3F8FE] border border-[#DCE6F0] text-[11px]"
                        >
                          <span className="font-medium text-[#17324D] truncate">{t.name}</span>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#EAF3FF] text-[#1976D2] border border-[#BCD7F5]">
                            {t.tool_number}
                          </span>
                        </div>
                      ))}
                      {m.tools.length > 2 && (
                        <p className="text-[10px] text-[#7C8DA1] text-right">
                          +{m.tools.length - 2} more toolings in detail view
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-2 flex items-center justify-between border-t border-[#E8EEF5]">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenDetail(m.id)}
                    icon={<Eye className="w-3.5 h-3.5 text-[#1976D2]" />}
                  >
                    Inspect Asset
                  </Button>

                  {canManageMachines && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(m)}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

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
                  <p className="text-xs text-[#5D7188]">Add an industrial laboratory machine asset to the catalog</p>
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
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full text-xs bg-[#F3F8FE] border border-[#DCE6F0] rounded-lg px-3 py-2.5 text-[#17324D] focus:outline-none focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2]"
                  >
                    <option value="">Select Category (or General)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
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
                  disabled={createSubmitting}
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

      {/* DELETE / BACKEND GAP CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D98B13] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#17324D]">Equipment Asset Deletion</h3>
                <p className="text-xs text-[#5D7188] mt-0.5">
                  Confirm action for: <span className="font-semibold text-[#17324D]">{deleteTarget.name}</span>
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-5 leading-relaxed">
              <span className="font-semibold block mb-1">Notice: Backend API Constraint</span>
              The backend API does not currently expose a <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[11px]">DELETE /api/v1/machines/&#123;id&#125;</code> endpoint. Machine assets are preserved to safeguard historical audit logs, guided workflow executions, and calibration records.
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
                Understood &amp; Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
