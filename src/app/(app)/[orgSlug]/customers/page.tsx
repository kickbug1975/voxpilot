import React from 'react';
import { getCustomers } from '@/actions/customers';
import CustomersPageClient from './CustomersPageClient';

interface CustomersPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function CustomersPage({ params }: CustomersPageProps) {
  const { orgSlug } = await params;
  const { data: customers, error } = await getCustomers(orgSlug);

  return (
    <CustomersPageClient 
      orgSlug={orgSlug} 
      initialCustomers={customers || []} 
      error={error || null} 
    />
  );
}
