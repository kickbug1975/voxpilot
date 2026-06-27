'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { acceptInvitation } from '@/actions/settings';
import { RefreshCw, ArrowRight, AlertTriangle } from 'lucide-react';

interface InviteAcceptButtonProps {
  token: string;
}

export default function InviteAcceptButton({ token }: InviteAcceptButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await acceptInvitation(token);
      if (res.error) {
        setError(res.error);
        setLoading(false);
      } else if (res.redirectSlug) {
        router.push(`/${res.redirectSlug}`);
        router.refresh();
      }
    } catch {
      setError("Une erreur inattendue est survenue.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs font-semibold flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        onClick={handleAccept}
        disabled={loading}
        className="w-full bg-accent-500 hover:bg-accent-500/90 text-brand-900 font-black text-xs h-10 cursor-pointer flex gap-1.5 justify-center"
      >
        {loading ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            {"Acceptation en cours..."}
          </>
        ) : (
          <>
            {"Accepter l'invitation"}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
