'use server';

import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

// Helper to get organization ID and verify membership
async function getOrgId(supabase: SupabaseClient, orgSlug: string): Promise<string> {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (error || !org) {
    throw new Error('Organisation introuvable ou accès non autorisé.');
  }

  return org.id;
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

export interface SearchResults {
  products: SearchResultItem[];
  customers: SearchResultItem[];
  suppliers: SearchResultItem[];
  quotes: SearchResultItem[];
}

/**
 * Effectue une recherche globale multi-entités dans l'organisation
 */
export async function globalSearch(orgSlug: string, queryText: string) {
  try {
    const trimmed = (queryText || '').trim();
    if (trimmed.length < 2) {
      return { 
        data: { 
          products: [], 
          customers: [], 
          suppliers: [], 
          quotes: [] 
        } 
      };
    }

    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // Escape double quotes and wrap with double quotes to prevent PostgREST syntax errors with special characters (commas, parentheses, etc.)
    const escaped = trimmed.replace(/"/g, '\\"');
    const matchText = `"%${escaped}%"`;

    // Fetch Products, Customers, Suppliers, and Quotes in parallel under tenant isolation
    const [productsRes, customersRes, suppliersRes, quotesRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, internal_sku')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .or(`name.ilike.${matchText},internal_sku.ilike.${matchText}`)
        .limit(5),
      supabase
        .from('customers')
        .select('id, legal_name, code')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .or(`legal_name.ilike.${matchText},code.ilike.${matchText}`)
        .limit(5),
      supabase
        .from('suppliers')
        .select('id, name, code')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .or(`name.ilike.${matchText},code.ilike.${matchText}`)
        .limit(5),
      supabase
        .from('quotes')
        .select('id, quote_number, title')
        .eq('organization_id', orgId)
        .or(`quote_number.ilike.${matchText},title.ilike.${matchText}`)
        .limit(5),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (customersRes.error) throw customersRes.error;
    if (suppliersRes.error) throw suppliersRes.error;
    if (quotesRes.error) throw quotesRes.error;

    const products: SearchResultItem[] = (productsRes.data || []).map(p => ({
      id: p.id,
      title: p.name,
      subtitle: `SKU: ${p.internal_sku}`,
      url: `/${orgSlug}/products/${p.id}`,
    }));

    const customers: SearchResultItem[] = (customersRes.data || []).map(c => ({
      id: c.id,
      title: c.legal_name,
      subtitle: c.code ? `Code: ${c.code}` : undefined,
      url: `/${orgSlug}/customers/${c.id}`,
    }));

    const suppliers: SearchResultItem[] = (suppliersRes.data || []).map(s => ({
      id: s.id,
      title: s.name,
      subtitle: s.code ? `Code: ${s.code}` : undefined,
      url: `/${orgSlug}/suppliers/${s.id}`,
    }));

    const quotes: SearchResultItem[] = (quotesRes.data || []).map(q => ({
      id: q.id,
      title: q.quote_number,
      subtitle: q.title || undefined,
      url: `/${orgSlug}/quotes/${q.id}`,
    }));

    return {
      data: {
        products,
        customers,
        suppliers,
        quotes,
      } as SearchResults
    };
  } catch (err) {
    console.error('Error during global search:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors de la recherche.' };
  }
}
