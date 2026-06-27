'use client';

import React, { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Search, ChevronDown, Plus, Check, X, Clock, User, Edit, Trash2, ArrowUpRight, 
  CheckCircle2, FileText, ShieldAlert, Sparkles, FolderPlus,
  Phone, Mail, MapPin, MessageSquare, AlertTriangle, Eye, RefreshCw, UserCheck
} from 'lucide-react';
import { 
  createTask, updateTask, completeTask, cancelTask, getTasks, bulkCompleteTasks, bulkCancelTasks,
  getActiveCustomersForSelect, getCustomerSubEntities
} from '@/actions/tasks';

interface TasksPageClientProps {
  orgSlug: string;
  currentUserId: string;
  currentUserRole: string;
  initialTasks: any[];
  members: { id: string; fullName: string }[];
}

export default function TasksPageClient({ 
  orgSlug, currentUserId, currentUserRole, initialTasks, members 
}: TasksPageClientProps) {
  const [tasks, setTasks] = useState<any[]>(initialTasks);
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bulk actions state
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [showBulkCompleteModal, setShowBulkCompleteModal] = useState(false);
  const [bulkCompleteOutcome, setBulkCompleteOutcome] = useState('');

  // Filters
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('open_active');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Task creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<string>('other');
  const [newPriority, setNewPriority] = useState<string>('normal');
  const [newDueAt, setNewDueAt] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newLocationId, setNewLocationId] = useState('');
  const [newContactId, setNewContactId] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState(currentUserId);
  
  // Dynamic lists from client-side Supabase queries
  const [customers, setCustomers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  // Search and dropdown states for customer selection
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  const filteredCustomersForSelect = customers.filter(c => {
    const searchLower = customerSearchQuery.toLowerCase();
    const legalNameMatch = c.legal_name?.toLowerCase().includes(searchLower) || false;
    const tradeNameMatch = c.trade_name?.toLowerCase().includes(searchLower) || false;
    return legalNameMatch || tradeNameMatch;
  });

  // Task actions modals
  const [taskToComplete, setTaskToComplete] = useState<any | null>(null);
  const [taskCompleteOutcome, setTaskCompleteOutcome] = useState('');
  const [planNextTask, setPlanNextTask] = useState(false);
  const [nextTaskTitle, setNextTaskTitle] = useState('');
  const [nextTaskType, setNextTaskType] = useState('call');
  const [nextTaskDueAt, setNextTaskDueAt] = useState('');

  const [taskToReassign, setTaskToReassign] = useState<any | null>(null);
  const [reassignUserId, setReassignUserId] = useState('');

  const [taskToPostpone, setTaskToPostpone] = useState<any | null>(null);

  // Initialize customer list on modal open using server action
  useEffect(() => {
    if (showCreateModal) {
      const loadCustomers = async () => {
        const res = await getActiveCustomersForSelect(orgSlug);
        if (!res.error) {
          setCustomers(res.data || []);
        }
      };
      loadCustomers();
    }
  }, [showCreateModal, orgSlug]);

  // Load contacts and locations when customer is selected in create form using server action
  useEffect(() => {
    if (newCustomerId) {
      const loadSubEntities = async () => {
        const res = await getCustomerSubEntities(newCustomerId);
        if (!res.error && res.data) {
          setLocations(res.data.locations || []);
          setContacts(res.data.contacts || []);
        }
      };
      loadSubEntities();
    } else {
      setLocations([]);
      setContacts([]);
      setNewLocationId('');
      setNewContactId('');
    }
  }, [newCustomerId]);

  const refreshTasks = async () => {
    const res = await getTasks(orgSlug);
    if (!res.error) {
      setTasks(res.data || []);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewTitle('');
    setNewDesc('');
    setNewCustomerId('');
    setNewLocationId('');
    setNewContactId('');
    setNewDueAt('');
    setNewType('other');
    setNewPriority('normal');
    setNewAssigneeId(currentUserId);
    setCustomerSearchQuery('');
    setIsCustomerDropdownOpen(false);
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append('title', newTitle);
    formData.append('description', newDesc);
    formData.append('customerId', newCustomerId);
    formData.append('locationId', newLocationId);
    formData.append('contactId', newContactId);
    formData.append('taskType', newType);
    formData.append('priority', newPriority);
    formData.append('dueAt', newDueAt);
    formData.append('assignedTo', newAssigneeId);

    startTransition(async () => {
      const res = await createTask(orgSlug, formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg('Tâche créée avec succès !');
        closeCreateModal();
        refreshTasks();
      }
    });
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToComplete) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await completeTask(orgSlug, taskToComplete.id, taskCompleteOutcome || null);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg('Tâche clôturée avec succès.');
        
        // Plan next task if checked
        if (planNextTask && nextTaskTitle.trim() && nextTaskDueAt) {
          const nextFormData = new FormData();
          nextFormData.append('title', nextTaskTitle);
          nextFormData.append('description', `Fait suite à la tâche : ${taskToComplete.title}. Note : ${taskCompleteOutcome || ''}`);
          nextFormData.append('customerId', taskToComplete.customer_id || '');
          nextFormData.append('locationId', taskToComplete.location_id || '');
          nextFormData.append('contactId', taskToComplete.contact_id || '');
          nextFormData.append('taskType', nextTaskType);
          nextFormData.append('priority', 'normal');
          nextFormData.append('dueAt', nextTaskDueAt);
          nextFormData.append('assignedTo', taskToComplete.assigned_to);

          const nextRes = await createTask(orgSlug, nextFormData);
          if (nextRes.error) {
            setErrorMsg(`Tâche clôturée, mais impossible de créer la relance : ${nextRes.error}`);
          } else {
            setSuccessMsg('Tâche clôturée et relance planifiée.');
          }
        }

        setTaskToComplete(null);
        setTaskCompleteOutcome('');
        setPlanNextTask(false);
        setNextTaskTitle('');
        setNextTaskDueAt('');
        setSelectedTaskIds(prev => prev.filter(id => id !== taskToComplete.id));
        refreshTasks();
      }
    });
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToReassign || !reassignUserId) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append('assignedTo', reassignUserId);

    startTransition(async () => {
      const res = await updateTask(orgSlug, taskToReassign.id, formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg('Tâche réattribuée avec succès.');
        setTaskToReassign(null);
        setReassignUserId('');
        refreshTasks();
      }
    });
  };

  const handlePostpone = async (days: number) => {
    if (!taskToPostpone) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    // Calculate new date
    const currentDue = new Date(taskToPostpone.due_at);
    currentDue.setDate(currentDue.getDate() + days);
    const newDueStr = currentDue.toISOString();

    const formData = new FormData();
    formData.append('dueAt', newDueStr);

    startTransition(async () => {
      const res = await updateTask(orgSlug, taskToPostpone.id, formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`Tâche reportée de ${days} jour(s).`);
        setTaskToPostpone(null);
        refreshTasks();
      }
    });
  };

  const handleCancelTask = async (taskId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette tâche ?')) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await cancelTask(orgSlug, taskId);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg('Tâche annulée.');
        setSelectedTaskIds(prev => prev.filter(id => id !== taskId));
        refreshTasks();
      }
    });
  };

  const handleBulkCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTaskIds.length === 0) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await bulkCompleteTasks(orgSlug, selectedTaskIds, bulkCompleteOutcome || null);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`${selectedTaskIds.length} tâches clôturées avec succès.`);
        setSelectedTaskIds([]);
        setBulkCompleteOutcome('');
        setShowBulkCompleteModal(false);
        refreshTasks();
      }
    });
  };

  const handleBulkCancel = async () => {
    if (selectedTaskIds.length === 0) return;
    if (!confirm(`Êtes-vous sûr de vouloir annuler ces ${selectedTaskIds.length} tâches ?`)) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await bulkCancelTasks(orgSlug, selectedTaskIds);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`${selectedTaskIds.length} tâches annulées.`);
        setSelectedTaskIds([]);
        refreshTasks();
      }
    });
  };

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    // 1. Assignee filter
    if (selectedAssignee !== 'all' && t.assigned_to !== selectedAssignee) return false;
    
    // 2. Status filter
    if (selectedStatus === 'open_active' && ['completed', 'cancelled'].includes(t.status)) return false;
    if (selectedStatus !== 'all' && selectedStatus !== 'open_active' && t.status !== selectedStatus) return false;

    // 3. Priority filter
    if (selectedPriority !== 'all' && t.priority !== selectedPriority) return false;

    // 4. Type filter
    if (selectedType !== 'all' && t.task_type !== selectedType) return false;

    // 5. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = t.title.toLowerCase().includes(q);
      const descMatch = t.description?.toLowerCase().includes(q);
      const clientMatch = t.customers?.legal_name?.toLowerCase().includes(q);
      if (!titleMatch && !descMatch && !clientMatch) return false;
    }

    return true;
  });

  // Active filtered tasks for bulk selection
  const filteredActiveTasks = filteredTasks.filter(t => !['completed', 'cancelled'].includes(t.status));

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
      case 'high': return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
      case 'normal': return 'bg-slate-100 text-slate-600 border border-slate-200';
      default: return 'bg-slate-50 text-slate-500 border border-slate-200';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
      case 'cancelled': return 'bg-slate-100 text-slate-400 border border-slate-200 line-through';
      case 'in_progress': return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
      default: return 'bg-indigo-50 text-primary border border-indigo-100';
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-3.5 w-3.5" />;
      case 'email': return <Mail className="h-3.5 w-3.5" />;
      case 'visit': return <MapPin className="h-3.5 w-3.5" />;
      case 'quote':
      case 'quote_follow_up': return <FileText className="h-3.5 w-3.5" />;
      default: return <MessageSquare className="h-3.5 w-3.5" />;
    }
  };

  const getTaskTypeName = (type: string) => {
    switch (type) {
      case 'call': return 'Appel';
      case 'email': return 'E-mail';
      case 'visit': return 'Visite';
      case 'meeting': return 'Réunion';
      case 'quote': return 'Devis';
      case 'quote_follow_up': return 'Relance Devis';
      default: return 'Tâche';
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-250 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-250 text-rose-800 text-sm font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Liste des Tâches CRM
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Visualisez et gérez toutes les actions programmées et l'historique d'activités.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={refreshTasks}
            variant="outline"
            className="border-slate-200 bg-white text-slate-650 h-9 w-9 p-0 flex items-center justify-center cursor-pointer shadow-3xs hover:bg-slate-50"
            title="Rafraîchir la liste"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-primary hover:bg-primary/95 text-white font-bold text-xs h-9 cursor-pointer flex gap-1 shadow-xs"
          >
            <Plus className="h-4 w-4" />
            Créer une tâche
          </Button>
        </div>
      </div>

      {/* Filters Board */}
      <Card className="p-5 border-slate-200 bg-white rounded-2xl shadow-3xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {/* 1. Search */}
          <div className="grid gap-1 md:col-span-2">
            <Label htmlFor="searchTask" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Rechercher par mot-clé ou client
            </Label>
            <Input
              id="searchTask"
              placeholder="ex: Relancer, Dupont, poisson..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-slate-250 text-xs h-9 shadow-3xs"
            />
          </div>

          {/* 2. Assignee */}
          <div className="grid gap-1">
            <Label htmlFor="assignee" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Responsable
            </Label>
            <select
              id="assignee"
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="bg-white border border-slate-250 rounded-lg px-2 py-1 text-xs text-slate-850 h-9 outline-none focus:border-primary shadow-3xs"
            >
              <option value="all">Tous les collaborateurs</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </select>
          </div>

          {/* 3. Status */}
          <div className="grid gap-1">
            <Label htmlFor="status" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Statut
            </Label>
            <select
              id="status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white border border-slate-250 rounded-lg px-2 py-1 text-xs text-slate-850 h-9 outline-none focus:border-primary shadow-3xs"
            >
              <option value="open_active">Actives (Ouvertes & En cours)</option>
              <option value="all">Tous les statuts</option>
              <option value="open">Ouvertes</option>
              <option value="in_progress">En cours</option>
              <option value="completed">Clôturées</option>
              <option value="cancelled">Annulées</option>
            </select>
          </div>

          {/* 4. Priority */}
          <div className="grid gap-1">
            <Label htmlFor="priority" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Priorité
            </Label>
            <select
              id="priority"
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-white border border-slate-250 rounded-lg px-2 py-1 text-xs text-slate-850 h-9 outline-none focus:border-primary shadow-3xs"
            >
              <option value="all">Toutes</option>
              <option value="low">Faible</option>
              <option value="normal">Normale</option>
              <option value="high">Haute</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Bulk actions bar */}
      {selectedTaskIds.length > 0 && (
        <Card className="p-4 border-emerald-255 bg-emerald-50/50 rounded-2xl shadow-3xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-800">
              {selectedTaskIds.length} tâche(s) sélectionnée(s)
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => {
                setBulkCompleteOutcome('');
                setShowBulkCompleteModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-650 text-white font-bold text-xs h-8 cursor-pointer shadow-xs"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Clôturer les tâches
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkCancel}
              className="border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-600 font-bold text-xs h-8 cursor-pointer"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Annuler les tâches
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedTaskIds([])}
              className="text-slate-500 hover:text-slate-750 font-semibold text-xs h-8 cursor-pointer"
            >
              Désélectionner tout
            </Button>
          </div>
        </Card>
      )}

      {/* Tasks Table */}
      <Card className="border border-slate-200 bg-white rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {filteredTasks.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Clock className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-sm">Aucune tâche trouvée</p>
              <p className="text-xs mt-1">Ajustez vos filtres pour voir d'autres tâches.</p>
            </div>
          ) : (
            <Table className="text-xs text-left">
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-200 hover:bg-transparent">
                  <TableHead className="py-3 px-4 text-center w-[40px]">
                    <input
                      type="checkbox"
                      checked={filteredActiveTasks.length > 0 && filteredActiveTasks.every(t => selectedTaskIds.includes(t.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const activeIds = filteredActiveTasks.map(t => t.id);
                          setSelectedTaskIds(prev => Array.from(new Set([...prev, ...activeIds])));
                        } else {
                          const activeIds = filteredActiveTasks.map(t => t.id);
                          setSelectedTaskIds(prev => prev.filter(id => !activeIds.includes(id)));
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="py-3 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[20%]">Tâche</TableHead>
                  <TableHead className="py-3 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[18%]">Client</TableHead>
                  <TableHead className="py-3 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[12%]">Type</TableHead>
                  <TableHead className="py-3 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[12%]">Priorité</TableHead>
                  <TableHead className="py-3 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[12%]">Date d'échéance</TableHead>
                  <TableHead className="py-3 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[12%]">Assigné à</TableHead>
                  <TableHead className="py-3 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[10%]">Statut</TableHead>
                  <TableHead className="py-3 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-[16%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {filteredTasks.map((t) => {
                  const isOverdue = (t.status === 'open' || t.status === 'in_progress') && new Date(t.due_at) < new Date();
                  const isClosed = ['completed', 'cancelled'].includes(t.status);

                  return (
                    <TableRow key={t.id} className="hover:bg-slate-50/20 group">
                      {/* Checkbox column */}
                      <td className="py-3.5 px-4 text-center">
                        {!isClosed && (
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.includes(t.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTaskIds(prev => [...prev, t.id]);
                              } else {
                                setSelectedTaskIds(prev => prev.filter(id => id !== t.id));
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          />
                        )}
                      </td>

                      {/* Title */}
                      <td className="py-3.5 px-6 font-semibold text-slate-800">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900">{t.title}</p>
                          {t.description && (
                            <p className="text-[11px] text-slate-450 font-normal line-clamp-1 group-hover:line-clamp-none max-w-sm">
                              {t.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-3.5 px-4">
                        {t.customers?.legal_name ? (
                          <Link 
                            href={`/${orgSlug}/customers/${t.customer_id}`}
                            className="font-bold text-primary hover:underline flex items-center gap-1"
                          >
                            <span className="truncate max-w-[120px]">{t.customers.legal_name}</span>
                            <ArrowUpRight className="h-3 w-3 shrink-0" />
                          </Link>
                        ) : (
                          <span className="text-slate-400 italic">Générale (Aucun)</span>
                        )}
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-450">{getTaskIcon(t.task_type)}</span>
                          <span>{getTaskTypeName(t.task_type)}</span>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPriorityBadgeClass(t.priority)}`}>
                          {t.priority === 'urgent' && 'Urgente'}
                          {t.priority === 'high' && 'Haute'}
                          {t.priority === 'normal' && 'Normale'}
                          {t.priority === 'low' && 'Faible'}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4">
                        <span className={`font-mono ${isOverdue ? 'text-rose-600 font-bold' : 'text-slate-650'}`}>
                          {new Date(t.due_at).toLocaleDateString('fr-BE')}
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {new Date(t.due_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      </td>

                      {/* Assignee */}
                      <td className="py-3.5 px-4 text-slate-600 font-semibold">
                        {members.find(m => m.id === t.assigned_to)?.fullName || 'Inconnu'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(t.status)}`}>
                          {t.status === 'completed' && 'Clôturée'}
                          {t.status === 'cancelled' && 'Annulée'}
                          {t.status === 'in_progress' && 'En cours'}
                          {t.status === 'open' && 'Ouverte'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right space-x-1">
                        {!isClosed ? (
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => {
                                setTaskToComplete(t);
                                setPlanNextTask(false);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-650 text-white h-7 px-2.5 rounded-lg text-[10px] font-bold cursor-pointer"
                              title="Terminer la tâche"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTaskToPostpone(t)}
                              className="border-slate-200 hover:bg-slate-50 text-slate-700 h-7 px-2.5 rounded-lg text-[10px] font-bold cursor-pointer"
                              title="Reporter l'échéance"
                            >
                              Reporter
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setTaskToReassign(t);
                                setReassignUserId(t.assigned_to);
                              }}
                              className="border-slate-200 hover:bg-slate-50 text-slate-700 h-7 px-2.5 rounded-lg text-[10px] font-bold cursor-pointer"
                              title="Réassigner la tâche"
                            >
                              Réattribuer
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancelTask(t.id)}
                              className="text-slate-400 hover:text-rose-600 h-7 w-7 p-0 cursor-pointer rounded-lg inline-flex items-center justify-center"
                              title="Annuler"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          t.outcome && (
                            <span className="text-[10px] text-slate-450 italic truncate block max-w-[150px] ml-auto">
                              {t.outcome}
                            </span>
                          )
                        )}
                      </td>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* CREATE TASK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-slate-200 shadow-2xl rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <FolderPlus className="h-5 w-5 text-primary" />
                Créer une tâche commerciale
              </h3>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="space-y-4">
              <div className="grid gap-1">
                <Label htmlFor="newTitle" className="text-xs font-semibold text-slate-700">Titre de la tâche *</Label>
                <Input
                  id="newTitle"
                  required
                  placeholder="ex: Relancer M. Dupont pour confirmation"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="border-slate-200"
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="newDesc" className="text-xs font-semibold text-slate-700">Description / Objectif</Label>
                <textarea
                  id="newDesc"
                  placeholder="Détaillez l'objectif de cette tâche..."
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="newType" className="text-xs font-semibold text-slate-700">Type d'activité *</Label>
                  <select
                    id="newType"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs"
                  >
                    <option value="call">Appel téléphonique</option>
                    <option value="email">E-mail</option>
                    <option value="visit">Visite terrain</option>
                    <option value="meeting">Réunion</option>
                    <option value="quote">Élaborer une offre</option>
                    <option value="other">Autre</option>
                  </select>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="newPriority" className="text-xs font-semibold text-slate-700">Priorité *</Label>
                  <select
                    id="newPriority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs"
                  >
                    <option value="low">Faible</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="newDueAt" className="text-xs font-semibold text-slate-700">Date d'échéance *</Label>
                  <Input
                    id="newDueAt"
                    type="datetime-local"
                    required
                    value={newDueAt}
                    onChange={(e) => setNewDueAt(e.target.value)}
                    className="border-slate-200 text-xs"
                  />
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="newAssignee" className="text-xs font-semibold text-slate-700">Assigner à *</Label>
                  <select
                    id="newAssignee"
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs"
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-700">Rattachement Client</h4>
                
                <div className="grid gap-1">
                  <Label htmlFor="newCustomerId" className="text-xs font-semibold text-slate-700">Sélectionner un client / prospect</Label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                      className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs text-left cursor-pointer hover:border-slate-300 transition-colors"
                    >
                      <span className="truncate">
                        {newCustomerId 
                          ? (customers.find(c => c.id === newCustomerId)?.trade_name || customers.find(c => c.id === newCustomerId)?.legal_name || 'Client sélectionné') 
                          : '-- Aucun client (Tâche générale) --'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                    </button>

                    {isCustomerDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => {
                            setIsCustomerDropdownOpen(false);
                            setCustomerSearchQuery('');
                          }} 
                        />
                        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white p-2 shadow-lg glass-panel animate-in fade-in slide-in-from-top-1 duration-100 max-h-72 overflow-hidden flex flex-col">
                          <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Rechercher un client..."
                              value={customerSearchQuery}
                              onChange={(e) => setCustomerSearchQuery(e.target.value)}
                              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-hidden focus:border-primary focus:bg-white transition-all"
                              autoFocus
                            />
                          </div>
                          <div className="overflow-y-auto space-y-1 pr-1 flex-1">
                            <button
                              type="button"
                              onClick={() => {
                                setNewCustomerId('');
                                setIsCustomerDropdownOpen(false);
                                setCustomerSearchQuery('');
                              }}
                              className={`flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-left cursor-pointer transition-colors ${
                                !newCustomerId ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              -- Aucun client (Tâche générale) --
                            </button>
                            
                            {filteredCustomersForSelect.length === 0 ? (
                              <p className="text-center text-xs text-slate-400 py-3">Aucun client trouvé</p>
                            ) : (
                              filteredCustomersForSelect.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setNewCustomerId(c.id);
                                    setIsCustomerDropdownOpen(false);
                                    setCustomerSearchQuery('');
                                  }}
                                  className={`flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-left cursor-pointer transition-colors ${
                                    newCustomerId === c.id ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  {c.trade_name ? (
                                    <span>{c.trade_name} <span className="text-[10px] text-slate-450 font-normal">({c.legal_name})</span></span>
                                  ) : (
                                    <span>{c.legal_name}</span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {newCustomerId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-1">
                      <Label htmlFor="newLocationId" className="text-xs font-semibold text-slate-700">Établissement client</Label>
                      <select
                        id="newLocationId"
                        value={newLocationId}
                        onChange={(e) => setNewLocationId(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs"
                      >
                        <option value="">-- Sélectionner un établissement --</option>
                        {locations.map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.address.city})</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <Label htmlFor="newContactId" className="text-xs font-semibold text-slate-700">Contact client</Label>
                      <select
                        id="newContactId"
                        value={newContactId}
                        onChange={(e) => setNewContactId(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs"
                      >
                        <option value="">-- Sélectionner un contact --</option>
                        {contacts.map(c => (
                          <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-105">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreateModal}
                  className="border-slate-200 text-slate-700 font-bold text-xs h-9"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90 text-white font-bold text-xs h-9 cursor-pointer"
                >
                  {isPending ? 'Création...' : 'Créer la tâche'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* COMPLETE TASK MODAL */}
      {taskToComplete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-slate-200 shadow-2xl rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Check className="h-5 w-5 text-emerald-600" />
                Clôturer la tâche commerciale
              </h3>
              <button onClick={() => setTaskToComplete(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-semibold italic">
              Sujet : {taskToComplete.title}
            </p>

            <form onSubmit={handleCompleteSubmit} className="space-y-4">
              <div className="grid gap-1">
                <Label htmlFor="completeOutcome" className="text-xs font-bold text-slate-700">Compte-rendu / Résultat *</Label>
                <textarea
                  id="completeOutcome"
                  required
                  placeholder="Décrivez le résultat..."
                  rows={3}
                  value={taskCompleteOutcome}
                  onChange={(e) => setTaskCompleteOutcome(e.target.value)}
                  className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {taskToComplete.customer_id && (
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div className="flex items-center gap-2 select-none">
                    <input
                      id="planNextTask"
                      type="checkbox"
                      checked={planNextTask}
                      onChange={(e) => setPlanNextTask(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                    />
                    <Label htmlFor="planNextTask" className="text-xs text-slate-700 font-bold cursor-pointer">
                      Planifier immédiatement une relance suivante
                    </Label>
                  </div>

                  {planNextTask && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
                      <div className="grid gap-1">
                        <Label htmlFor="nextTitle" className="text-[10px] font-bold text-slate-500 uppercase">Titre *</Label>
                        <Input
                          id="nextTitle"
                          required={planNextTask}
                          placeholder="Rappeler pour relancer"
                          value={nextTaskTitle}
                          onChange={(e) => setNextTaskTitle(e.target.value)}
                          className="border-slate-200 h-8 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1">
                          <Label htmlFor="nextType" className="text-[10px] font-bold text-slate-500 uppercase">Type *</Label>
                          <select
                            id="nextType"
                            value={nextTaskType}
                            onChange={(e) => setNextTaskType(e.target.value)}
                            className="flex h-8 w-full rounded-md border border-slate-250 bg-white px-2 py-0 text-xs shadow-xs"
                          >
                            <option value="call">Appel</option>
                            <option value="email">E-mail</option>
                            <option value="visit">Visite</option>
                            <option value="meeting">Réunion</option>
                            <option value="quote">Devis</option>
                            <option value="other">Autre</option>
                          </select>
                        </div>

                        <div className="grid gap-1">
                          <Label htmlFor="nextDue" className="text-[10px] font-bold text-slate-500 uppercase">Échéance *</Label>
                          <Input
                            id="nextDue"
                            type="datetime-local"
                            required={planNextTask}
                            value={nextTaskDueAt}
                            onChange={(e) => setNextTaskDueAt(e.target.value)}
                            className="border-slate-250 h-8 text-xs px-2"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-105">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTaskToComplete(null)}
                  className="border-slate-200 text-slate-700 font-bold text-xs h-9"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-650 text-white font-bold text-xs h-9 cursor-pointer"
                >
                  {isPending ? 'Enregistrement...' : 'Clôturer la tâche'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* REASSIGN TASK MODAL */}
      {taskToReassign && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-slate-200 shadow-2xl rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <UserCheck className="h-5 w-5 text-primary" />
                Réattribuer la tâche
              </h3>
              <button onClick={() => setTaskToReassign(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-semibold italic">
              Sujet : {taskToReassign.title}
            </p>

            <form onSubmit={handleReassignSubmit} className="space-y-4">
              <div className="grid gap-1">
                <Label htmlFor="reassignSelect" className="text-xs font-bold text-slate-700">Choisir un nouveau responsable *</Label>
                <select
                  id="reassignSelect"
                  required
                  value={reassignUserId}
                  onChange={(e) => setReassignUserId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">-- Choisir un collaborateur --</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.fullName}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-105">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTaskToReassign(null)}
                  className="border-slate-200 text-slate-700 font-bold text-xs h-9"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90 text-white font-bold text-xs h-9 cursor-pointer"
                >
                  {isPending ? 'Mise à jour...' : 'Réattribuer'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* POSTPONE TASK MODAL */}
      {taskToPostpone && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-slate-200 shadow-2xl rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Clock className="h-5 w-5 text-amber-500" />
                Reporter la tâche
              </h3>
              <button onClick={() => setTaskToPostpone(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-semibold italic">
              Sujet : {taskToPostpone.title}
            </p>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => handlePostpone(1)}
                disabled={isPending}
                className="text-xs font-bold border-slate-200 py-3 h-auto hover:bg-slate-50 cursor-pointer"
              >
                + 1 Jour
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePostpone(3)}
                disabled={isPending}
                className="text-xs font-bold border-slate-200 py-3 h-auto hover:bg-slate-50 cursor-pointer"
              >
                + 3 Jours
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePostpone(7)}
                disabled={isPending}
                className="text-xs font-bold border-slate-200 py-3 h-auto hover:bg-slate-50 cursor-pointer"
              >
                + 1 Semaine
              </Button>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-105">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTaskToPostpone(null)}
                className="border-slate-200 text-slate-700 font-bold text-xs h-9"
              >
                Annuler
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* BULK COMPLETE TASK MODAL */}
      {showBulkCompleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-slate-200 shadow-2xl rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Check className="h-5 w-5 text-emerald-600" />
                Clôturer les {selectedTaskIds.length} tâches sélectionnées
              </h3>
              <button onClick={() => setShowBulkCompleteModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleBulkCompleteSubmit} className="space-y-4">
              <div className="grid gap-1">
                <Label htmlFor="bulkCompleteOutcome" className="text-xs font-bold text-slate-700">Compte-rendu / Résultat commun *</Label>
                <textarea
                  id="bulkCompleteOutcome"
                  required
                  placeholder="Décrivez le résultat commun pour ces tâches..."
                  rows={3}
                  value={bulkCompleteOutcome}
                  onChange={(e) => setBulkCompleteOutcome(e.target.value)}
                  className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-105">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowBulkCompleteModal(false)}
                  className="border-slate-200 text-slate-700 font-bold text-xs h-9"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-650 text-white font-bold text-xs h-9 cursor-pointer"
                >
                  {isPending ? 'Enregistrement...' : 'Clôturer les tâches'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
