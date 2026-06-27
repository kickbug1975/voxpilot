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

  console.log('⏳ Running CRM Daily Automations (Inactivity check, Overdue alerts, Next actions)...');
  
  try {
    const { CrmAutomationService } = await import('../src/domain/crm/CrmAutomationService');
    const results = await CrmAutomationService.runDailyAutomations(supabase);
    
    console.log('\n=========================================');
    console.log('🎉 CRM Daily Automations Complete!');
    console.log('=========================================');
    console.log(`Inactivity transitions:     ${results.inactivityProcessed}`);
    console.log(`Overdue task alerts raised: ${results.overdueTasksAlerted}`);
    console.log(`Missing next action alerts: ${results.missingNextActionAlerted}`);
    console.log('=========================================\n');
  } catch (err) {
    console.error('❌ Error running CRM daily automations:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
