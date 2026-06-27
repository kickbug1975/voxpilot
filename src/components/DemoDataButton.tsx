'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadDemoData } from '@/actions/demo';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function DemoDataButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleLoad = async () => {
    setLoading(true);
    setStatus('idle');

    try {
      const result = await loadDemoData();
      if (result.error) {
        throw new Error(result.error);
      }
      setStatus('success');
      router.refresh();
      // Reset status after 3 seconds
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleLoad}
      disabled={loading}
      variant="outline"
      size="xs"
      className="w-full justify-center text-xs font-semibold py-1 h-7 border-brand-700 bg-brand-900/40 text-accent-500 hover:bg-accent-500 hover:text-brand-900 focus-visible:ring-accent-500 cursor-pointer"
    >
      <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Chargement...' : status === 'success' ? 'Données chargées !' : status === 'error' ? 'Erreur !' : 'Charger la démo'}
    </Button>
  );
}
