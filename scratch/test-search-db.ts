import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const orgSlug = 'demo-maree-belgique';
  const queryText = process.argv[2] || 'amandes';

  console.log(`Testing DB query for org: ${orgSlug}, search text: ${queryText}`);

  // Get org ID
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single();

  if (orgErr || !org) {
    console.error('Error fetching org:', orgErr);
    return;
  }

  console.log('Found org:', org);

  const matchText = `%${queryText}%`;

  const [productsRes, customersRes, suppliersRes, quotesRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, internal_sku')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .or(`name.ilike.${matchText},internal_sku.ilike.${matchText}`)
      .limit(5),
    supabase
      .from('customers')
      .select('id, legal_name, code')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .or(`legal_name.ilike.${matchText},code.ilike.${matchText}`)
      .limit(5),
    supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .or(`name.ilike.${matchText},code.ilike.${matchText}`)
      .limit(5),
    supabase
      .from('quotes')
      .select('id, quote_number, title')
      .eq('organization_id', org.id)
      .or(`quote_number.ilike.${matchText},title.ilike.${matchText}`)
      .limit(5),
  ]);

  console.log('Products:', productsRes.error || productsRes.data);
  console.log('Customers:', customersRes.error || customersRes.data);
  console.log('Suppliers:', suppliersRes.error || suppliersRes.data);
  console.log('Quotes:', quotesRes.error || quotesRes.data);
}

run().catch(console.error);
