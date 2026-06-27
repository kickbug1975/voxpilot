'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('inviteToken');
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message === 'Invalid login credentials') {
          throw new Error('E-mail ou mot de passe incorrect.');
        }
        throw authError;
      }

      if (data.user) {
        if (inviteToken) {
          router.push(`/invite/${inviteToken}`);
          router.refresh();
          return;
        }

        // Fetch user's memberships to redirect them to their organization
        const { data: memberships, error: memberError } = await supabase
          .from('organization_memberships')
          .select('organizations(slug)')
          .eq('user_id', data.user.id)
          .eq('status', 'active')
          .limit(1);

        if (memberError) throw memberError;

        if (memberships && memberships.length > 0) {
          const org = (memberships[0].organizations as unknown) as { slug: string } | null;
          if (org?.slug) {
            router.push(`/${org.slug}`);
            router.refresh();
            return;
          }
        }

        // If no active membership, check profile for last active org
        const { data: profile } = await supabase
          .from('profiles')
          .select('last_active_organization_id, organizations(slug)')
          .eq('id', data.user.id)
          .single();

        const pOrg = (profile?.organizations as unknown) as { slug: string } | null;
        if (pOrg?.slug) {
          router.push(`/${pOrg.slug}`);
          router.refresh();
          return;
        }

        // Fallback: if no organization at all, redirect to setup / onboard
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue lors de la connexion.';
      setError(errMsg);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white">Connexion</h3>
        <p className="mt-1 text-sm text-slate-400">
          Accédez à vos tableaux de bord de marges.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-300 text-xs uppercase tracking-wider">
            Adresse E-mail
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="nom@entreprise.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-brand-900/50 border-brand-700/50 text-white placeholder-slate-500 focus-visible:ring-accent-500"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="password" className="text-slate-300 text-xs uppercase tracking-wider">
              Mot de passe
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs text-accent-500 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-brand-900/50 border-brand-700/50 text-white placeholder-slate-500 focus-visible:ring-accent-500"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-500 text-brand-900 hover:bg-accent-500/90 font-semibold h-10 mt-2"
        >
          {loading ? 'Connexion en cours...' : 'Se connecter'}
        </Button>
      </form>

      <div className="pt-2 text-center text-xs text-slate-400">
        {"Vous n'avez pas de compte ? "}{' '}
        <Link 
          href={inviteToken ? `/signup?inviteToken=${inviteToken}` : "/signup"} 
          className="text-accent-500 font-semibold hover:underline"
        >
          Inscrivez-vous
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-white text-sm text-center">Chargement...</div>}>
      <LoginForm />
    </Suspense>
  );
}
