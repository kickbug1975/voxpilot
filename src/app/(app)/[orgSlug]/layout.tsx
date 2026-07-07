import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Truck, 
  FileText,
  Percent,
  Upload,
  Settings,
  AlertTriangle,
  Calendar,
  CheckSquare,
  ShoppingCart
} from 'lucide-react';
import OrgSwitcher from '@/components/OrgSwitcher';
import UserProfileDropdown from '@/components/UserProfileDropdown';
import HeaderSearch from '@/components/HeaderSearch';
import VoiceAssistantWidget from '@/components/VoiceAssistantWidget';
import { createTask } from '@/actions/tasks';
import { createActivity } from '@/actions/activities';

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { orgSlug } = await params;
  if (orgSlug === 'demo-maree-belgique') {
    redirect('/maison-fumesse');
  }
  const supabase = await createClient();

  // 1 & 2. Get logged-in user and fetch current organization in parallel
  const [userResult, orgResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('organizations')
      .select('id, name, slug, sales_can_view_costs')
      .eq('slug', orgSlug)
      .single()
  ]);

  const user = userResult.data?.user;
  const userError = userResult.error;
  if (userError || !user) {
    redirect('/login');
  }

  const currentOrg = orgResult.data;
  const orgError = orgResult.error;
  if (orgError || !currentOrg) {
    // If organization not found or RLS blocks access, redirect to login/dashboard
    redirect('/login');
  }

  // 3, 4, 5 & 5.5 Fetch membership, profile, memberships switcher, and unread alerts count in parallel
  const [membershipResult, profileResult, membershipsResult, alertsCountResult] = await Promise.all([
    supabase
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', currentOrg.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('organization_memberships')
      .select('role, organizations(id, name, slug)')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', currentOrg.id)
      .eq('status', 'unread')
  ]);

  const membership = membershipResult.data;
  const membershipError = membershipResult.error;
  if (membershipError || !membership) {
    redirect('/login');
  }

  const profile = profileResult.data;
  const memberships = membershipsResult.data;
  const unreadAlertsCount = alertsCountResult.count;

  const userOrgs = (memberships || [])
    .map((m) => (m.organizations as unknown) as { id: string; name: string; slug: string } | null)
    .filter((org): org is { id: string; name: string; slug: string } => !!org && org.slug !== 'demo-maree-belgique');

  const navigation = [
    { name: 'Tableau de bord', href: `/${orgSlug}`, icon: LayoutDashboard },
    { name: 'Agenda', href: `/${orgSlug}/agenda`, icon: Calendar },
    { name: 'Tâches CRM', href: `/${orgSlug}/tasks`, icon: CheckSquare },
    { name: 'Produits', href: `/${orgSlug}/products`, icon: Package },
    { name: 'Clients', href: `/${orgSlug}/customers`, icon: Users },
    { name: 'Fournisseurs', href: `/${orgSlug}/suppliers`, icon: Truck },
    { name: 'Tarifs & Imports', href: `/${orgSlug}/imports`, icon: Upload },
    { name: 'Règles de marge', href: `/${orgSlug}/margins`, icon: Percent },
    { name: 'Offres & Devis', href: `/${orgSlug}/quotes`, icon: FileText },
    { name: 'Commandes', href: `/${orgSlug}/orders`, icon: ShoppingCart },
    { name: 'Alertes', href: `/${orgSlug}/alerts`, icon: AlertTriangle, badgeCount: unreadAlertsCount || 0 },
    { name: 'Paramètres', href: `/${orgSlug}/settings`, icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar for Desktop */}
      <aside className="w-64 bg-brand-900 text-white flex flex-col border-r border-brand-700/30 shrink-0">
        {/* Header/Logo */}
        <div className="h-16 flex items-center px-6 border-b border-brand-700/30 gap-2 shrink-0">
          <span className="h-8 w-8 rounded-lg bg-accent-500 flex items-center justify-center text-brand-900 font-extrabold text-lg">
            V
          </span>
          <span className="text-xl font-bold tracking-tight">
            Vox<span className="text-accent-500">Pilot</span>
          </span>
        </div>

        {/* Organization Switcher */}
        <div className="px-4 py-4 border-b border-brand-700/20 shrink-0">
          <OrgSwitcher currentOrg={currentOrg} userOrgs={userOrgs} />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-brand-700/50 hover:text-white transition-colors group"
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-slate-400 group-hover:text-white transition-colors" />
                <span>{item.name}</span>
              </div>
              {('badgeCount' in item) && (item as any).badgeCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-rose-500 rounded-full shrink-0">
                  {(item as any).badgeCount}
                </span>
              )}
            </Link>
          ))}
        </nav>



        {/* User Account / Footer */}
        <div className="p-4 border-t border-brand-700/30 flex items-center justify-between gap-3 shrink-0">
          <UserProfileDropdown 
            userName={profile?.full_name || 'Utilisateur'} 
            userEmail={user.email || ''} 
            userRole={membership.role}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-slate-900">
              {currentOrg.name}
            </h1>
            <HeaderSearch orgSlug={orgSlug} />
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-500/10 text-accent-500 border border-accent-500/20">
              Mode Pilote
            </span>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
      <VoiceAssistantWidget 
        orgSlug={orgSlug} 
        createTaskAction={createTask} 
        createActivityAction={createActivity} 
      />
    </div>
  );
}
