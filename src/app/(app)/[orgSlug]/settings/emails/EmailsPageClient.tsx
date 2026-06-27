'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Mail, Copy, ExternalLink, Code, 
  Clock, User, FileText, Send 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface EmailMessage {
  id: string;
  organization_id: string;
  quote_id: string | null;
  provider: string | null;
  provider_message_id: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  subject: string | null;
  status: 'queued' | 'sent' | 'failed' | 'logged';
  error_message: string | null;
  sent_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EmailsPageClientProps {
  orgSlug: string;
  orgName: string;
  emails: EmailMessage[];
}

export default function EmailsPageClient({ orgSlug, orgName, emails }: EmailsPageClientProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getLink = (email: EmailMessage) => {
    if (!email.provider_message_id) return '';
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    if (email.quote_id) {
      return `${base}/q/${email.provider_message_id}`;
    } else {
      return `${base}/invite/${email.provider_message_id}`;
    }
  };

  const getInviteQueryLink = (email: EmailMessage) => {
    if (!email.provider_message_id) return '';
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${base}/invite?token=${email.provider_message_id}`;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatEmailsList = (arr: string[] | null) => {
    if (!arr || arr.length === 0) return '-';
    return arr.join(', ');
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href={`/${orgSlug}/settings`} className="hover:text-slate-900 transition-colors">
            {"Paramètres"}
          </Link>
          <span>{"/"}</span>
          <span className="text-slate-900 font-medium">{"Simulation d'e-mails"}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-955 tracking-tight flex items-center gap-2">
              <Mail className="h-6 w-6 text-slate-500" />
              {"Simulation d'e-mails (Dev Outbox)"}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {`Historique des e-mails capturés localement pour l'organisation ${orgName}`}
            </p>
          </div>
          <Link
            href={`/${orgSlug}/settings`}
            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg px-3 py-1.5 text-xs transition-colors shadow-3xs cursor-pointer animate-in fade-in"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {"Retour aux paramètres"}
          </Link>
        </div>
      </div>

      {/* Info Warning Alert */}
      <Card className="p-4 border-indigo-200 bg-indigo-50/50 text-indigo-850 text-xs font-semibold rounded-xl flex items-start gap-2.5 shadow-2xs">
        <Send className="h-5 w-5 text-indigo-650 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>{"Mode d'email hors ligne activé"}</p>
          <p className="text-[11px] font-normal text-indigo-700 leading-normal">
            {"Puisque EMAIL_MODE=log est activé ou que vous êtes en développement, les e-mails ne sont pas réellement envoyés. Ils sont enregistrés ici avec leurs tokens d'accès associés pour vous permettre de tester les flux de partage d'offres et d'invitations d'équipe."}
          </p>
        </div>
      </Card>

      {/* Emails List */}
      <Card className="border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden">
        {emails.length === 0 ? (
          <div className="text-center py-16 text-slate-400 space-y-2">
            <Mail className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="font-bold text-sm">{"Aucun e-mail consigné"}</p>
            <p className="text-xs text-slate-400">
              {"Les e-mails de devis ou d'invitation apparaîtront ici lorsqu'ils seront déclenchés."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {emails.map((email) => {
              const link = getLink(email);
              const inviteQueryLink = !email.quote_id ? getInviteQueryLink(email) : '';
              const isQuote = !!email.quote_id;

              return (
                <div key={email.id} className="p-6 hover:bg-slate-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-450">{"À :"}</span>
                      <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-sm truncate">
                        {formatEmailsList(email.to_emails)}
                      </span>
                      
                      <Badge className="text-[10px] font-bold bg-indigo-50 text-indigo-750 border-indigo-200">
                        {email.status}
                      </Badge>

                      {isQuote ? (
                        <Badge className="text-[10px] font-bold bg-emerald-50 text-emerald-750 border-emerald-200 flex items-center gap-1">
                          <FileText className="h-2.5 w-2.5" />
                          {"Devis"}
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] font-bold bg-purple-50 text-purple-750 border-purple-200 flex items-center gap-1">
                          <User className="h-2.5 w-2.5" />
                          {"Invitation"}
                        </Badge>
                      )}

                      <span className="text-slate-400 text-xs flex items-center gap-1 ml-auto md:ml-0">
                        <Clock className="h-3 w-3" />
                        {new Date(email.created_at).toLocaleString('fr-BE')}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{email.subject}</h4>

                    {link && (
                      <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 space-y-1.5 max-w-2xl">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {isQuote ? "Lien de consultation public :" : "Lien d'acceptation de l'invitation :"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-700 truncate flex-1 bg-white border border-slate-200 px-2 py-1 rounded select-all">
                            {link}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopy(link, email.id)}
                            className="h-7 text-xs font-bold text-indigo-650 hover:text-indigo-850 cursor-pointer flex gap-1 items-center px-2"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedId === email.id ? "Copié !" : "Copier"}
                          </Button>
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-7 text-xs font-bold text-slate-650 hover:text-slate-850 px-2 hover:bg-slate-100 rounded transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            {"Ouvrir"}
                          </a>
                        </div>

                        {!isQuote && inviteQueryLink && (
                          <div className="pt-2 border-t border-slate-200 mt-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                              {"Lien alternatif (paramètre de requête) :"}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-700 truncate flex-1 bg-white border border-slate-200 px-2 py-1 rounded select-all">
                                {inviteQueryLink}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCopy(inviteQueryLink, email.id + '-alt')}
                                className="h-7 text-xs font-bold text-indigo-650 hover:text-indigo-850 cursor-pointer flex gap-1 items-center px-2"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {copiedId === email.id + '-alt' ? "Copié !" : "Copier"}
                              </Button>
                              <a
                                href={inviteQueryLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-7 text-xs font-bold text-slate-650 hover:text-slate-850 px-2 hover:bg-slate-100 rounded transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                {"Ouvrir"}
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedEmail(email)}
                      className="text-xs font-bold text-slate-700 hover:text-slate-900 border-slate-250 cursor-pointer flex gap-1.5 items-center"
                    >
                      <Code className="h-3.5 w-3.5" />
                      {"Détails JSON"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* JSON Details Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        {selectedEmail && (
          <DialogContent className="max-w-xl bg-white rounded-2xl border border-slate-200">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                {"Métadonnées JSON de l'e-mail simulé"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div className="text-xs text-slate-500">
                {"Retrouvez ci-dessous la représentation brute enregistrée dans la table "}
                <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono">{"email_messages"}</code>.
              </div>
              <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl overflow-auto text-[11px] font-mono leading-relaxed max-h-96 shadow-inner">
                {JSON.stringify(selectedEmail, null, 2)}
              </pre>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setSelectedEmail(null)}
                  className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs px-4 cursor-pointer"
                >
                  {"Fermer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
