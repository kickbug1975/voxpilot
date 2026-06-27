import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Connexion | VoxPilot',
  description: 'Connectez-vous à votre espace de pilotage VoxPilot.',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-700 via-brand-900 to-brand-900 text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-white hover:opacity-90">
          <span className="h-8 w-8 rounded-lg bg-accent-500 flex items-center justify-center text-brand-900 font-extrabold text-lg">
            V
          </span>
          Vox<span className="text-accent-500">Pilot</span>
        </Link>
        <h2 className="mt-6 text-center text-sm font-semibold tracking-wider text-accent-500 uppercase">
          Plateforme de Pilotage Opérationnel & Marges
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-brand-900/60 backdrop-blur-md py-8 px-4 border border-brand-700/50 shadow-2xl rounded-xl sm:px-10">
          {children}
        </div>
      </div>
    </div>
  );
}
