import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error('❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in environment variables.');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log('⏳ Rebuilding CRM Caches for all active customers...');
  
  try {
    const { CustomerCrmService } = await import('../src/domain/crm/CustomerCrmService');
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, legal_name')
      .eq('is_active', true);
      
    if (error) throw error;
    
    if (!customers || customers.length === 0) {
      console.log('No active customers found.');
      return;
    }
    
    console.log(`Found ${customers.length} customers to update.`);
    
    let successCount = 0;
    for (const customer of customers) {
      try {
        await CustomerCrmService.rebuildCustomerCrmCaches(supabase, customer.id);
        console.log(`✓ Rebuilt cache for: ${customer.legal_name} (${customer.id})`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to rebuild cache for ${customer.legal_name}:`, err);
      }
    }
    
    console.log(`\n🎉 Completed rebuilding ${successCount}/${customers.length} customer caches.`);
  } catch (err) {
    console.error('❌ Error rebuilding CRM caches:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
