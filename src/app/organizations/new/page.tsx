'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createOrganizationAction } from '@/actions/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building, ArrowLeft } from 'lucide-react';

export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    
    // Auto-generate slug: lowercase, replace spaces and special characters with hyphens
    const generatedSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generatedSlug);
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const generatedSlug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9\-]+/g, '');
    setSlug(generatedSlug);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('slug', slug);

    startTransition(async () => {
      const res = await createOrganizationAction(null, formData);
      if (res?.error) {
        setError(res.error);
      } else if (res?.success && res.slug) {
        router.push(`/${res.slug}`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-brand-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center items-center gap-2">
          <span className="h-10 w-10 rounded-xl bg-accent-500 flex items-center justify-center text-brand-900 font-extrabold text-xl shadow-lg shadow-accent-500/20">
            M
          </span>
          <span className="text-2xl font-bold tracking-tight text-white">
            Blue<span className="text-accent-500">Margin</span>
          </span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Créer une organisation
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Commencez à piloter vos prix et marges sous votre propre marque.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="bg-brand-900/60 backdrop-blur-md py-8 px-4 border border-brand-800/80 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-slate-300 text-xs uppercase tracking-wider font-semibold">
                Nom de l'organisation
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Ex: Marée Atlantique, Poissonnerie du Nord"
                required
                value={name}
                onChange={handleNameChange}
                className="bg-brand-950/50 border-brand-850 text-white placeholder-slate-500 focus-visible:ring-accent-500 focus-visible:border-accent-500"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="slug" className="text-slate-300 text-xs uppercase tracking-wider font-semibold">
                Lien personnalisé (Slug URL)
              </Label>
              <div className="flex rounded-md shadow-xs">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-brand-850 bg-brand-950/80 text-slate-500 sm:text-sm">
                  bluemargin/
                </span>
                <Input
                  id="slug"
                  name="slug"
                  type="text"
                  placeholder="nom-organisation"
                  required
                  value={slug}
                  onChange={handleSlugChange}
                  className="rounded-none rounded-r-md bg-brand-950/50 border-brand-850 text-white placeholder-slate-500 focus-visible:ring-accent-500 focus-visible:border-accent-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Sera utilisé dans l'URL de votre tableau de bord et de vos devis publics. Uniquement lettres, chiffres et tirets.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <Link href="/" className="w-full sm:w-1/3 order-last sm:order-first">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-brand-700 text-slate-300 hover:bg-brand-850 hover:text-white"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Retour
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={isPending}
                className="w-full sm:w-2/3 bg-accent-500 text-brand-900 hover:bg-accent-500/90 font-bold shadow-lg shadow-accent-500/10"
              >
                {isPending ? 'Création en cours...' : 'Créer l\'organisation'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
