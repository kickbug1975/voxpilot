import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const orgId = 'e6326d9c-df7c-4860-93a0-c65d6c8b9a11';
  
  // Test with double quoted values in .or()
  // PostgREST expects double quotes around values that contain special characters like parentheses or commas
  const rawQuery = 'amandes (1kg)';
  // Escape double quotes inside query, and wrap with double quotes
  const escaped = rawQuery.replace(/"/g, '\\"');
  const matchText = `"%${escaped}%"`;

  console.log('Testing with matchText:', matchText);

  const { data, error } = await supabase
    .from('products')
    .select('id, name, internal_sku')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .or(`name.ilike.${matchText},internal_sku.ilike.${matchText}`)
    .limit(5);

  console.log('Result:', error || data);

  // Test with comma
  const rawQuery2 = 'amandes, 1';
  const escaped2 = rawQuery2.replace(/"/g, '\\"');
  const matchText2 = `"%${escaped2}%"`;
  
  console.log('Testing with comma matchText:', matchText2);
  const res2 = await supabase
    .from('products')
    .select('id, name, internal_sku')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .or(`name.ilike.${matchText2},internal_sku.ilike.${matchText2}`)
    .limit(5);

  console.log('Result 2:', res2.error || res2.data);
}

run().catch(console.error);
