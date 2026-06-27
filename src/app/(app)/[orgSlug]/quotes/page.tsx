import React from 'react';
import { getQuotes } from '@/actions/quotes';
import { getCustomers } from '@/actions/customers';
import QuotesPageClient from './QuotesPageClient';

interface QuotesPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function QuotesPage({ params }: QuotesPageProps) {
  const { orgSlug } = await params;
  
  const { data: quotes, error: qError } = await getQuotes(orgSlug);
  const { data: customers } = await getCustomers(orgSlug);

  return (
    <QuotesPageClient
      orgSlug={orgSlug}
      initialQuotes={quotes || []}
      customers={customers || []}
      error={qError || null}
    />
  );
}
