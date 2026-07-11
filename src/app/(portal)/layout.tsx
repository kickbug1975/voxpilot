import React from 'react';
import '@/app/globals.css';
import { ShoppingBag } from 'lucide-react';

export const metadata = {
  title: 'Portail de Commande B2B | VoxPilot',
  description: 'Passez vos commandes de marée rapidement et en libre-service.',
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* En-tête minimal */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-indigo-200">
            V
          </span>
          <span className="text-lg font-bold text-slate-900 tracking-tight">
            Vox<span className="text-indigo-600">Pilot</span> B2B
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          <ShoppingBag className="h-3 w-3" />
          Libre-Service
        </div>
      </header>

      {/* Zone principale */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 md:p-6 pb-20">
        {children}
      </main>

      {/* Pied de page minimal */}
      <footer className="py-6 border-t border-slate-200 bg-white text-center text-xs text-slate-400 shrink-0">
        Propulsé de manière sécurisée par VoxPilot B2B
      </footer>
    </div>
  );
}
