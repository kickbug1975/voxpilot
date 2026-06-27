import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const id = '8c1edf10-ecac-4096-9825-a32ca817b73a';
  const orgId = 'e6326d9c-df7c-4860-93a0-c65d6c8b9a11';
  console.log(`Checking view_supplier_products for product: ${id}`);

  const { data, error } = await supabase
    .from('view_supplier_products')
    .select('*, suppliers(name)')
    .eq('organization_id', orgId)
    .eq('product_id', id);

  console.log('Error:', error);
  console.log('Data length:', data?.length);
  console.log('Data:', data);
}

run().catch(console.error);
