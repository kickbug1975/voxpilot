import React from 'react';
import Link from 'next/link';
import { getPublicInvitation } from '@/actions/settings';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UserPlus, LogIn, AlertTriangle } from 'lucide-react';
import InviteAcceptButton from './InviteAcceptButton';

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const supabase = await createClient();

  // 1. Fetch public invitation details
  const { data: invite, error } = await getPublicInvitation(token);

  // 2. Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser();

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

  return (
    <div className="min-h-screen bg-brand-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <span className="h-10 w-10 rounded-xl bg-accent-500 flex items-center justify-center text-brand-900 font-black text-xl mx-auto">
          M
        </span>
        <h2 className="text-2xl font-black text-white tracking-tight">
          Blue<span className="text-accent-500">Margin</span>
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        {error || !invite ? (
          /* Error Card */
          <Card className="bg-brand-850 border border-brand-700/50 text-white p-6 shadow-xl rounded-2xl space-y-4">
            <div className="flex justify-center text-rose-500">
              <AlertTriangle className="h-12 w-12" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold">{"Jeton invalide ou expiré"}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {error || "Ce lien d'invitation n'est plus valable. Veuillez demander à votre administrateur de vous renvoyer une invitation."}
              </p>
            </div>
            <div className="pt-2 text-center">
              <Link href="/login">
                <Button className="w-full bg-brand-700 hover:bg-brand-600 text-white font-bold text-xs h-10 cursor-pointer">
                  {"Aller à la connexion"}
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          /* Valid Invitation Card */
          <Card className="bg-brand-850 border border-brand-700/50 text-white p-8 shadow-xl rounded-2xl space-y-6">
            <div className="text-center space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-accent-500/10 text-accent-500 border border-accent-500/20">
                <UserPlus className="h-3.5 w-3.5" />
                {"Invitation d'équipe"}
              </span>
              <h3 className="text-xl font-black tracking-tight pt-1">
                {`Rejoindre ${invite.organizations.name}`}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {`Vous avez été invité à collaborer sur cette organisation en tant que `}
                <span className="font-bold text-white bg-brand-700 px-1.5 py-0.5 rounded ml-0.5">
                  {getRoleLabel(invite.role)}
                </span>.
              </p>
            </div>

            {user ? (
              /* User is logged in: can accept directly */
              <div className="space-y-4 pt-2 border-t border-brand-700/30">
                <div className="p-3 bg-brand-700/30 border border-brand-700 rounded-lg text-xs space-y-1">
                  <p className="text-slate-400">{"Vous êtes connecté en tant que :"}</p>
                  <p className="font-semibold text-accent-500">{user.email}</p>
                </div>

                <InviteAcceptButton token={token} />

                <div className="text-center text-[10px] text-slate-500">
                  {"Ce n'est pas votre compte ? "}
                  <form action="/api/auth/logout" method="POST" className="inline">
                    <button type="submit" className="text-accent-500 hover:underline font-bold cursor-pointer bg-transparent border-0 p-0">
                      {"Se déconnecter"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              /* User is anonymous: must login or signup */
              <div className="space-y-4 pt-2 border-t border-brand-700/30">
                <p className="text-xs text-slate-400 text-center">
                  {"Connectez-vous ou créez un compte avec votre adresse e-mail pour accepter l'invitation."}
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Link href={`/login?inviteToken=${token}`}>
                    <Button className="w-full bg-brand-700 hover:bg-brand-650 text-white font-bold text-xs h-10 cursor-pointer flex gap-1.5 justify-center">
                      <LogIn className="h-4 w-4" />
                      {"Se connecter"}
                    </Button>
                  </Link>
                  <Link href={`/signup?inviteToken=${token}`}>
                    <Button className="w-full bg-accent-500 hover:bg-accent-500/90 text-brand-900 font-black text-xs h-10 cursor-pointer flex gap-1.5 justify-center">
                      <UserPlus className="h-4 w-4" />
                      {"S'inscrire"}
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
