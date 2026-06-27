'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });

      if (resetError) throw resetError;

      setSuccess(true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Une erreur est survenue lors de l'envoi du lien de réinitialisation.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <h3 className="text-xl font-bold text-white">Lien envoyé !</h3>
        <p className="text-sm text-slate-300">
          {"Un e-mail de réinitialisation a été envoyé à l'adresse "} <strong>{email}</strong>{". Veuillez consulter vos spams si vous ne le recevez pas."}
        </p>
        <div className="pt-4">
          <Link href="/login" className="w-full">
            <Button className="w-full bg-accent-500 text-brand-900 hover:bg-accent-500/90 font-semibold h-10">
              Retour à la connexion
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white">Mot de passe oublié</h3>
        <p className="mt-1 text-sm text-slate-400">
          Saisissez votre e-mail pour recevoir un lien de réinitialisation.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-4">
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

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-500 text-brand-900 hover:bg-accent-500/90 font-semibold h-10 mt-2"
        >
          {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
        </Button>
      </form>

      <div className="pt-2 text-center text-xs text-slate-400">
        <Link href="/login" className="text-accent-500 font-semibold hover:underline">
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
