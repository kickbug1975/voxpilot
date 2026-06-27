'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Settings, Users, Shield, ShieldAlert, Mail, UserPlus, 
  RefreshCw, Trash2, Copy, CheckCircle2, AlertTriangle, Info,
  FolderTree, Plus, Edit3, Sparkles
} from 'lucide-react';
import { 
  updateOrgSettings, 
  inviteTeamMember, 
  resendInvitation, 
  revokeInvitation, 
  updateMemberRole, 
  updateMemberStatus 
} from '@/actions/settings';
import { createCategory, updateCategory, deleteCategory } from '@/actions/categories';

interface Member {
  userId: string;
  fullName: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'sales' | 'viewer';
  status: 'active' | 'disabled';
  joinedAt: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'sales' | 'viewer';
  expiresAt: string;
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  vat_number: string | null;
  phone: string | null;
  commercial_email: string | null;
  timezone: string;
  default_margin_rate: string | number;
  default_rounding_rule: string;
  default_quote_validity_days: number;
  cost_increase_alert_rate: string | number;
  sales_can_view_costs: boolean;
  sales_can_override_floor: boolean;
}

interface Category {
  id: string;
  organization_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number | null;
  created_at?: string;
  updated_at?: string;
}

interface SettingsClientProps {
  orgSlug: string;
  currentUserRole: string;
  currentUserId: string;
  org: Organization;
  members: Member[];
  invitations: PendingInvitation[];
  isDevOrLog?: boolean;
  initialCategories: Category[];
}

export default function SettingsClient({
  orgSlug,
  currentUserRole,
  currentUserId,
  org,
  members,
  invitations,
  isDevOrLog = false,
  initialCategories,
}: SettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<string>('general');
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [catName, setCatName] = useState('');
  const [catParentId, setCatParentId] = useState<string>('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [catSuccess, setCatSuccess] = useState<string | null>(null);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    setCatSuccess(null);

    if (!catName.trim()) {
      setCatError('Le nom de la catégorie est obligatoire.');
      return;
    }

    startTransition(async () => {
      try {
        if (editingCatId) {
          const res = await updateCategory(orgSlug, editingCatId, catName, catParentId || null);
          if (res.error) throw new Error(res.error);
          
          setCategories(prev => prev.map(c => c.id === editingCatId ? (res.data as Category) : c));
          setCatSuccess('Catégorie modifiée avec succès.');
          setEditingCatId(null);
        } else {
          const res = await createCategory(orgSlug, catName, catParentId || null);
          if (res.error) throw new Error(res.error);
          
          setCategories(prev => [...prev, res.data as Category]);
          setCatSuccess('Catégorie créée avec succès.');
        }
        setCatName('');
        setCatParentId('');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
        setCatError(message);
      }
    });
  };

  const handleEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatParentId(cat.parent_id || '');
    setCatError(null);
    setCatSuccess(null);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la catégorie "${name}" ?\n\nTous les produits associés à cette catégorie se retrouveront sans catégorie.`)) return;

    setCatError(null);
    setCatSuccess(null);

    startTransition(async () => {
      try {
        const res = await deleteCategory(orgSlug, id);
        if (res.error) throw new Error(res.error);

        setCategories(prev => prev.filter(c => c.id !== id));
        setCatSuccess('Catégorie supprimée avec succès.');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
        setCatError(message);
      }
    });
  };

  const handleCancelEditCategory = () => {
    setEditingCatId(null);
    setCatName('');
    setCatParentId('');
    setCatError(null);
    setCatSuccess(null);
  };

  // Error/Success state
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invite states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('sales');
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  const isEditable = currentUserRole === 'owner' || currentUserRole === 'admin';

  const formatPercent = (val: string | number) => {
    const parsed = typeof val === 'string' ? parseFloat(val) : val;
    return (parsed * 100).toFixed(1);
  };

  const getRoleLabel = (r: string) => {
    switch (r) {
      case 'owner': return 'Propriétaire';
      case 'admin': return 'Administrateur';
      case 'manager': return 'Gestionnaire';
      case 'sales': return 'Commercial';
      case 'viewer': return 'Lecteur';
      default: return r;
    }
  };

  const getRoleBadgeColor = (r: string) => {
    switch (r) {
      case 'owner': return 'bg-indigo-50 text-indigo-750 border-indigo-200';
      case 'admin': return 'bg-purple-50 text-purple-750 border-purple-200';
      case 'manager': return 'bg-blue-50 text-blue-750 border-blue-200';
      case 'sales': return 'bg-sky-50 text-sky-750 border-sky-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  // 1. Submit general settings
  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isEditable) return;

    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name') as string,
      vat_number: (formData.get('vat_number') as string) || null,
      phone: (formData.get('phone') as string) || null,
      commercial_email: (formData.get('commercial_email') as string) || null,
      timezone: formData.get('timezone') as string,
      default_margin_rate: parseFloat(formData.get('default_margin_rate') as string) / 100,
      default_rounding_rule: formData.get('default_rounding_rule') as string,
      default_quote_validity_days: parseInt(formData.get('default_quote_validity_days') as string, 10),
      cost_increase_alert_rate: parseFloat(formData.get('cost_increase_alert_rate') as string) / 100,
      sales_can_view_costs: formData.get('sales_can_view_costs') === 'true',
      sales_can_override_floor: formData.get('sales_can_override_floor') === 'true',
    };

    startTransition(async () => {
      setMsg(null);
      const res = await updateOrgSettings(orgSlug, payload);
      if (res.error) {
        setMsg({ type: 'error', text: res.error });
      } else {
        setMsg({ type: 'success', text: "Paramètres de l'organisation mis à jour avec succès !" });
        router.refresh();
      }
    });
  };

  // 2. Invite member
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditable) return;

    startTransition(async () => {
      setMsg(null);
      setGeneratedInviteLink(null);
      const res = await inviteTeamMember(orgSlug, inviteEmail, inviteRole);
      if (res.error) {
        setMsg({ type: 'error', text: res.error });
      } else {
        setInviteEmail('');
        setMsg({ type: 'success', text: `Invitation envoyée à ${inviteEmail} !` });
        if (res.token) {
          const link = `${window.location.origin}/invite/${res.token}`;
          setGeneratedInviteLink(link);
        }
        router.refresh();
      }
    });
  };

  // 3. Resend invite
  const handleResend = async (id: string, email: string) => {
    startTransition(async () => {
      setMsg(null);
      setGeneratedInviteLink(null);
      const res = await resendInvitation(orgSlug, id);
      if (res.error) {
        setMsg({ type: 'error', text: res.error });
      } else {
        setMsg({ type: 'success', text: `Invitation renvoyée à ${email} !` });
        if (res.token) {
          const link = `${window.location.origin}/invite/${res.token}`;
          setGeneratedInviteLink(link);
        }
        router.refresh();
      }
    });
  };

  // 4. Revoke invite
  const handleRevoke = async (id: string, email: string) => {
    if (!confirm(`Voulez-vous vraiment annuler l'invitation pour ${email} ?`)) return;

    startTransition(async () => {
      setMsg(null);
      const res = await revokeInvitation(orgSlug, id);
      if (res.error) {
        setMsg({ type: 'error', text: res.error });
      } else {
        setMsg({ type: 'success', text: `Invitation révoquée.` });
        router.refresh();
      }
    });
  };

  // 5. Change member role
  const handleRoleChange = async (userId: string, newRole: string) => {
    startTransition(async () => {
      setMsg(null);
      const res = await updateMemberRole(orgSlug, userId, newRole);
      if (res.error) {
        setMsg({ type: 'error', text: res.error });
      } else {
        setMsg({ type: 'success', text: "Rôle du membre modifié avec succès." });
        router.refresh();
      }
    });
  };

  // 6. Change member status (Enable/Disable)
  const handleStatusChange = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'disabled' : 'active';
    const actionText = nextStatus === 'active' ? 'réactiver' : 'désactiver';
    
    if (!confirm(`Voulez-vous vraiment ${actionText} ce collaborateur ?`)) return;

    startTransition(async () => {
      setMsg(null);
      const res = await updateMemberStatus(orgSlug, userId, nextStatus);
      if (res.error) {
        setMsg({ type: 'error', text: res.error });
      } else {
        setMsg({ type: 'success', text: `Collaborateur mis à jour.` });
        router.refresh();
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Lien d'invitation copié dans le presse-papiers !");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{"Paramètres de l'organisation"}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {"Configurez les informations d'identité, de tarification et gérez votre équipe commerciale."}
          </p>
        </div>
        {['owner', 'admin'].includes(currentUserRole) && (
          <div className="flex items-center gap-2 shrink-0">
            {isDevOrLog && (
              <Link
                href={`/${orgSlug}/settings/emails`}
                className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg px-3 py-1.5 text-xs transition-colors shadow-3xs cursor-pointer"
              >
                <Mail className="h-4 w-4 text-slate-450" />
                {"Simulation d'e-mails"}
              </Link>
            )}
            <Link
              href={`/${orgSlug}/settings/crm`}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg px-3 py-1.5 text-xs transition-colors shadow-3xs cursor-pointer animate-pulse-once"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              {"Paramètres CRM"}
            </Link>
            <Link
              href={`/${orgSlug}/settings/audit`}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg px-3 py-1.5 text-xs transition-colors shadow-3xs cursor-pointer"
            >
              <ShieldAlert className="h-4 w-4 text-slate-450" />
              {"Journal d'audit"}
            </Link>
          </div>
        )}
      </div>

      {/* Warning if not admin */}
      {!isEditable && (
        <Card className="p-4 border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="space-y-1">
            <p>{"Mode Lecture seule"}</p>
            <p className="text-[11px] font-normal text-amber-700 leading-normal">
              {"En tant que commercial ou lecteur, vous n'êtes pas autorisé à modifier les règles de tarification globale ni la composition de l'équipe d'administration."}
            </p>
          </div>
        </Card>
      )}

      {/* Success/Error message banner */}
      {msg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
          msg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {msg.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Dev invite token helper link */}
      {generatedInviteLink && (
        <Card className="p-4 border-indigo-200 bg-indigo-50/50 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
            <Info className="h-4.5 w-4.5 text-indigo-650" />
            <span>{"Lien d'invitation généré pour le test local !"}</span>
          </div>
          <p className="text-[11px] text-indigo-700 leading-normal">
            {"Puisque les e-mails ne sont pas réellement envoyés en local, transmettez ou ouvrez ce lien directement dans un navigateur privé pour créer/associer le compte :"}
          </p>
          <div className="flex gap-2 items-center">
            <input 
              readOnly 
              value={generatedInviteLink} 
              className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 outline-none select-all" 
            />
            <Button
              size="sm"
              onClick={() => copyToClipboard(generatedInviteLink)}
              className="bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs h-8 cursor-pointer flex gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              {"Copier"}
            </Button>
          </div>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 border border-slate-200 rounded-lg p-1 flex gap-1 w-fit">
          <TabsTrigger value="general" className="cursor-pointer flex items-center gap-1.5 py-1.5 px-3">
            <Settings className="h-4 w-4" />
            {"Général & Tarification"}
          </TabsTrigger>
          <TabsTrigger value="team" className="cursor-pointer flex items-center gap-1.5 py-1.5 px-3">
            <Users className="h-4 w-4" />
            {"Équipe & Collaborateurs"}
          </TabsTrigger>
          <TabsTrigger value="categories" className="cursor-pointer flex items-center gap-1.5 py-1.5 px-3">
            <FolderTree className="h-4 w-4" />
            {"Catégories de produits"}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: GENERAL & PRICING */}
        <TabsContent value="general" className="outline-none">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Part 1: Legal Identity */}
            <Card className="p-6 border-slate-200 shadow-xs bg-white rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <Shield className="h-4.5 w-4.5 text-slate-450" />
                <span>{"Identité et coordonnées de l'organisation"}</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-bold text-slate-700">{"Nom légal de l'organisation *"}</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    disabled={!isEditable || isPending}
                    defaultValue={org.name}
                    className="border-slate-250 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="vat_number" className="text-xs font-bold text-slate-700">{"Numéro de TVA"}</Label>
                  <Input
                    id="vat_number"
                    name="vat_number"
                    disabled={!isEditable || isPending}
                    defaultValue={org.vat_number || ''}
                    placeholder="BE 0123.456.789"
                    className="border-slate-250 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="commercial_email" className="text-xs font-bold text-slate-700">{"Adresse E-mail commerciale"}</Label>
                  <Input
                    id="commercial_email"
                    name="commercial_email"
                    type="email"
                    disabled={!isEditable || isPending}
                    defaultValue={org.commercial_email || ''}
                    placeholder="contact@entreprise.be"
                    className="border-slate-250 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs font-bold text-slate-700">{"Téléphone commercial"}</Label>
                  <Input
                    id="phone"
                    name="phone"
                    disabled={!isEditable || isPending}
                    defaultValue={org.phone || ''}
                    placeholder="+32 2 123 45 67"
                    className="border-slate-250 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="timezone" className="text-xs font-bold text-slate-700">{"Fuseau horaire par défaut"}</Label>
                  <select
                    id="timezone"
                    name="timezone"
                    disabled={!isEditable || isPending}
                    defaultValue={org.timezone}
                    className="flex h-9 w-full rounded-lg border border-slate-250 bg-white px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:bg-slate-50"
                  >
                    <option value="Europe/Brussels">{"Europe/Brussels (UTC+1/UTC+2)"}</option>
                    <option value="Europe/Paris">{"Europe/Paris"}</option>
                    <option value="UTC">{"UTC (Temps universel)"}</option>
                  </select>
                </div>
              </div>
            </Card>

            {/* Part 2: Global Pricing Defaults */}
            <Card className="p-6 border-slate-200 shadow-xs bg-white rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <Settings className="h-4.5 w-4.5 text-slate-450" />
                <span>{"Paramètres de tarification & Marges de secours"}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="default_margin_rate" className="text-xs font-bold text-slate-700">
                    {"Marge cible par défaut de l'organisation (%)"}
                  </Label>
                  <Input
                    id="default_margin_rate"
                    name="default_margin_rate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    disabled={!isEditable || isPending}
                    defaultValue={formatPercent(org.default_margin_rate)}
                    className="border-slate-250 disabled:bg-slate-50"
                  />
                  <p className="text-[10px] text-slate-400">
                    {"Taux appliqué par défaut aux produits n'ayant aucune règle spécifique configurée."}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="default_rounding_rule" className="text-xs font-bold text-slate-700">
                    {"Règle d'arrondi des prix recommandée"}
                  </Label>
                  <select
                    id="default_rounding_rule"
                    name="default_rounding_rule"
                    disabled={!isEditable || isPending}
                    defaultValue={org.default_rounding_rule}
                    className="flex h-9 w-full rounded-lg border border-slate-250 bg-white px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:bg-slate-50"
                  >
                    <option value="up_0_05">{"Au 0.05 EUR supérieur (B2B Belgique)"}</option>
                    <option value="nearest_0_05">{"Au 0.05 EUR le plus proche"}</option>
                    <option value="up_0_10">{"Au 0.10 EUR supérieur"}</option>
                    <option value="nearest_0_10">{"Au 0.10 EUR le plus proche"}</option>
                    <option value="psychological_0_99">{"Prix psychologique (.99 EUR)"}</option>
                    <option value="none">{"Aucun (centimes bruts standard)"}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="default_quote_validity_days" className="text-xs font-bold text-slate-700">
                    {"Délai de validité par défaut des devis (jours)"}
                  </Label>
                  <Input
                    id="default_quote_validity_days"
                    name="default_quote_validity_days"
                    type="number"
                    min="1"
                    required
                    disabled={!isEditable || isPending}
                    defaultValue={org.default_quote_validity_days}
                    className="border-slate-250 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cost_increase_alert_rate" className="text-xs font-bold text-slate-700">
                    {"Seuil de détection de hausse de coût critique (%)"}
                  </Label>
                  <Input
                    id="cost_increase_alert_rate"
                    name="cost_increase_alert_rate"
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    disabled={!isEditable || isPending}
                    defaultValue={formatPercent(org.cost_increase_alert_rate)}
                    className="border-slate-250 disabled:bg-slate-50"
                  />
                  <p className="text-[10px] text-slate-400">
                    {"Seuil à partir duquel un import de tarif avec hausse de coût déclenche une alerte (ex: +5.0%)."}
                  </p>
                </div>
              </div>
            </Card>

            {/* Part 3: Roles and overrides permissions */}
            <Card className="p-6 border-slate-200 shadow-xs bg-white rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <ShieldAlert className="h-4.5 w-4.5 text-slate-450" />
                <span>{"Habilitations de l'équipe commerciale"}</span>
              </h3>

              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-slate-800">
                      {"Visibilité des coûts d'achat pour les commerciaux"}
                    </Label>
                    <p className="text-[10px] text-slate-500 leading-normal max-w-xl">
                      {"Si activé, les rôles commerciaux ('sales') peuvent voir les coûts d'achat et de transport. Si désactivé, l'application masque ces données et n'affiche que les cibles et recommandations."}
                    </p>
                  </div>
                  <select
                    name="sales_can_view_costs"
                    disabled={!isEditable || isPending}
                    defaultValue={org.sales_can_view_costs ? 'true' : 'false'}
                    className="flex h-9 w-32 rounded-lg border border-slate-250 bg-white px-3 py-1 text-sm shadow-xs transition-colors disabled:bg-slate-50 shrink-0"
                  >
                    <option value="true">{"Activé"}</option>
                    <option value="false">{"Désactivé"}</option>
                  </select>
                </div>

                <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-4">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-slate-800">
                      {"Déroger aux seuils de marge (Marge plancher)"}
                    </Label>
                    <p className="text-[10px] text-slate-500 leading-normal max-w-xl">
                      {"Si activé, les commerciaux peuvent valider une offre avec des prix de vente sous le seuil de marge cible (avec justification obligatoire). Si désactivé, le blocage est absolu."}
                    </p>
                  </div>
                  <select
                    name="sales_can_override_floor"
                    disabled={!isEditable || isPending}
                    defaultValue={org.sales_can_override_floor ? 'true' : 'false'}
                    className="flex h-9 w-32 rounded-lg border border-slate-250 bg-white px-3 py-1 text-sm shadow-xs transition-colors disabled:bg-slate-50 shrink-0"
                  >
                    <option value="true">{"Autorisé"}</option>
                    <option value="false">{"Bloqué"}</option>
                  </select>
                </div>
              </div>
            </Card>

            {/* Save button */}
            {isEditable && (
              <div className="flex justify-end gap-2">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/95 text-white font-semibold cursor-pointer text-xs"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                      {"Sauvegarde en cours..."}
                    </>
                  ) : (
                    "Enregistrer les modifications"
                  )}
                </Button>
              </div>
            )}
          </form>
        </TabsContent>

        {/* TAB 2: TEAM MANAGEMENT */}
        <TabsContent value="team" className="outline-none space-y-6">
          {/* Part A: Invite new member */}
          {isEditable && (
            <Card className="p-6 border-slate-200 shadow-xs bg-white rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <UserPlus className="h-4.5 w-4.5 text-slate-450" />
                <span>{"Inviter un collaborateur"}</span>
              </h3>

              <form onSubmit={handleInvite} className="flex flex-col sm:flex-row items-end gap-4 max-w-3xl">
                <div className="flex-1 space-y-1 w-full">
                  <Label htmlFor="inviteEmail" className="text-xs font-bold text-slate-700">{"Adresse E-mail"}</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    required
                    placeholder="collaborateur@entreprise.be"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={isPending}
                    className="border-slate-250"
                  />
                </div>

                <div className="space-y-1 w-full sm:w-48">
                  <Label htmlFor="inviteRole" className="text-xs font-bold text-slate-700">{"Rôle attribué"}</Label>
                  <select
                    id="inviteRole"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    disabled={isPending}
                    className="flex h-9 w-full rounded-lg border border-slate-255 bg-white px-3 py-1 text-sm shadow-xs transition-colors"
                  >
                    <option value="admin">{"Administrateur"}</option>
                    <option value="manager">{"Gestionnaire"}</option>
                    <option value="sales">{"Commercial"}</option>
                    <option value="viewer">{"Lecteur"}</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/95 text-white font-semibold cursor-pointer text-xs shrink-0 w-full sm:w-auto h-9"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  {"Inviter"}
                </Button>
              </form>
            </Card>
          )}

          {/* Part B: Active members list */}
          <Card className="border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Users className="h-4.5 w-4.5 text-slate-450" />
                <span>{"Membres de l'équipe active"}</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <Table className="text-xs text-left">
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-transparent">
                    <TableHead className="py-2.5 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px]">{"Nom complet"}</TableHead>
                    <TableHead className="py-2.5 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px]">{"Adresse E-mail"}</TableHead>
                    <TableHead className="py-2.5 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-40">{"Rôle"}</TableHead>
                    <TableHead className="py-2.5 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-28 text-center">{"Statut"}</TableHead>
                    {isEditable && <TableHead className="py-2.5 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-36 text-right">{"Actions"}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {members.map((member) => {
                    const isSelf = member.userId === currentUserId;
                    const isTargetOwner = member.role === 'owner';
                    const activeOwners = members.filter(m => m.role === 'owner' && m.status === 'active');
                    const isOnlyOwner = isTargetOwner && activeOwners.length <= 1;

                    return (
                      <TableRow key={member.userId} className="hover:bg-slate-50/20">
                        <td className="py-3 px-6 font-bold text-slate-900">
                          {member.fullName} {isSelf && <span className="text-[10px] font-semibold text-slate-400">{"(vous)"}</span>}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">{member.email}</td>
                        <td className="py-3 px-4">
                          {isEditable && !isSelf && !isOnlyOwner ? (
                            <select
                              defaultValue={member.role}
                              onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                              disabled={isPending}
                              className="flex h-7 w-32 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs focus:ring-1"
                            >
                              <option value="owner">{"Propriétaire"}</option>
                              <option value="admin">{"Administrateur"}</option>
                              <option value="manager">{"Gestionnaire"}</option>
                              <option value="sales">{"Commercial"}</option>
                              <option value="viewer">{"Lecteur"}</option>
                            </select>
                          ) : (
                            <Badge className={`text-[10px] border font-bold ${getRoleBadgeColor(member.role)}`}>
                              {getRoleLabel(member.role)}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            member.status === 'active' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {member.status === 'active' ? 'Actif' : 'Désactivé'}
                          </span>
                        </td>
                        {isEditable && (
                          <td className="py-3 px-6 text-right">
                            {!isSelf && !isOnlyOwner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStatusChange(member.userId, member.status)}
                                className={`h-6 text-[10px] font-bold cursor-pointer hover:bg-slate-100 ${
                                  member.status === 'active' ? 'text-rose-600 hover:text-rose-800' : 'text-emerald-600 hover:text-emerald-800'
                                }`}
                              >
                                {member.status === 'active' ? 'Désactiver' : 'Réactiver'}
                              </Button>
                            )}
                          </td>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Part C: Pending invitations list */}
          <Card className="border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Mail className="h-4.5 w-4.5 text-slate-450" />
                <span>{"Invitations en attente d'acceptation"}</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              {invitations.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>{"Aucune invitation en attente."}</p>
                </div>
              ) : (
                <Table className="text-xs text-left">
                  <TableHeader>
                    <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-transparent">
                      <TableHead className="py-2.5 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px]">{"E-mail invité"}</TableHead>
                      <TableHead className="py-2.5 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-40">{"Rôle assigné"}</TableHead>
                      <TableHead className="py-2.5 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-48">{"Expiration"}</TableHead>
                      {isEditable && <TableHead className="py-2.5 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-48 text-right">{"Actions"}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {invitations.map((invite) => {
                      const isExpired = new Date(invite.expiresAt).getTime() < now;
                      return (
                        <TableRow key={invite.id} className="hover:bg-slate-50/20">
                          <td className="py-3 px-6 font-bold text-slate-900">{invite.email}</td>
                          <td className="py-3 px-4">
                            <Badge className={`text-[10px] border font-bold ${getRoleBadgeColor(invite.role)}`}>
                              {getRoleLabel(invite.role)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {isExpired ? (
                              <span className="text-rose-600 font-bold">{"Expiré (relancer)"}</span>
                            ) : (
                              <span className="text-slate-500">
                                {`Expire le ${new Date(invite.expiresAt).toLocaleDateString('fr-BE')}`}
                              </span>
                            )}
                          </td>
                          {isEditable && (
                            <td className="py-3 px-6 text-right space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleResend(invite.id, invite.email)}
                                disabled={isPending}
                                className="h-6 text-[10px] font-bold text-indigo-650 hover:text-indigo-850 cursor-pointer"
                              >
                                {"Relancer"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRevoke(invite.id, invite.email)}
                                disabled={isPending}
                                className="h-6 text-[10px] font-bold text-rose-650 hover:text-rose-850 cursor-pointer"
                              >
                                {"Révoquer"}
                              </Button>
                            </td>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: PRODUCT CATEGORIES */}
        <TabsContent value="categories" className="outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left side: categories list (2 cols on lg screens) */}
            <Card className="lg:col-span-2 border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <FolderTree className="h-4.5 w-4.5 text-slate-450" />
                  <span>{"Catégories de produits existantes"}</span>
                </h3>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                  {`${categories.length} catégorie(s)`}
                </span>
              </div>

              <div className="overflow-x-auto flex-1">
                {categories.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p>{"Aucune catégorie de produit définie."}</p>
                  </div>
                ) : (
                  <Table className="text-xs text-left">
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-transparent">
                        <TableHead className="py-2.5 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px]">{"Nom de la catégorie"}</TableHead>
                        <TableHead className="py-2.5 px-4 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-64">{"Catégorie Parente"}</TableHead>
                        {isEditable && <TableHead className="py-2.5 px-6 font-bold text-slate-450 uppercase tracking-wider text-[10px] w-36 text-right">{"Actions"}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {categories.map((cat) => {
                        const parent = categories.find(c => c.id === cat.parent_id);
                        return (
                          <TableRow key={cat.id} className="hover:bg-slate-50/20">
                            <td className="py-3 px-6 font-bold text-slate-900 flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                              {cat.name}
                            </td>
                            <td className="py-3 px-4 text-slate-500 font-medium">
                              {parent ? parent.name : <span className="text-slate-350 italic">{"Aucune (Catégorie principale)"}</span>}
                            </td>
                            {isEditable && (
                              <td className="py-3 px-6 text-right space-x-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditCategory(cat)}
                                  disabled={isPending}
                                  className="h-6 w-6 p-0 text-indigo-650 hover:text-indigo-850 cursor-pointer inline-flex items-center justify-center rounded-md"
                                  title="Modifier"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                  disabled={isPending}
                                  className="h-6 w-6 p-0 text-rose-650 hover:text-rose-850 cursor-pointer inline-flex items-center justify-center rounded-md"
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>

            {/* Right side: Add / Edit Form (1 col) */}
            {isEditable && (
              <Card className="border-slate-200 shadow-xs bg-white rounded-2xl p-6 h-fit space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Plus className="h-4.5 w-4.5 text-slate-450" />
                  <span>{editingCatId ? "Modifier la catégorie" : "Créer une catégorie"}</span>
                </h3>

                {catError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>{catError}</span>
                  </div>
                )}

                {catSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{catSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleSaveCategory} className="space-y-4">
                  <div className="grid gap-1">
                    <Label htmlFor="catName" className="text-xs font-semibold text-slate-700">Nom de la catégorie *</Label>
                    <Input
                      id="catName"
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="ex: Poissons Frais, Crustacés..."
                      required
                      className="border-slate-200 text-xs h-9"
                    />
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor="catParentId" className="text-xs font-semibold text-slate-700">Catégorie Parente (Optionnel)</Label>
                    <select
                      id="catParentId"
                      value={catParentId}
                      onChange={(e) => setCatParentId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none h-9 focus:border-indigo-500"
                    >
                      <option value="">{"-- Aucune (Catégorie principale) --"}</option>
                      {categories
                        .filter(c => c.id !== editingCatId) // Prevent cyclic dependency
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                      }
                    </select>
                  </div>

                  <div className="pt-2 flex gap-2 justify-end">
                    {editingCatId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelEditCategory}
                        className="border-slate-200 text-slate-700 text-xs font-bold h-9"
                      >
                        {"Annuler"}
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="bg-primary hover:bg-primary/90 text-white font-bold text-xs h-9"
                    >
                      {editingCatId ? "Enregistrer" : "Créer"}
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
