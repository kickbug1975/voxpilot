'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from '@/components/ui/dropdown-menu';
import { Building, ChevronDown, Check } from 'lucide-react';

interface Org {
  id: string;
  name: string;
  slug: string;
}

interface OrgSwitcherProps {
  currentOrg: Org;
  userOrgs: Org[];
}

export default function OrgSwitcher({ currentOrg, userOrgs }: OrgSwitcherProps) {
  const router = useRouter();

  const handleSelect = (slug: string) => {
    router.push(`/${slug}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-brand-700/30 hover:bg-brand-700/50 border border-brand-700/40 text-sm font-medium text-white outline-none cursor-pointer transition-colors">
        <div className="flex items-center gap-2 truncate">
          <Building className="h-4 w-4 shrink-0 text-accent-500" />
          <span className="truncate">{currentOrg.name}</span>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-brand-900 border border-brand-700 text-white p-1">
        <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {"Changer d'organisation"}
        </div>
        {userOrgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSelect(org.slug)}
            className="flex items-center justify-between px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-brand-700 focus:bg-brand-700 text-white outline-none"
          >
            <span>{org.name}</span>
            {org.id === currentOrg.id && (
              <Check className="h-4 w-4 text-accent-500" />
            )}
          </DropdownMenuItem>
        ))}
        <div className="border-t border-brand-700/30 my-1" />
        <DropdownMenuItem
          onClick={() => router.push('/organizations/new')}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-brand-700 focus:bg-brand-700 text-accent-500 font-semibold outline-none"
        >
          <span>+ Créer une organisation</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
