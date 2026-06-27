'use client';

import React, { useActionState, startTransition, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signUpAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('inviteToken');

  const [state, formAction, isPending] = useActionState(signUpAction, null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  };

  if (state?.success) {
    return (
      <div className="space-y-4 text-center">
        <h3 className="text-xl font-bold text-white">Inscription réussie !</h3>
        <p className="text-sm text-slate-300">
          {"Votre compte a été créé avec succès et associé à l'organisation de démonstration."}
        </p>
        <div className="pt-4">
          <Link href={inviteToken ? `/login?inviteToken=${inviteToken}` : "/login"} className="w-full">
            <Button className="w-full bg-accent-500 text-brand-900 hover:bg-accent-500/90 font-semibold h-10">
              Se connecter
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white">Créer un compte</h3>
        <p className="mt-1 text-sm text-slate-400">
          {"Rejoignez l'organisation pilote de BlueMargin."}
        </p>
      </div>

      {state?.error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          {state.error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-slate-300 text-xs uppercase tracking-wider">
            Nom complet
          </Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            placeholder="Jean Dupont"
            required
            className="bg-brand-900/50 border-brand-700/50 text-white placeholder-slate-500 focus-visible:ring-accent-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-300 text-xs uppercase tracking-wider">
            Adresse E-mail
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="jean.dupont@entreprise.com"
            required
            className="bg-brand-900/50 border-brand-700/50 text-white placeholder-slate-500 focus-visible:ring-accent-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-slate-300 text-xs uppercase tracking-wider">
            Mot de passe
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            className="bg-brand-900/50 border-brand-700/50 text-white placeholder-slate-500 focus-visible:ring-accent-500"
          />
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-accent-500 text-brand-900 hover:bg-accent-500/90 font-semibold h-10 mt-2"
        >
          {isPending ? 'Création du compte...' : 'S\'inscrire'}
        </Button>
      </form>

      <div className="pt-2 text-center text-xs text-slate-400">
        Vous avez déjà un compte ?{' '}
        <Link href={inviteToken ? `/login?inviteToken=${inviteToken}` : "/login"} className="text-accent-500 font-semibold hover:underline">
          Connectez-vous
        </Link>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="text-white text-sm text-center">Chargement...</div>}>
      <SignupForm />
    </Suspense>
  );
}
