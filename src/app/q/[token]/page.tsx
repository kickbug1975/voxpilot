import React from 'react';
import { getPublicQuote } from '@/actions/publicQuotes';
import PublicQuoteViewClient from './PublicQuoteViewClient';
import { ShieldAlert, FileText } from 'lucide-react';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicQuotePage({ params }: PageProps) {
  const { token } = await params;
  const result = await getPublicQuote(token);

  if (result.error || !result.data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-md p-6 text-center space-y-6">
          <div className="h-14 w-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
            <ShieldAlert className="h-7 w-7" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">{"Accès non autorisé"}</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              {result.error || "Ce lien de devis est invalide, a expiré ou a été annulé par le vendeur."}
            </p>
          </div>
          
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              {"Si vous pensez qu'il s'agit d'une erreur, veuillez contacter votre conseiller commercial BlueMargin."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { quote, items, organization } = result.data;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top minimal header */}
      <header className="h-16 bg-brand-900 text-white flex items-center justify-between px-6 md:px-12 border-b border-brand-700/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-accent-500 flex items-center justify-center text-brand-900 font-extrabold text-lg">
            M
          </span>
          <span className="text-xl font-bold tracking-tight">
            Blue<span className="text-accent-500">Margin</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent-500/10 text-accent-500 border border-accent-500/20">
          <FileText className="h-3.5 w-3.5" />
          {"Offre Client"}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8">
        <PublicQuoteViewClient 
          quote={quote} 
          items={items} 
          organization={organization} 
          token={token} 
        />
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-200 bg-white text-center text-xs text-slate-400">
        <p>{`© ${new Date().getFullYear()} BlueMargin. Document commercial sécurisé.`}</p>
      </footer>
    </div>
  );
}
