'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { updateCustomer, getCustomers } from '@/actions/customers';
import { mergeCustomersAction } from '@/actions/mergeCustomers';
import { extractWeightFromArticleName } from '@/utils/caliberHelper';
import { 
  createLocation, 
  updateLocation, 
  setPrimaryLocation, 
  archiveLocation 
} from '@/actions/locations';
import { 
  createContact, 
  updateContact, 
  setPrimaryContact, 
  archiveContact 
} from '@/actions/contacts';
import { 
  createActivity, 
  updateActivity, 
  pinActivity 
} from '@/actions/activities';
import { getCustomerTimeline } from '@/actions/timeline';
import { createTask, updateTask, completeTask } from '@/actions/tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogClose 
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ChevronLeft, 
  Save, 
  Percent, 
  ShieldAlert, 
  History, 
  MapPin, 
  User, 
  Plus, 
  Star, 
  Building, 
  Phone, 
  Mail, 
  Calendar, 
  Sparkles, 
  Check, 
  CheckCircle,
  Trash2, 
  Edit, 
  MessageSquare, 
  ArrowRight, 
  Pin, 
  PinOff,
  Video,
  Coffee,
  Beaker,
  AlertCircle,
  FileText,
  Clock,
  GitMerge,
  TrendingUp,
  PieChart,
  ShoppingBag,
  Scale
} from 'lucide-react';

interface MarginRule {
  id: string;
  rule_type: string;
  margin_rate: string;
  product_id: string | null;
  priority: number;
}

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total_amount: string | null;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
  location_type: string;
  address: {
    line1: string;
    line2?: string;
    postalCode: string;
    city: string;
    region?: string;
    countryCode: string;
  };
  phone: string | null;
  email: string | null;
  delivery_notes: string | null;
  is_primary: boolean;
  is_active: boolean;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  department: string | null;
  email: string | null;
  secondary_email: string | null;
  phone: string | null;
  mobile: string | null;
  preferred_channel: string | null;
  language: string;
  decision_role: string;
  influence_level: string;
  notes: string | null;
  is_primary: boolean;
  is_active: boolean;
  do_not_contact: boolean;
  location_id: string | null;
}

interface Customer {
  id: string;
  name: string;
  trade_name: string | null;
  code: string | null;
  segment: string;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  notes: string | null;
  internal_notes: string | null;
  is_active: boolean;
  lifecycle_status: string;
  potential_level: string;
  owner_user_id: string;
  last_activity_at: string | null;
  next_activity_at: string | null;
  created_at: string;
  marginRules: MarginRule[];
  quotes: Quote[];
  contacts: Contact[];
  locations: Location[];
}

interface Member {
  id: string;
  fullName: string;
}

interface TimelineEntry {
  entry_key: string;
  source: 'activity' | 'crm_event' | 'quote_event';
  event_type: string;
  title: string;
  body: string | null;
  actor_user_id: string | null;
  actor_name: string;
  contact_id: string | null;
  quote_id: string | null;
  task_id: string | null;
  occurred_at: string;
  metadata: {
    direction?: string;
    outcome?: string;
    duration_minutes?: number;
    is_pinned?: boolean;
    old_status?: string;
    new_status?: string;
    reason?: string;
    [key: string]: any;
  };
}

interface Task {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  task_type: string;
  due_at: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
}

interface CustomerDetailsClientProps {
  orgSlug: string;
  customerId: string;
  initialCustomer: Customer | null;
  error: string | null;
  members: Member[];
  initialTasks: Task[];
  initialOrders?: any[];
}

export default function CustomerDetailsClient({
  orgSlug,
  customerId,
  initialCustomer,
  error: fetchError,
  members,
  initialTasks = [],
  initialOrders = [],
}: CustomerDetailsClientProps) {
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [error, setError] = useState<string | null>(fetchError);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // --- STATISTIQUES ET OPPORTUNITÉS D'ACHATS ---
  const stats = useMemo(() => {
    const orders = initialOrders || [];
    
    // 1. Top Produits
    const productMap = new Map<string, { name: string; totalWeight: number; orderCount: number; lastOrderedAt: string }>();
    let totalRevenue = 0;
    let totalWeight = 0;
    
    orders.forEach((order: any) => {
      const items = order.order_items || [];
      items.forEach((item: any) => {
        const name = item.product_name || '';
        const weight = extractWeightFromArticleName(name);
        const price = item.price_applied ? parseFloat(item.price_applied) : 15.00;
        
        totalWeight += weight;
        totalRevenue += weight * price;
        
        const existing = productMap.get(name);
        if (existing) {
          existing.totalWeight += weight;
          existing.orderCount += 1;
          if (new Date(order.created_at) > new Date(existing.lastOrderedAt)) {
            existing.lastOrderedAt = order.created_at;
          }
        } else {
          productMap.set(name, {
            name,
            totalWeight: weight,
            orderCount: 1,
            lastOrderedAt: order.created_at,
          });
        }
      });
    });

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.orderCount - a.orderCount || b.totalWeight - a.totalWeight);

    // 2. Catégories
    let poissonCount = 0;
    let crustaceCount = 0;
    let coquillageCount = 0;
    let traiteurCount = 0;

    const poissonKeywords = ['cabillaud', 'cabillaut', 'julienne', 'lieu', 'colin', 'églefin', 'eglefin', 'turbot', 'bar', 'sole', 'limande', 'plie', 'carrelet', 'daurade', 'dorade', 'merlan', 'maquereau', 'sardine', 'saumon', 'truite', 'thon', 'espadon'];
    const crustaceKeywords = ['homard', 'langouste', 'crabe', 'tourteau', 'crevette', 'gambas', 'langoustine', 'araignée'];
    const coquillageKeywords = ['huître', 'huitre', 'moule', 'coque', 'palourde', 'jacques', 'couteau'];
    const traiteurKeywords = ['maatjes', 'maatje', 'fumé', 'soupe', 'terrine', 'rillettes', 'salade', 'sauce'];

    topProducts.forEach((p) => {
      const nameLower = p.name.toLowerCase();
      if (poissonKeywords.some(kw => nameLower.includes(kw))) poissonCount += p.orderCount;
      else if (crustaceKeywords.some(kw => nameLower.includes(kw))) crustaceCount += p.orderCount;
      else if (coquillageKeywords.some(kw => nameLower.includes(kw))) coquillageCount += p.orderCount;
      else if (traiteurKeywords.some(kw => nameLower.includes(kw))) traiteurCount += p.orderCount;
      else poissonCount += p.orderCount; // Fallback par défaut
    });

    const totalCategoryCount = poissonCount + crustaceCount + coquillageCount + traiteurCount || 1;

    // 3. Recommandations IA d'Opportunités
    const recommendations: { type: 'warning' | 'info'; title: string; description: string }[] = [];

    // Détection de rupture de consommation (sur les Top Produits commandés au moins 2 fois)
    const now = new Date();
    topProducts.forEach((p) => {
      if (p.orderCount >= 2) {
        const lastDate = new Date(p.lastOrderedAt);
        const diffDays = Math.ceil((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 14) {
          recommendations.push({
            type: 'warning',
            title: `Rupture de consommation : ${p.name}`,
            description: `Ce produit phare (commandé ${p.orderCount} fois) n'a plus été acheté depuis le ${lastDate.toLocaleDateString('fr-FR')} (il y a ${diffDays} jours). Pensez à lui proposer !`
          });
        }
      }
    });

    // Détection de cross-selling
    if (orders.length > 0) {
      if (crustaceCount === 0) {
        recommendations.push({
          type: 'info',
          title: 'Opportunité : Gamme Crustacés',
          description: 'Ce client n\'a encore jamais commandé de crustacés (homard, tourteau, crevette). Proposez-lui nos arrivages de saison !'
        });
      }
      if (coquillageCount === 0) {
        recommendations.push({
          type: 'info',
          title: 'Opportunité : Gamme Coquillages',
          description: 'Aucun coquillage n\'a été acheté récemment. Présentez-lui notre sélection d\'huîtres Ostra Regal ou de moules de bouchot.'
        });
      }
    }

    return {
      topProducts,
      categories: {
        poisson: Math.round((poissonCount / totalCategoryCount) * 100),
        crustace: Math.round((crustaceCount / totalCategoryCount) * 100),
        coquillage: Math.round((coquillageCount / totalCategoryCount) * 100),
        traiteur: Math.round((traiteurCount / totalCategoryCount) * 100),
      },
      recommendations,
      totalOrders: orders.length,
      totalRevenue,
      totalWeight
    };
  }, [initialOrders]);

  // Timeline state
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'activities' | 'quotes' | 'tasks' | 'notes' | 'system'>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Quick log activity state
  const [quickActivityType, setQuickActivityType] = useState<'call' | 'email' | 'visit' | 'note'>('call');
  const [quickSubject, setQuickSubject] = useState('Appel sortant');
  const [showNextTask, setShowNextTask] = useState(false);

  // Modals
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingActivity, setEditingActivity] = useState<TimelineEntry | null>(null);

  // States pour la fusion de clients
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  // Charger tous les clients pour la fusion lorsque le dialogue s'ouvre
  useEffect(() => {
    if (isMergeDialogOpen) {
      const loadAllCustomers = async () => {
        try {
          const result = await getCustomers(orgSlug);
          if (result && result.data && Array.isArray(result.data)) {
            // Filtrer pour exclure le client actuel
            setAllCustomers(result.data.filter((c: any) => c.id !== customerId));
          }
        } catch (err) {
          console.error("Erreur de chargement des clients :", err);
        }
      };
      loadAllCustomers();
    }
  }, [isMergeDialogOpen, orgSlug, customerId]);

  const handleMergeConfirm = async () => {
    if (!selectedTargetId) return;
    setIsMerging(true);
    setError(null);
    try {
      const result = await mergeCustomersAction(orgSlug, customerId, selectedTargetId);
      if (result.success) {
        setIsMergeDialogOpen(false);
        // Rediriger vers la fiche du client fusionné cible
        window.location.href = `/${orgSlug}/customers/${selectedTargetId}`;
      } else {
        setError(result.error || 'Erreur lors de la fusion des fiches.');
        setIsMerging(false);
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur inattendue est survenue.');
      setIsMerging(false);
    }
  };

  const filteredCustomers = allCustomers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.trade_name && c.trade_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.code && c.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Load timeline and current user ID
  useEffect(() => {
    const loadTimeline = async () => {
      try {
        const result = await getCustomerTimeline(customerId);
        if (result.data) {
          setTimeline(result.data as TimelineEntry[]);
        }
      } catch (err) {
        console.error('Failed to load timeline:', err);
      }
    };

    const fetchSession = async () => {
      try {
        // We can get user ID from supabase client or window auth session if available.
        // For server action getUser, we don't have direct access here, but we can call standard auth endpoints.
        // We'll set a mock or get it dynamically if needed. We can decode it from context or we can fetch a dummy endpoint.
        // Let's call supabase.auth.getUser() on client.
        const { createClient: createBrowserClient } = await import('@/lib/supabase/client');
        const supabase = createBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
        }
      } catch (err) {
        console.error('Error fetching user session:', err);
      }
    };

    loadTimeline();
    fetchSession();
  }, [customerId]);

  useEffect(() => {
    // Set default subjects based on activity type
    if (quickActivityType === 'call') setQuickSubject('Appel sortant');
    else if (quickActivityType === 'email') setQuickSubject('E-mail envoyé');
    else if (quickActivityType === 'visit') setQuickSubject('Visite client');
    else if (quickActivityType === 'note') setQuickSubject('Note de suivi');
  }, [quickActivityType]);

  if (!customer) {
    return (
      <div className="space-y-4">
        <Link href={`/${orgSlug}/customers`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ChevronLeft className="h-4 w-4" />
          Retour aux clients
        </Link>
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          Client introuvable.
        </div>
      </div>
    );
  }

  const handleToggleTask = (taskId: string, currentStatus: string) => {
    setError(null);
    startTransition(async () => {
      let result;
      if (currentStatus === 'completed') {
        const formData = new FormData();
        formData.append('status', 'open');
        result = await updateTask(orgSlug, taskId, formData);
      } else {
        result = await completeTask(orgSlug, taskId, 'Complété depuis la fiche client');
      }

      if (result.error) {
        setError(result.error);
      } else if (result.success && result.data) {
        setTasks(prev => prev.map(t => t.id === taskId ? { 
          ...t, 
          status: result.data.status 
        } : t));
        
        const timelineResult = await getCustomerTimeline(customerId);
        if (timelineResult.data) {
          setTimeline(timelineResult.data);
        }
      }
    });
  };

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.append('customerId', customerId);

    startTransition(async () => {
      const result = await createTask(orgSlug, formData);
      if (result.error) {
        setError(result.error);
      } else if (result.success && result.data) {
        setIsAddTaskOpen(false);
        
        const assignedId = formData.get('assignedTo') as string;
        const member = members.find(m => m.id === assignedId);
        const assignedName = member ? member.fullName : 'Non assigné';

        const newTask: Task = {
          id: result.data.id,
          title: result.data.title,
          status: result.data.status,
          priority: result.data.priority,
          task_type: result.data.task_type,
          due_at: result.data.due_at,
          assigned_to_user_id: result.data.assigned_to,
          assigned_to_name: assignedName
        };

        setTasks(prev => [newTask, ...prev]);

        const timelineResult = await getCustomerTimeline(customerId);
        if (timelineResult.data) {
          setTimeline(timelineResult.data);
        }
      }
    });
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await updateCustomer(orgSlug, customerId, formData);
        if (result.error) {
          throw new Error(result.error);
        }
        if (result.data) {
          setCustomer(prev => ({
            ...prev!,
            ...result.data,
            name: result.data.name,
          }));
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue lors de la modification.';
        setError(errMsg);
      }
    });
  };

  // Quick activity log handler
  const handleQuickActivity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Make sure customerId and type is appended
    formData.append('customerId', customerId);
    formData.append('activityType', quickActivityType);

    startTransition(async () => {
      try {
        const result = await createActivity(orgSlug, formData);
        if (result.error) throw new Error(result.error);
        
        // Reload timeline
        const timelineResult = await getCustomerTimeline(customerId);
        if (timelineResult.data) {
          setTimeline(timelineResult.data as TimelineEntry[]);
        }

        // Reset quick log form
        form.reset();
        setShowNextTask(false);
        setQuickActivityType('call');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Impossible d\'enregistrer l\'activité.');
      }
    });
  };

  // Activity Edit
  const handleEditActivity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingActivity) return;
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const actId = editingActivity.entry_key.split(':')[1];
        const result = await updateActivity(orgSlug, actId, formData);
        if (result.error) throw new Error(result.error);

        // Reload timeline
        const timelineResult = await getCustomerTimeline(customerId);
        if (timelineResult.data) {
          setTimeline(timelineResult.data as TimelineEntry[]);
        }
        setEditingActivity(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Impossible de modifier l\'activité.');
      }
    });
  };

  // Activity Pin
  const handlePinActivity = async (entryKey: string, isPinned: boolean) => {
    setError(null);
    try {
      const actId = entryKey.split(':')[1];
      const result = await pinActivity(orgSlug, actId, isPinned);
      if (result.error) throw new Error(result.error);

      // Reload timeline
      const timelineResult = await getCustomerTimeline(customerId);
      if (timelineResult.data) {
        setTimeline(timelineResult.data as TimelineEntry[]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors du changement d\'épinglage.');
    }
  };

  // Location handlers
  const handleAddLocation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await createLocation(orgSlug, customerId, formData);
        if (result.error) throw new Error(result.error);
        if (result.data) {
          setCustomer(prev => {
            if (!prev) return null;
            const locs = prev.locations.map(l => 
              result.data.is_primary ? { ...l, is_primary: false } : l
            );
            return {
              ...prev,
              locations: [...locs, result.data as Location].sort((a, b) => a.name.localeCompare(b.name)),
            };
          });
          setIsAddLocationOpen(false);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Impossible de créer l\'établissement.');
      }
    });
  };

  const handleEditLocation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingLocation) return;
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await updateLocation(orgSlug, customerId, editingLocation.id, formData);
        if (result.error) throw new Error(result.error);
        if (result.data) {
          setCustomer(prev => {
            if (!prev) return null;
            const updatedList = prev.locations.map(l => {
              if (l.id === editingLocation.id) return result.data as Location;
              if (result.data.is_primary) return { ...l, is_primary: false };
              return l;
            });
            return {
              ...prev,
              locations: updatedList.sort((a, b) => a.name.localeCompare(b.name)),
            };
          });
          setEditingLocation(null);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Impossible de modifier l\'établissement.');
      }
    });
  };

  const handleSetPrimaryLocation = async (locId: string) => {
    setError(null);
    try {
      const result = await setPrimaryLocation(orgSlug, customerId, locId);
      if (result.error) throw new Error(result.error);
      setCustomer(prev => {
        if (!prev) return null;
        return {
          ...prev,
          locations: prev.locations.map(l => ({
            ...l,
            is_primary: l.id === locId,
          })),
        };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    }
  };

  const handleArchiveLocation = async (locId: string, name: string) => {
    if (!confirm(`Voulez-vous supprimer ou archiver l'établissement "${name}" ?`)) return;
    setError(null);
    try {
      const result = await archiveLocation(orgSlug, customerId, locId);
      if (result.error) throw new Error(result.error);
      setCustomer(prev => {
        if (!prev) return null;
        return {
          ...prev,
          locations: prev.locations.filter(l => l.id !== locId),
        };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'archivage.');
    }
  };

  // Contact handlers
  const handleAddContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await createContact(orgSlug, customerId, formData);
        if (result.error) throw new Error(result.error);
        if (result.data) {
          setCustomer(prev => {
            if (!prev) return null;
            const contacts = prev.contacts.map(c => 
              result.data.is_primary ? { ...c, is_primary: false } : c
            );
            return {
              ...prev,
              contacts: [...contacts, result.data as Contact].sort((a, b) => 
                (a.last_name || '').localeCompare(b.last_name || '')
              ),
            };
          });
          setIsAddContactOpen(false);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Impossible de créer le contact.');
      }
    });
  };

  const handleEditContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingContact) return;
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await updateContact(orgSlug, customerId, editingContact.id, formData);
        if (result.error) throw new Error(result.error);
        if (result.data) {
          setCustomer(prev => {
            if (!prev) return null;
            const updatedList = prev.contacts.map(c => {
              if (c.id === editingContact.id) return result.data as Contact;
              if (result.data.is_primary) return { ...c, is_primary: false };
              return c;
            });
            return {
              ...prev,
              contacts: updatedList.sort((a, b) => 
                (a.last_name || '').localeCompare(b.last_name || '')
              ),
            };
          });
          setEditingContact(null);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Impossible de modifier le contact.');
      }
    });
  };

  const handleSetPrimaryContact = async (contactId: string) => {
    setError(null);
    try {
      const result = await setPrimaryContact(orgSlug, customerId, contactId);
      if (result.error) throw new Error(result.error);
      setCustomer(prev => {
        if (!prev) return null;
        return {
          ...prev,
          contacts: prev.contacts.map(c => ({
            ...c,
            is_primary: c.id === contactId,
          })),
        };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    }
  };

  const handleArchiveContact = async (contactId: string, fullName: string) => {
    if (!confirm(`Voulez-vous supprimer ou archiver le contact "${fullName}" ?`)) return;
    setError(null);
    try {
      const result = await archiveContact(orgSlug, customerId, contactId);
      if (result.error) throw new Error(result.error);
      setCustomer(prev => {
        if (!prev) return null;
        return {
          ...prev,
          contacts: prev.contacts.filter(c => c.id !== contactId),
        };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'archivage.');
    }
  };

  const getLifecycleBadgeColor = (status: string) => {
    switch (status) {
      case 'prospect': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'qualified': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'customer': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'dormant': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'lost': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'blocked': return 'bg-slate-50 text-slate-700 border-slate-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getLifecycleLabel = (status: string) => {
    switch (status) {
      case 'prospect': return 'Prospect';
      case 'qualified': return 'Qualifié';
      case 'customer': return 'Client Actif';
      case 'dormant': return 'Dormant';
      case 'lost': return 'Perdu';
      case 'blocked': return 'Bloqué';
      default: return status;
    }
  };

  const getPotentialLabel = (potential: string) => {
    switch (potential) {
      case 'strategic': return '★ Stratégique';
      case 'high': return 'Élevé';
      case 'medium': return 'Moyen';
      case 'low': return 'Faible';
      default: return 'Non qualifié';
    }
  };

  const getOwnerName = (ownerId: string) => {
    const owner = members.find(m => m.id === ownerId);
    return owner ? owner.fullName : 'Non attribué';
  };

  // Timeline rendering helpers
  const getTimelineIcon = (source: string, type: string) => {
    if (source === 'quote_event') return <FileText className="h-4 w-4 text-indigo-500" />;
    if (source === 'crm_event') return <Sparkles className="h-4 w-4 text-amber-500" />;
    
    switch (type) {
      case 'call': return <Phone className="h-4 w-4 text-emerald-500" />;
      case 'email': return <Mail className="h-4 w-4 text-sky-500" />;
      case 'visit': return <MapPin className="h-4 w-4 text-rose-500" />;
      case 'meeting': return <User className="h-4 w-4 text-purple-500" />;
      case 'video_call': return <Video className="h-4 w-4 text-teal-500" />;
      case 'tasting': return <Coffee className="h-4 w-4 text-orange-500" />;
      case 'product_test': return <Beaker className="h-4 w-4 text-pink-500" />;
      case 'note': return <MessageSquare className="h-4 w-4 text-amber-500" fill="#f59e0b" fillOpacity={0.1} />;
      default: return <AlertCircle className="h-4 w-4 text-slate-500" />;
    }
  };

  const getTimelineFilterCount = (filter: string) => {
    if (filter === 'all') return timeline.length;
    if (filter === 'activities') {
      return timeline.filter(t => t.source === 'activity' && t.event_type !== 'note').length;
    }
    if (filter === 'notes') {
      return timeline.filter(t => t.source === 'activity' && t.event_type === 'note').length;
    }
    if (filter === 'quotes') {
      return timeline.filter(t => t.source === 'quote_event' || t.quote_id !== null).length;
    }
    if (filter === 'tasks') {
      return timeline.filter(t => t.task_id !== null || t.event_type.includes('task')).length;
    }
    if (filter === 'system') {
      return timeline.filter(t => t.source === 'crm_event').length;
    }
    return 0;
  };

  // JS Timeline Filter
  const filteredTimeline = timeline.filter(entry => {
    if (timelineFilter === 'all') return true;
    if (timelineFilter === 'activities') {
      return entry.source === 'activity' && entry.event_type !== 'note';
    }
    if (timelineFilter === 'notes') {
      return entry.source === 'activity' && entry.event_type === 'note';
    }
    if (timelineFilter === 'quotes') {
      return entry.source === 'quote_event' || entry.quote_id !== null;
    }
    if (timelineFilter === 'tasks') {
      return entry.task_id !== null || entry.event_type.includes('task');
    }
    if (timelineFilter === 'system') {
      return entry.source === 'crm_event';
    }
    return true;
  });

  // Sort timeline to put pinned notes first, then chronological order
  const sortedTimeline = [...filteredTimeline].sort((a, b) => {
    const aPinned = a.source === 'activity' && a.metadata?.is_pinned;
    const bPinned = b.source === 'activity' && b.metadata?.is_pinned;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
  });

  return (
    <div className="space-y-6">
      {/* Back button and page title */}
      <div className="flex flex-col gap-2">
        <Link 
          href={`/${orgSlug}/customers`} 
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-950 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Retour aux clients
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              {customer.name}
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getLifecycleBadgeColor(customer.lifecycle_status)}`}>
              {getLifecycleLabel(customer.lifecycle_status)}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100 font-medium">
              {getPotentialLabel(customer.potential_level)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-dashed text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
              onClick={() => setIsMergeDialogOpen(true)}
            >
              <GitMerge className="h-3.5 w-3.5" />
              Fusionner
            </Button>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${customer.is_active ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-100 text-slate-600'}`}>
              {customer.is_active ? 'Actif' : 'Inactif'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
          Fiche client mise à jour avec succès !
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-100 p-1 border-b border-slate-200 w-full justify-start rounded-lg flex flex-wrap gap-1">
          <TabsTrigger value="overview" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Synthèse & Timeline
          </TabsTrigger>
          <TabsTrigger value="locations" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Établissements ({customer.locations?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="contacts" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Contacts ({customer.contacts?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="margins" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Règles de marge ({customer.marginRules?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="quotes" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Historique des offres ({customer.quotes?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Tâches CRM ({tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length})
          </TabsTrigger>
          <TabsTrigger value="stats" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Analyses & Recommandations ({initialOrders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="edit" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Modifier la fiche
          </TabsTrigger>
        </TabsList>

        {/* Tab: Overview */}
        <TabsContent value="overview" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Quick Log Form & Timeline */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Quick Log Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-primary" />
                  Journaliser une interaction client
                </h3>
                
                <form onSubmit={handleQuickActivity} className="space-y-4">
                  {/* Selector of activity type */}
                  <div className="flex gap-2">
                    {(['call', 'email', 'visit', 'note'] as const).map((type) => {
                      const labels = { call: 'Téléphone', email: 'E-mail', visit: 'Visite', note: 'Note interne' };
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setQuickActivityType(type)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                            quickActivityType === type
                              ? 'bg-primary text-white border-primary shadow-xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {type === 'call' && <Phone className="h-3.5 w-3.5" />}
                          {type === 'email' && <Mail className="h-3.5 w-3.5" />}
                          {type === 'visit' && <MapPin className="h-3.5 w-3.5" />}
                          {type === 'note' && <MessageSquare className="h-3.5 w-3.5" />}
                          {labels[type]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-1">
                      <Label htmlFor="quickSubject" className="text-xs font-semibold text-slate-700">Objet de l'interaction *</Label>
                      <Input 
                        id="quickSubject" 
                        name="subject" 
                        value={quickSubject} 
                        onChange={(e) => setQuickSubject(e.target.value)} 
                        required 
                        placeholder="Objet" 
                        className="border-slate-200" 
                      />
                    </div>

                    {quickActivityType !== 'note' && (
                      <div className="grid gap-1">
                        <Label htmlFor="quickOutcome" className="text-xs font-semibold text-slate-700">Résultat de l'interaction</Label>
                        <select 
                          id="quickOutcome" 
                          name="outcome" 
                          defaultValue="successful"
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="successful">Échange fructueux</option>
                          <option value="no_answer">Pas de réponse</option>
                          <option value="voicemail">Message répondeur</option>
                          <option value="follow_up_needed">À relancer / Suivi requis</option>
                          <option value="meeting_booked">Rendez-vous fixé</option>
                          <option value="quote_requested">Demande d'offre</option>
                          <option value="not_interested">Non intéressé</option>
                          <option value="other">Autre</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-1">
                      <Label htmlFor="quickContact" className="text-xs font-semibold text-slate-700">Interlocuteur</Label>
                      <select id="quickContact" name="contactId" defaultValue="" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                        <option value="">-- Sélectionner un contact --</option>
                        {customer.contacts.filter(c => c.is_active).map(c => (
                          <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <Label htmlFor="quickLocation" className="text-xs font-semibold text-slate-700">Établissement lié</Label>
                      <select id="quickLocation" name="locationId" defaultValue="" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                        <option value="">-- Sélectionner un établissement --</option>
                        {customer.locations.filter(l => l.is_active).map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.address.city})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor="quickContent" className="text-xs font-semibold text-slate-700">Compte-rendu / Notes</Label>
                    <textarea 
                      id="quickContent" 
                      name="content" 
                      placeholder="Saisissez un compte-rendu rapide de votre interaction..." 
                      rows={3} 
                      className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none" 
                    />
                  </div>

                  {/* Toggle Next Action */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setShowNextTask(!showNextTask)}
                      className="inline-flex items-center text-xs font-bold text-primary hover:underline cursor-pointer w-fit"
                    >
                      {showNextTask ? (
                        "Annuler la relance suivante"
                      ) : (
                        "+ Planifier une relance ou tâche suivante"
                      )}
                    </button>

                    {showNextTask && (
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="grid gap-1 md:col-span-2">
                          <Label htmlFor="nextTaskTitle" className="text-[10px] font-bold text-slate-500 uppercase">Titre de la tâche suivante *</Label>
                          <Input id="nextTaskTitle" name="nextTaskTitle" required placeholder="ex: Rappeler pour confirmer le devis" className="border-slate-200 h-8" />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="nextTaskType" className="text-[10px] font-bold text-slate-500 uppercase">Type de tâche *</Label>
                          <select id="nextTaskType" name="nextTaskType" defaultValue="call" className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-0 text-xs shadow-xs focus-visible:ring-1">
                            <option value="call">Appel téléphonique</option>
                            <option value="email">E-mail</option>
                            <option value="visit">Visite terrain</option>
                            <option value="meeting">Réunion</option>
                            <option value="quote">Élaborer une offre</option>
                            <option value="other">Autre</option>
                          </select>
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="nextTaskDueAt" className="text-[10px] font-bold text-slate-500 uppercase">Date d'échéance *</Label>
                          <Input id="nextTaskDueAt" name="nextTaskDueAt" type="datetime-local" required className="border-slate-200 h-8 text-xs px-2" />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="nextTaskPriority" className="text-[10px] font-bold text-slate-500 uppercase">Priorité</Label>
                          <select id="nextTaskPriority" name="nextTaskPriority" defaultValue="normal" className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-0 text-xs shadow-xs focus-visible:ring-1">
                            <option value="low">Faible</option>
                            <option value="normal">Normale</option>
                            <option value="high">Haute</option>
                            <option value="urgent">Urgente</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs h-8 cursor-pointer px-4">
                      {isPending ? 'Enregistrement...' : 'Journaliser l\'activité'}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Timeline Header & Filters */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-slate-500" />
                    Fil d'actualité client
                  </h3>
                  
                  {/* Timeline Filter Badges */}
                  <div className="flex flex-wrap gap-1">
                    {(['all', 'activities', 'notes', 'quotes', 'tasks', 'system'] as const).map((filter) => {
                      const labels = { all: 'Tout', activities: 'Activité', notes: 'Note', quotes: 'Offre', tasks: 'Tâche', system: 'Système' };
                      const count = getTimelineFilterCount(filter);
                      return (
                        <button
                          key={filter}
                          onClick={() => setTimelineFilter(filter)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                            timelineFilter === filter
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {labels[filter]}
                          <span className={`text-[10px] px-1 rounded-full ${
                            timelineFilter === filter ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timeline Feed */}
                {sortedTimeline.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm bg-white border border-slate-200 rounded-xl">
                    Aucun événement à afficher avec ce filtre.
                  </div>
                ) : (
                  <div className="relative border-l border-slate-200 ml-3 pl-6 space-y-6 py-2">
                    {sortedTimeline.map((entry) => {
                      const isPinnedNote = entry.source === 'activity' && entry.metadata?.is_pinned;
                      const isNote = entry.source === 'activity' && entry.event_type === 'note';
                      const isAuthor = currentUserId && entry.actor_user_id === currentUserId;
                      
                      // Calculate if editable (24h)
                      const isEditable = isAuthor && (entry.source === 'activity') && (() => {
                        const createdTime = new Date(entry.occurred_at).getTime();
                        const nowTime = Date.now();
                        const diffHours = (nowTime - createdTime) / (1000 * 60 * 60);
                        return diffHours <= 24;
                      })();

                      return (
                        <div key={entry.entry_key} className="relative group">
                          {/* Timeline node icon */}
                          <div className={`absolute -left-[37px] top-1 h-7.5 w-7.5 rounded-full border bg-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-110 ${
                            isPinnedNote ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20' : 'border-slate-200'
                          }`}>
                            {getTimelineIcon(entry.source, entry.event_type)}
                          </div>

                          {/* Event Card */}
                          <div className={`bg-white border rounded-xl p-4 shadow-xs hover:shadow-sm transition-all border-slate-200 relative ${
                            isPinnedNote ? 'bg-amber-50/10 border-amber-200 ring-1 ring-amber-100' : ''
                          }`}>
                            
                            {/* Pinned label */}
                            {isPinnedNote && (
                              <div className="absolute top-2.5 right-2.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                <Pin className="h-3 w-3 fill-amber-500" />
                                Épinglé
                              </div>
                            )}

                            {/* Action Buttons in header */}
                            {!isPinnedNote && isNote && (
                              <button
                                onClick={() => handlePinActivity(entry.entry_key, true)}
                                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Épingler cette note en haut de la fiche"
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {isPinnedNote && (
                              <button
                                onClick={() => handlePinActivity(entry.entry_key, false)}
                                className="absolute top-2 right-20 p-1 text-amber-500 hover:text-slate-400 cursor-pointer"
                                title="Détacher la note"
                              >
                                <PinOff className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Edit Action Button */}
                            {isEditable && (
                              <button
                                onClick={() => setEditingActivity(entry)}
                                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-1 text-[10px] font-medium"
                              >
                                <Edit className="h-3 w-3" />
                                Modifier (24h)
                              </button>
                            )}

                            {/* Header Info */}
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-bold text-slate-900 text-sm">{entry.title}</h4>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                  <span className="font-medium text-slate-600">{entry.actor_name}</span>
                                  <span>•</span>
                                  <Clock className="h-3 w-3" />
                                  <span>
                                    {new Date(entry.occurred_at).toLocaleDateString('fr-BE')} à {new Date(entry.occurred_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Body Description */}
                            {entry.body && (
                              <p className="mt-2.5 text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                                {entry.body}
                              </p>
                            )}

                            {/* Extra Metadata Badges */}
                            {entry.metadata && (
                              <div className="flex flex-wrap gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                                {entry.metadata.direction && (
                                  <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-500 font-mono text-[10px]">
                                    {entry.metadata.direction === 'inbound' ? 'Entrant' : 'Sortant'}
                                  </span>
                                )}
                                {entry.metadata.outcome && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">
                                    Résultat : {entry.metadata.outcome}
                                  </span>
                                )}
                                {entry.metadata.duration_minutes && (
                                  <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-500 font-medium">
                                    Durée : {entry.metadata.duration_minutes} min
                                  </span>
                                )}
                                {entry.metadata.new_status && (
                                  <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-600 font-semibold">
                                    Statut CRM : {getLifecycleLabel(entry.metadata.new_status)}
                                  </span>
                                )}
                                {entry.metadata.reason && (
                                  <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 font-medium italic">
                                    Motif : {entry.metadata.reason}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar info */}
            <div className="space-y-6">
              
              {/* Main info card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Informations Générales</h3>
                <div className="space-y-3.5 text-sm">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Nom commercial</span>
                    <span className="font-medium text-slate-800">{customer.trade_name || customer.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Code Client</span>
                    <span className="font-mono text-xs text-slate-800">{customer.code || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">E-mail de contact principal</span>
                    <span className="font-medium text-slate-800 block truncate">{customer.email || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Téléphone principal</span>
                    <span className="font-medium text-slate-800">{customer.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Conditions de paiement</span>
                    <span className="font-medium text-slate-800">{customer.payment_terms || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Date de création</span>
                    <span className="font-medium text-slate-800">{new Date(customer.created_at).toLocaleDateString('fr-BE')}</span>
                  </div>
                </div>

                {customer.notes && (
                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">Notes Client</span>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">{customer.notes}</p>
                  </div>
                )}
              </div>

              {/* Sidebar CRM Info */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Dossier CRM
                </h3>
                <div className="space-y-3.5 text-sm">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Responsable commercial</span>
                    <span className="font-medium text-slate-800">{getOwnerName(customer.owner_user_id)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Dernière activité</span>
                    <span className="font-medium text-slate-800">
                      {customer.last_activity_at ? new Date(customer.last_activity_at).toLocaleDateString('fr-BE') : 'Aucune interaction'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Prochaine action</span>
                    <span className="font-medium text-slate-800 font-semibold text-primary">
                      {customer.next_activity_at ? new Date(customer.next_activity_at).toLocaleDateString('fr-BE') : 'Aucune tâche planifiée'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Segment de tarification</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200 text-xs mt-1">
                      {customer.segment}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Locations */}
        <TabsContent value="locations" className="space-y-4 outline-none">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-900">Établissements secondaires et de livraison</h3>
            <Button onClick={() => setIsAddLocationOpen(true)} className="bg-primary hover:bg-primary/90 text-white text-xs cursor-pointer font-semibold py-1.5 h-8">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter un établissement
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(!customer.locations || customer.locations.filter(l => l.is_active).length === 0) ? (
              <div className="col-span-2 py-12 text-center text-slate-500 text-sm bg-white border border-slate-200 rounded-xl">
                Aucun établissement actif enregistré.
              </div>
            ) : (
              customer.locations.filter(l => l.is_active).map((loc) => (
                <div key={loc.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                          <Building className="h-4 w-4 text-slate-400" />
                          {loc.name}
                        </h4>
                        <span className="text-xs text-slate-400 font-mono capitalize">Type : {loc.location_type}</span>
                      </div>
                      {loc.is_primary && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                          Principal
                        </span>
                      )}
                    </div>

                    <div className="mt-3 text-sm text-slate-600 space-y-2">
                      <p className="flex items-start gap-1.5">
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          {loc.address.line1}
                          {loc.address.line2 && <><br />{loc.address.line2}</>}
                          <br />
                          {loc.address.postalCode} {loc.address.city} ({loc.address.countryCode})
                        </span>
                      </p>
                      {loc.phone && (
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {loc.phone}
                        </p>
                      )}
                      {loc.email && (
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          {loc.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <div>
                      {!loc.is_primary && (
                        <Button 
                          onClick={() => handleSetPrimaryLocation(loc.id)} 
                          variant="ghost" 
                          size="xs"
                          className="text-xs text-primary hover:bg-primary/5 cursor-pointer font-medium"
                        >
                          Définir comme principal
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => setEditingLocation(loc)} 
                        variant="ghost" 
                        size="icon-xs" 
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        onClick={() => handleArchiveLocation(loc.id, loc.name)} 
                        variant="ghost" 
                        size="icon-xs" 
                        className="text-slate-400 hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* Tab: Contacts */}
        <TabsContent value="contacts" className="space-y-4 outline-none">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-900">Interlocuteurs et contacts clients</h3>
            <Button onClick={() => setIsAddContactOpen(true)} className="bg-primary hover:bg-primary/90 text-white text-xs cursor-pointer font-semibold py-1.5 h-8">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter un contact
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(!customer.contacts || customer.contacts.filter(c => c.is_active).length === 0) ? (
              <div className="col-span-2 py-12 text-center text-slate-500 text-sm bg-white border border-slate-200 rounded-xl">
                Aucun contact actif enregistré.
              </div>
            ) : (
              customer.contacts.filter(c => c.is_active).map((contact) => {
                const associatedLoc = customer.locations.find(l => l.id === contact.location_id);
                return (
                  <div key={contact.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-900 text-base">
                            {contact.first_name} {contact.last_name}
                          </h4>
                          {contact.job_title && (
                            <span className="text-xs text-slate-400 font-medium">
                              {contact.job_title} {contact.department ? `(${contact.department})` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {contact.is_primary && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              Principal
                            </span>
                          )}
                          {contact.do_not_contact && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Ne pas contacter
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-slate-600 space-y-2">
                        {contact.email && (
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            <span>{contact.email}</span>
                          </p>
                        )}
                        {(contact.phone || contact.mobile) && (
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {contact.mobile && `${contact.mobile} (Mobile)`}
                              {contact.mobile && contact.phone && ' / '}
                              {contact.phone && `${contact.phone} (Fixe)`}
                            </span>
                          </p>
                        )}
                        {associatedLoc && (
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Building className="h-3.5 w-3.5 text-slate-400" />
                            <span>Lié à : {associatedLoc.name}</span>
                          </p>
                        )}
                        {contact.notes && (
                          <p className="text-xs italic text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-100 mt-2">
                            "{contact.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                      <div>
                        {!contact.is_primary && (
                          <Button 
                            onClick={() => handleSetPrimaryContact(contact.id)} 
                            variant="ghost" 
                            size="xs"
                            className="text-xs text-primary hover:bg-primary/5 cursor-pointer font-medium"
                          >
                            Définir comme principal
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => setEditingContact(contact)} 
                          variant="ghost" 
                          size="icon-xs" 
                          className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          onClick={() => handleArchiveContact(contact.id, `${contact.first_name || ''} ${contact.last_name || ''}`.trim())} 
                          variant="ghost" 
                          size="icon-xs" 
                          className="text-slate-400 hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Tab 1: Margin Rules list */}
        <TabsContent value="margins" className="space-y-4 outline-none">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
              <Percent className="h-4 w-4 text-slate-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Règles de marge spécifiques au client</h3>
            </div>

            {(!customer.marginRules || customer.marginRules.length === 0) ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                {"Aucune règle de marge spécifique définie pour ce client."} <br />
                <span className="text-xs text-slate-400">
                  {"Le système appliquera les marges par défaut associées à son segment ("}{customer.segment}{") ou à l'organisation."}
                </span>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700">Type de règle</TableHead>
                    <TableHead className="font-semibold text-slate-700">Produit concerné</TableHead>
                    <TableHead className="font-semibold text-slate-700">Priorité (Résolution)</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Taux de marge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.marginRules.map((rule) => (
                    <TableRow key={rule.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900">
                        {rule.rule_type === 'customer_product' ? 'Produit spécifique client' : 'Client global'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {rule.product_id ? 'Produit ID: ' + rule.product_id : 'Tous les produits'}
                      </TableCell>
                      <TableCell className="text-slate-500 font-mono text-xs">
                        Priorité {rule.priority}
                      </TableCell>
                      <TableCell className="text-right text-primary font-bold">
                        {(parseFloat(rule.margin_rate) * 100).toFixed(1)} %
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Quotes list */}
        <TabsContent value="quotes" className="space-y-4 outline-none">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Devis et offres commerciales</h3>
            </div>

            {(!customer.quotes || customer.quotes.length === 0) ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                {"Aucun devis n'a été créé pour ce client."}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700">Numéro de devis</TableHead>
                    <TableHead className="font-semibold text-slate-700">Date de création</TableHead>
                    <TableHead className="font-semibold text-slate-700">Statut</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Montant Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.quotes.map((q) => (
                    <TableRow key={q.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-mono text-slate-900 font-semibold">
                        {q.quote_number}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(q.created_at).toLocaleDateString('fr-BE')}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          q.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                          q.status === 'draft' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                          q.status === 'sent' ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20' :
                          'bg-destructive/10 text-destructive border border-destructive/20'
                        }`}>
                          {q.status === 'draft' ? 'Brouillon' :
                           q.status === 'sent' ? 'Envoyé' :
                           q.status === 'viewed' ? 'Visionné' :
                           q.status === 'accepted' ? 'Accepté' :
                           q.status === 'rejected' ? 'Refusé' :
                           q.status === 'expired' ? 'Expiré' :
                           q.status === 'cancelled' ? 'Annulé' : q.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-slate-900 font-semibold">
                        {q.total_amount ? `${parseFloat(q.total_amount).toFixed(2)} €` : 'Calcul en cours'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Tab: Tasks CRM */}
        <TabsContent value="tasks" className="space-y-4 outline-none">
          <div className="flex justify-between items-center bg-slate-50/50 p-4 border border-slate-200/60 rounded-xl">
            <div>
              <h3 className="text-base font-bold text-slate-900">Tâches CRM</h3>
              <p className="text-xs text-slate-500">Gérez les rappels, rendez-vous et tâches logistiques de ce client.</p>
            </div>
            <Button onClick={() => setIsAddTaskOpen(true)} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold cursor-pointer">
              <Plus className="h-4 w-4 mr-1.5" />
              Nouvelle tâche
            </Button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {tasks.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-medium text-sm">
                Aucune tâche enregistrée pour ce client.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700 w-1/2">Titre de la tâche</TableHead>
                    <TableHead className="font-semibold text-slate-700">Type</TableHead>
                    <TableHead className="font-semibold text-slate-700">Échéance</TableHead>
                    <TableHead className="font-semibold text-slate-700">Priorité</TableHead>
                    <TableHead className="font-semibold text-slate-700">Assigné à</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t) => {
                    const isCompleted = t.status === 'completed';
                    const isCancelled = t.status === 'cancelled';
                    const isOverdue = t.due_at && new Date(t.due_at).getTime() < Date.now() && !isCompleted && !isCancelled;

                    return (
                      <TableRow key={t.id} className={`hover:bg-slate-50/50 ${isCompleted ? 'bg-slate-50/30' : ''}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleToggleTask(t.id, t.status)}
                              disabled={isPending}
                              className="focus:outline-none shrink-0"
                              title={isCompleted ? "Remettre en cours" : "Marquer comme complétée"}
                            >
                              {isCompleted ? (
                                <CheckCircle className="h-5 w-5 text-emerald-500 fill-emerald-50 cursor-pointer" />
                              ) : (
                                <div className={`h-5 w-5 rounded-full border-2 ${isOverdue ? 'border-rose-400 hover:border-rose-500' : 'border-slate-300 hover:border-slate-400'} bg-white transition-colors cursor-pointer`} />
                              )}
                            </button>
                            <span className={`${isCompleted ? 'line-through text-slate-400 font-normal' : 'text-slate-900 font-semibold'}`}>
                              {t.title}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs capitalize">
                          {t.task_type === 'call' ? '📞 Appel' :
                           t.task_type === 'email' ? '✉️ E-mail' :
                           t.task_type === 'meeting' ? '🤝 Réunion' :
                           t.task_type === 'preparation' ? '📦 Préparation' : t.task_type}
                        </TableCell>
                        <TableCell className={`text-xs ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                          {t.due_at ? new Date(t.due_at).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/Brussels'
                          }) : '-'}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            t.priority === 'urgent' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            t.priority === 'high' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-slate-100 text-slate-800 border border-slate-200'
                          }`}>
                            {t.priority}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs">
                          {t.assigned_to_name}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            isCompleted ? 'bg-emerald-50 text-emerald-700' :
                            isCancelled ? 'bg-slate-100 text-slate-500' :
                            'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {isCompleted ? 'Complété' : isCancelled ? 'Annulé' : 'En attente'}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Dialogue de création de tâche */}
        <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
          <DialogContent className="sm:max-w-[450px] bg-white border border-slate-200">
            <form onSubmit={handleAddTask}>
              <DialogHeader className="border-b border-slate-100 pb-4">
                <DialogTitle className="text-xl font-bold text-slate-900">Nouvelle tâche CRM</DialogTitle>
                <DialogDescription className="text-slate-400 text-sm mt-1">
                  Créez une tâche pour ce client. Elle sera visible dans son historique et sur le tableau de bord global.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4">
                <div className="grid gap-1">
                  <Label htmlFor="title" className="text-xs font-semibold text-slate-700">Titre de la tâche *</Label>
                  <Input id="title" name="title" required placeholder="ex: Relancer pour le devis moules" className="border-slate-200" />
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="description" className="text-xs font-semibold text-slate-700">Description / Détails</Label>
                  <Input id="description" name="description" placeholder="ex: Discuter des prix de gros" className="border-slate-200" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="taskType" className="text-xs font-semibold text-slate-700">Type de tâche</Label>
                    <select id="taskType" name="taskType" defaultValue="call" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs focus-visible:ring-1">
                      <option value="call">📞 Appel</option>
                      <option value="email">✉️ E-mail</option>
                      <option value="meeting">🤝 Réunion</option>
                      <option value="preparation">📦 Préparation</option>
                      <option value="other">⚙️ Autre</option>
                    </select>
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor="priority" className="text-xs font-semibold text-slate-700">Priorité</Label>
                    <select id="priority" name="priority" defaultValue="normal" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs focus-visible:ring-1">
                      <option value="low">Faible</option>
                      <option value="normal">Normal</option>
                      <option value="high">Élevé</option>
                      <option value="urgent">Urgent 🚨</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="dueAt" className="text-xs font-semibold text-slate-700">Date d'échéance</Label>
                  <Input id="dueAt" name="dueAt" type="datetime-local" className="border-slate-200" />
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="assignedTo" className="text-xs font-semibold text-slate-700">Assigné à</Label>
                  <select id="assignedTo" name="assignedTo" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs focus-visible:ring-1">
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <DialogFooter className="border-t border-slate-100 pt-4">
                <DialogClose render={<Button type="button" variant="outline" className="border-slate-200">Annuler</Button>} />
                <Button type="submit" disabled={isPending} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold cursor-pointer">
                  Créer la tâche
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      
      {/* Tab 3: Edit Form */}
        <TabsContent value="edit" className="outline-none">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-6 max-w-xl">
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid gap-1">
                <Label htmlFor="name" className="text-xs font-semibold text-slate-700">Nom légal de l'entreprise</Label>
                <Input 
                  id="name" 
                  name="name" 
                  defaultValue={customer.name} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="tradeName" className="text-xs font-semibold text-slate-700">Nom commercial / Enseigne</Label>
                <Input 
                  id="tradeName" 
                  name="tradeName" 
                  defaultValue={customer.trade_name || ''} 
                  className="border-slate-200" 
                />
              </div>
              <p className="text-[11px] text-slate-400 italic mt-1">* Veuillez renseigner au moins le nom légal ou le nom commercial / l'enseigne.</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="code" className="text-xs font-semibold text-slate-700">Code Client</Label>
                  <Input 
                    id="code" 
                    name="code" 
                    defaultValue={customer.code || ''} 
                    className="border-slate-200" 
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="segment" className="text-xs font-semibold text-slate-700">Segment *</Label>
                  <select 
                    id="segment" 
                    name="segment" 
                    defaultValue={customer.segment} 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="retail">Détail (Poissonnerie, Marché)</option>
                    <option value="grossiste">Grossiste / Demi-gros</option>
                    <option value="horeca">Horeca (Hôtel, Resto, Café)</option>
                    <option value="collectivite">Collectivité (Cantine, Hôpital)</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
              </div>

              {/* CRM lifecycle parameters inside edit panel */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div className="grid gap-1">
                  <Label htmlFor="lifecycleStatus" className="text-xs font-semibold text-slate-700">Statut CRM *</Label>
                  <select 
                    id="lifecycleStatus" 
                    name="lifecycleStatus" 
                    defaultValue={customer.lifecycle_status} 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="prospect">Prospect</option>
                    <option value="qualified">Qualifié</option>
                    <option value="customer">Client Actif</option>
                    <option value="dormant">Client Dormant</option>
                    <option value="lost">Perdu</option>
                    <option value="blocked">Bloqué</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="potentialLevel" className="text-xs font-semibold text-slate-700">Potentiel Commercial *</Label>
                  <select 
                    id="potentialLevel" 
                    name="potentialLevel" 
                    defaultValue={customer.potential_level} 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="unknown">Non qualifié</option>
                    <option value="low">Faible</option>
                    <option value="medium">Moyen</option>
                    <option value="high">Élevé</option>
                    <option value="strategic">Stratégique</option>
                  </select>
                </div>
              </div>

              {/* Owner assignment */}
              <div className="grid gap-1">
                <Label htmlFor="ownerUserId" className="text-xs font-semibold text-slate-700">Responsable Commercial *</Label>
                <select 
                  id="ownerUserId" 
                  name="ownerUserId" 
                  defaultValue={customer.owner_user_id}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.fullName}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">Téléphone</Label>
                <Input 
                  id="phone" 
                  name="phone" 
                  defaultValue={customer.phone || ''} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Adresse E-mail</Label>
                <Input 
                  id="email" 
                  name="email" 
                  type="email" 
                  defaultValue={customer.email || ''} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="paymentTerms" className="text-xs font-semibold text-slate-700">Conditions de paiement</Label>
                <Input 
                  id="paymentTerms" 
                  name="paymentTerms" 
                  defaultValue={customer.payment_terms || ''} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">Notes publiques</Label>
                <Input 
                  id="notes" 
                  name="notes" 
                  defaultValue={customer.notes || ''} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="internalNotes" className="text-xs font-semibold text-slate-700">Notes internes</Label>
                <textarea 
                  id="internalNotes" 
                  name="internalNotes" 
                  defaultValue={customer.internal_notes || ''} 
                  className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none" 
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isActive" 
                  name="isActive" 
                  value="true"
                  defaultChecked={customer.is_active} 
                  className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4" 
                />
                <Label htmlFor="isActive" className="text-sm text-slate-700 font-medium cursor-pointer">
                  Client actif
                </Label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90 text-white font-semibold">
                  <Save className="h-4 w-4 mr-1.5" />
                  {isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* Tab: Stats & Recommendations */}
        <TabsContent value="stats" className="space-y-6 outline-none">
          {stats.totalOrders === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-medium">
              <ShoppingBag className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p>Aucune commande enregistrée pour ce client pour le moment.</p>
              <p className="text-xs text-slate-400 mt-1">Les statistiques s'afficheront dès qu'il passera des commandes sur WhatsApp ou via le CRM.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Cartes de synthèse de Chiffre d'Affaires & Volumes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Chiffre d'Affaires Estimé</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
                  <div className="p-3 bg-sky-50 rounded-lg text-sky-600">
                    <Scale className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Volume Total Acheté</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.totalWeight.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                    <ShoppingBag className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Nombre de Commandes</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.totalOrders}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Statistiques d'achats (2/3) */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Top Produits */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Top Produits commandés
                  </h3>
                  <div className="overflow-hidden border border-slate-100 rounded-lg">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-semibold text-slate-900">Produit / Article</TableHead>
                          <TableHead className="font-semibold text-slate-900 text-center">Commandes</TableHead>
                          <TableHead className="font-semibold text-slate-900 text-right">Volume Cumulé</TableHead>
                          <TableHead className="font-semibold text-slate-900 text-right">Dernier achat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.topProducts.map((p: any, idx: number) => (
                          <TableRow key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <TableCell className="font-medium text-slate-900">{p.name}</TableCell>
                            <TableCell className="text-center text-slate-600 font-semibold">{p.orderCount}</TableCell>
                            <TableCell className="text-right text-brand-600 font-bold">{p.totalWeight} kg</TableCell>
                            <TableCell className="text-right text-slate-400 text-xs">
                              {new Date(p.lastOrderedAt).toLocaleDateString('fr-FR')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Répartition par Catégories */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
                    <PieChart className="h-4 w-4 text-primary" />
                    Répartition des achats par catégorie
                  </h3>
                  <div className="space-y-4">
                    {/* Poisson */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-600">
                        <span>🐟 Poissons</span>
                        <span>{stats.categories.poisson}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${stats.categories.poisson}%` }} />
                      </div>
                    </div>

                    {/* Crustacés */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-600">
                        <span>🦀 Crustacés</span>
                        <span>{stats.categories.crustace}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${stats.categories.crustace}%` }} />
                      </div>
                    </div>

                    {/* Coquillages */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-600">
                        <span>🦪 Coquillages</span>
                        <span>{stats.categories.coquillage}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${stats.categories.coquillage}%` }} />
                      </div>
                    </div>

                    {/* Traiteur */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-600">
                        <span>🍽️ Traiteur / Autre</span>
                        <span>{stats.categories.traiteur}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${stats.categories.traiteur}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Suggestions IA (1/3) */}
              <div className="space-y-6">
                <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-indigo-600 fill-indigo-100" />
                    Opportunités Commerciales IA
                  </h3>
                  
                  {stats.recommendations.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      <CheckCircle className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                      Aucune recommandation prioritaire.
                      <p className="mt-1">Le profil d'achat du client est stable et diversifié.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {stats.recommendations.map((rec: any, idx: number) => (
                        <div 
                          key={idx} 
                          className={`p-4 rounded-lg border text-sm space-y-1.5 shadow-2xs ${
                            rec.type === 'warning' 
                              ? 'bg-amber-50/50 border-amber-200 text-amber-900' 
                              : 'bg-indigo-50/50 border-indigo-200 text-indigo-900'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-bold">
                            {rec.type === 'warning' ? (
                              <AlertCircle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Sparkles className="h-4 w-4 text-indigo-600" />
                            )}
                            {rec.title}
                          </div>
                          <p className="text-slate-600 text-xs leading-relaxed">{rec.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Editing Logged Activity Dialog */}
      <Dialog open={editingActivity !== null} onOpenChange={(open) => !open && setEditingActivity(null)}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
          {editingActivity && (
            <form onSubmit={handleEditActivity}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900">Corriger l'activité</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Modifiez les informations de cette interaction. Cette action sera enregistrée dans les logs d'audit.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-1">
                  <Label htmlFor="editActSubject" className="text-xs font-semibold text-slate-700">Objet *</Label>
                  <Input id="editActSubject" name="subject" defaultValue={editingActivity.title} required className="border-slate-200" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editActType" className="text-xs font-semibold text-slate-700">Type d'activité *</Label>
                    <select id="editActType" name="activityType" defaultValue={editingActivity.event_type} className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                      <option value="call">Appel</option>
                      <option value="email">E-mail</option>
                      <option value="visit">Visite</option>
                      <option value="meeting">Réunion</option>
                      <option value="video_call">Visioconférence</option>
                      <option value="tasting">Dégustation</option>
                      <option value="product_test">Test produit</option>
                      <option value="note">Note interne</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor="editActOutcome" className="text-xs font-semibold text-slate-700">Résultat</Label>
                    <select id="editActOutcome" name="outcome" defaultValue={editingActivity.metadata?.outcome || 'successful'} className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                      <option value="successful">Échange fructueux</option>
                      <option value="no_answer">Pas de réponse</option>
                      <option value="voicemail">Message répondeur</option>
                      <option value="follow_up_needed">À relancer</option>
                      <option value="meeting_booked">Rendez-vous fixé</option>
                      <option value="quote_requested">Demande d'offre</option>
                      <option value="not_interested">Non intéressé</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="editActContent" className="text-xs font-semibold text-slate-700">Compte-rendu</Label>
                  <textarea 
                    id="editActContent" 
                    name="content" 
                    defaultValue={editingActivity.body || ''} 
                    rows={3} 
                    className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none" 
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingActivity(null)}>Annuler</Button>
                <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
                  {isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modals for Location CRUD */}
      <Dialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
          <form onSubmit={handleAddLocation}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">Ajouter un établissement</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Créez une nouvelle adresse de livraison, un point de vente ou un bureau pour ce client.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-1">
                <Label htmlFor="locName" className="text-xs font-semibold text-slate-700">Nom de l'établissement *</Label>
                <Input id="locName" name="name" required placeholder="ex: Dépôt Central, Restaurant Port" className="border-slate-200" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="locType" className="text-xs font-semibold text-slate-700">Type *</Label>
                  <select id="locType" name="locationType" defaultValue="delivery" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="delivery">Livraison</option>
                    <option value="billing">Facturation</option>
                    <option value="head_office">Siège social</option>
                    <option value="shop">Magasin / Boutique</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="warehouse">Entrepôt</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="locPhone" className="text-xs font-semibold text-slate-700">Téléphone direct</Label>
                  <Input id="locPhone" name="phone" placeholder="ex: +32 2..." className="border-slate-200" />
                </div>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="locLine1" className="text-xs font-semibold text-slate-700">Adresse (Rue et numéro) *</Label>
                <Input id="locLine1" name="line1" required placeholder="Rue de la Marée, 12" className="border-slate-200" />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="locLine2" className="text-xs font-semibold text-slate-700">Complément d'adresse</Label>
                <Input id="locLine2" name="line2" placeholder="Bâtiment B, Etage 2" className="border-slate-200" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="locPostalCode" className="text-xs font-semibold text-slate-700">Code postal *</Label>
                  <Input id="locPostalCode" name="postalCode" required placeholder="8000" className="border-slate-200" />
                </div>
                <div className="grid gap-1 col-span-2">
                  <Label htmlFor="locCity" className="text-xs font-semibold text-slate-700">Ville *</Label>
                  <Input id="locCity" name="city" required placeholder="Bruges" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="locRegion" className="text-xs font-semibold text-slate-700">Région</Label>
                  <Input id="locRegion" name="region" placeholder="Flandre-Occidentale" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="locCountry" className="text-xs font-semibold text-slate-700">Pays</Label>
                  <select id="locCountry" name="countryCode" defaultValue="BE" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                    <option value="BE">Belgique</option>
                    <option value="FR">France</option>
                    <option value="NL">Pays-Bas</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="locEmail" className="text-xs font-semibold text-slate-700">E-mail de contact direct</Label>
                <Input id="locEmail" name="email" type="email" placeholder="depot@client.com" className="border-slate-200" />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="locNotes" className="text-xs font-semibold text-slate-700">Consignes de livraison (codes d'accès, horaires)</Label>
                <Input id="locNotes" name="deliveryNotes" placeholder="ex: Livraison avant 10h par l'arrière" className="border-slate-200" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="locPrimary" name="isPrimary" value="true" className="rounded border-slate-300 text-primary h-4 w-4" />
                <Label htmlFor="locPrimary" className="text-xs text-slate-700 font-semibold cursor-pointer">Définir comme établissement principal</Label>
              </div>
            </div>

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline">Annuler</Button>} />
              <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
                {isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editing Location Dialog */}
      <Dialog open={editingLocation !== null} onOpenChange={(open) => !open && setEditingLocation(null)}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
          {editingLocation && (
            <form onSubmit={handleEditLocation}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900">Modifier l'établissement</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-1">
                  <Label htmlFor="editLocName" className="text-xs font-semibold text-slate-700">Nom de l'établissement *</Label>
                  <Input id="editLocName" name="name" defaultValue={editingLocation.name} required className="border-slate-200" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editLocType" className="text-xs font-semibold text-slate-700">Type *</Label>
                    <select id="editLocType" name="locationType" defaultValue={editingLocation.location_type} className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                      <option value="delivery">Livraison</option>
                      <option value="billing">Facturation</option>
                      <option value="head_office">Siège social</option>
                      <option value="shop">Magasin / Boutique</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="warehouse">Entrepôt</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="editLocPhone" className="text-xs font-semibold text-slate-700">Téléphone direct</Label>
                    <Input id="editLocPhone" name="phone" defaultValue={editingLocation.phone || ''} className="border-slate-200" />
                  </div>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="editLocLine1" className="text-xs font-semibold text-slate-700">Adresse (Rue et numéro) *</Label>
                  <Input id="editLocLine1" name="line1" defaultValue={editingLocation.address.line1} required className="border-slate-200" />
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="editLocLine2" className="text-xs font-semibold text-slate-700">Complément d'adresse</Label>
                  <Input id="editLocLine2" name="line2" defaultValue={editingLocation.address.line2 || ''} className="border-slate-200" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editLocPostalCode" className="text-xs font-semibold text-slate-700">Code postal *</Label>
                    <Input id="editLocPostalCode" name="postalCode" defaultValue={editingLocation.address.postalCode} required className="border-slate-200" />
                  </div>
                  <div className="grid gap-1 col-span-2">
                    <Label htmlFor="editLocCity" className="text-xs font-semibold text-slate-700">Ville *</Label>
                    <Input id="editLocCity" name="city" defaultValue={editingLocation.address.city} required className="border-slate-200" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editLocRegion" className="text-xs font-semibold text-slate-700">Région</Label>
                    <Input id="editLocRegion" name="region" defaultValue={editingLocation.address.region || ''} className="border-slate-200" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="editLocCountry" className="text-xs font-semibold text-slate-700">Pays</Label>
                    <select id="editLocCountry" name="countryCode" defaultValue={editingLocation.address.countryCode} className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                      <option value="BE">Belgique</option>
                      <option value="FR">France</option>
                      <option value="NL">Pays-Bas</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="editLocEmail" className="text-xs font-semibold text-slate-700">E-mail de contact direct</Label>
                  <Input id="editLocEmail" name="email" type="email" defaultValue={editingLocation.email || ''} className="border-slate-200" />
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="editLocNotes" className="text-xs font-semibold text-slate-700">Consignes de livraison</Label>
                  <Input id="editLocNotes" name="deliveryNotes" defaultValue={editingLocation.delivery_notes || ''} className="border-slate-200" />
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="editLocPrimary" name="isPrimary" value="true" defaultChecked={editingLocation.is_primary} className="rounded border-slate-300 text-primary h-4 w-4" />
                  <Label htmlFor="editLocPrimary" className="text-xs text-slate-700 font-semibold cursor-pointer">Établissement principal</Label>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingLocation(null)}>Annuler</Button>
                <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
                  {isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modals for Contact CRUD */}
      <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
          <form onSubmit={handleAddContact}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">Ajouter un contact</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Créez un nouvel interlocuteur (acheteur, gérant, chef de cuisine) pour ce compte.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactFn" className="text-xs font-semibold text-slate-700">Prénom</Label>
                  <Input id="contactFn" name="firstName" placeholder="Marie" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactLn" className="text-xs font-semibold text-slate-700">Nom de famille *</Label>
                  <Input id="contactLn" name="lastName" placeholder="Dubois" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactJob" className="text-xs font-semibold text-slate-700">Fonction</Label>
                  <Input id="contactJob" name="jobTitle" placeholder="ex: Chef cuisinier" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactDept" className="text-xs font-semibold text-slate-700">Département</Label>
                  <Input id="contactDept" name="department" placeholder="ex: Cuisine, Achats" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactEmail" className="text-xs font-semibold text-slate-700">E-mail direct</Label>
                  <Input id="contactEmail" name="email" type="email" placeholder="marie@client.com" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactSecEmail" className="text-xs font-semibold text-slate-700">E-mail secondaire</Label>
                  <Input id="contactSecEmail" name="secondaryEmail" type="email" placeholder="sec@client.com" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactPhone" className="text-xs font-semibold text-slate-700">Téléphone fixe</Label>
                  <Input id="contactPhone" name="phone" placeholder="ex: +32 2..." className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactMobile" className="text-xs font-semibold text-slate-700">Mobile</Label>
                  <Input id="contactMobile" name="mobile" placeholder="ex: +32 4..." className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactRole" className="text-xs font-semibold text-slate-700">Rôle décisionnel</Label>
                  <select id="contactRole" name="decisionRole" defaultValue="other" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                    <option value="decision_maker">Décideur principal</option>
                    <option value="buyer">Acheteur</option>
                    <option value="chef">Chef de cuisine</option>
                    <option value="owner">Propriétaire</option>
                    <option value="influencer">Prescripteur / Influenceur</option>
                    <option value="finance">Comptabilité / Finance</option>
                    <option value="administration">Secrétariat</option>
                    <option value="user">Utilisateur final</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactInfluence" className="text-xs font-semibold text-slate-700">Niveau d'influence</Label>
                  <select id="contactInfluence" name="influenceLevel" defaultValue="unknown" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                    <option value="unknown">Non déterminé</option>
                    <option value="high">Élevé</option>
                    <option value="medium">Moyen</option>
                    <option value="low">Faible</option>
                  </select>
                </div>
              </div>

              {/* Location link dropdown */}
              <div className="grid gap-1">
                <Label htmlFor="contactLoc" className="text-xs font-semibold text-slate-700">Établissement lié</Label>
                <select id="contactLoc" name="locationId" defaultValue="" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                  <option value="">-- Aucun / Tous les établissements --</option>
                  {customer.locations.filter(l => l.is_active).map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.address.city})</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="contactNotes" className="text-xs font-semibold text-slate-700">Notes / Informations complémentaires</Label>
                <Input id="contactNotes" name="notes" placeholder="ex: Préfère être appelé l'après-midi" className="border-slate-200" />
              </div>

              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="contactPrimary" name="isPrimary" value="true" className="rounded border-slate-300 text-primary h-4 w-4" />
                  <Label htmlFor="contactPrimary" className="text-xs text-slate-700 font-semibold cursor-pointer">Contact principal</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="contactDnc" name="doNotContact" value="true" className="rounded border-slate-300 text-primary h-4 w-4" />
                  <Label htmlFor="contactDnc" className="text-xs text-slate-700 font-semibold cursor-pointer">Ne pas contacter</Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline">Annuler</Button>} />
              <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
                {isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editing Contact Dialog */}
      <Dialog open={editingContact !== null} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
          {editingContact && (
            <form onSubmit={handleEditContact}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900">Modifier le contact</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editContactFn" className="text-xs font-semibold text-slate-700">Prénom</Label>
                    <Input id="editContactFn" name="firstName" defaultValue={editingContact.first_name || ''} className="border-slate-200" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="editContactLn" className="text-xs font-semibold text-slate-700">Nom de famille *</Label>
                    <Input id="editContactLn" name="lastName" defaultValue={editingContact.last_name || ''} required className="border-slate-200" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editContactJob" className="text-xs font-semibold text-slate-700">Fonction</Label>
                    <Input id="editContactJob" name="jobTitle" defaultValue={editingContact.job_title || ''} className="border-slate-200" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="editContactDept" className="text-xs font-semibold text-slate-700">Département</Label>
                    <Input id="editContactDept" name="department" defaultValue={editingContact.department || ''} className="border-slate-200" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editContactEmail" className="text-xs font-semibold text-slate-700">E-mail direct</Label>
                    <Input id="editContactEmail" name="email" type="email" defaultValue={editingContact.email || ''} className="border-slate-200" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="editContactSecEmail" className="text-xs font-semibold text-slate-700">E-mail secondaire</Label>
                    <Input id="editContactSecEmail" name="secondaryEmail" type="email" defaultValue={editingContact.secondary_email || ''} className="border-slate-200" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editContactPhone" className="text-xs font-semibold text-slate-700">Téléphone fixe</Label>
                    <Input id="editContactPhone" name="phone" defaultValue={editingContact.phone || ''} className="border-slate-200" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="editContactMobile" className="text-xs font-semibold text-slate-700">Mobile</Label>
                    <Input id="editContactMobile" name="mobile" defaultValue={editingContact.mobile || ''} className="border-slate-200" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="editContactRole" className="text-xs font-semibold text-slate-700">Rôle décisionnel</Label>
                    <select id="editContactRole" name="decisionRole" defaultValue={editingContact.decision_role} className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                      <option value="decision_maker">Décideur principal</option>
                      <option value="buyer">Acheteur</option>
                      <option value="chef">Chef de cuisine</option>
                      <option value="owner">Propriétaire</option>
                      <option value="influencer">Prescripteur / Influenceur</option>
                      <option value="finance">Comptabilité / Finance</option>
                      <option value="administration">Secrétariat</option>
                      <option value="user">Utilisateur final</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="editContactInfluence" className="text-xs font-semibold text-slate-700">Niveau d'influence</Label>
                    <select id="editContactInfluence" name="influenceLevel" defaultValue={editingContact.influence_level} className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                      <option value="unknown">Non déterminé</option>
                      <option value="high">Élevé</option>
                      <option value="medium">Moyen</option>
                      <option value="low">Faible</option>
                    </select>
                  </div>
                </div>

                {/* Location link dropdown */}
                <div className="grid gap-1">
                  <Label htmlFor="editContactLoc" className="text-xs font-semibold text-slate-700">Établissement lié</Label>
                  <select id="editContactLoc" name="locationId" defaultValue={editingContact.location_id || ''} className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs">
                    <option value="">-- Aucun / Tous les établissements --</option>
                    {customer.locations.filter(l => l.is_active).map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.address.city})</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="editContactNotes" className="text-xs font-semibold text-slate-700">Notes / Informations complémentaires</Label>
                  <Input id="editContactNotes" name="notes" defaultValue={editingContact.notes || ''} className="border-slate-200" />
                </div>

                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="editContactPrimary" name="isPrimary" value="true" defaultChecked={editingContact.is_primary} className="rounded border-slate-300 text-primary h-4 w-4" />
                    <Label htmlFor="editContactPrimary" className="text-xs text-slate-700 font-semibold cursor-pointer">Contact principal</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="editContactDnc" name="doNotContact" value="true" defaultChecked={editingContact.do_not_contact} className="rounded border-slate-300 text-primary h-4 w-4" />
                    <Label htmlFor="editContactDnc" className="text-xs text-slate-700 font-semibold cursor-pointer">Ne pas contacter</Label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingContact(null)}>Annuler</Button>
                <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
                  {isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE FUSION DE CLIENTS */}
      <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
        <DialogContent className="sm:max-w-[500px] border-slate-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <GitMerge className="h-5 w-5" />
              Fusionner le client "{customer.name}"
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Cette action est irréversible. Toutes les commandes, tâches, activités, adresses et contacts de <strong>{customer.name}</strong> seront transférés vers le client cible sélectionné ci-dessous, puis cette fiche sera définitivement supprimée.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Rechercher le client cible (à conserver)</Label>
              <Input
                placeholder="Tapez le nom d'un client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-slate-200"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Sélectionner dans la liste ({filteredCustomers.length} résultats)</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs"
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
              >
                <option value="">-- Choisir le client cible --</option>
                {filteredCustomers.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.trade_name ? `(${c.trade_name})` : ''} {c.code ? `[${c.code}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsMergeDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={!selectedTargetId || isMerging}
              onClick={handleMergeConfirm}
              className="bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5"
            >
              {isMerging ? 'Fusion en cours...' : 'Confirmer la fusion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
