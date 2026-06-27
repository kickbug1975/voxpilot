'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { LogOut } from 'lucide-react';

interface UserProfileDropdownProps {
  userName: string;
  userEmail: string;
  userRole: string;
}

export default function UserProfileDropdown({ userName, userEmail, userRole }: UserProfileDropdownProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Human readable role in French
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Propriétaire';
      case 'admin': return 'Administrateur';
      case 'manager': return 'Gestionnaire';
      case 'sales': return 'Commercial';
      case 'viewer': return 'Lecteur';
      default: return role;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-brand-700/30 text-left outline-none cursor-pointer transition-colors">
        <div className="h-8 w-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-semibold text-accent-500 border border-brand-700/50">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {userName}
          </p>
          <p className="text-xs text-slate-400 truncate leading-tight mt-0.5">
            {getRoleLabel(userRole)}
          </p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-brand-900 border border-brand-700 text-white p-1">
        <div className="px-2 py-1.5 text-xs text-slate-400">
          Connecté en tant que <br />
          <span className="font-semibold text-white">{userEmail}</span>
        </div>
        <DropdownMenuSeparator className="bg-brand-700/50" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-destructive/20 text-destructive focus:bg-destructive/20 focus:text-destructive outline-none"
        >
          <LogOut className="h-4 w-4" />
          <span>Se déconnecter</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
