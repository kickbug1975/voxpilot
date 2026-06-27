import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  let email = 'demo@bluemargin.com';
  let password = 'Bluemargin2026!';

  // Parse command line arguments
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--email' && process.argv[i + 1]) {
      email = process.argv[i + 1];
      i++;
    } else if (process.argv[i] === '--password' && process.argv[i + 1]) {
      password = process.argv[i + 1];
      i++;
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error('❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in environment variables.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let userId: string;

  console.log(`Checking if user ${email} already exists...`);

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('❌ Error listing users:', listError);
    process.exit(1);
  }

  const existingUser = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    userId = existingUser.id;
    console.log(`✓ User already exists with ID: ${userId}`);
  } else {
    console.log(`Creating user ${email}...`);
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error('❌ Error creating user:', createError);
      process.exit(1);
    }

    userId = createData.user.id;
    console.log(`✓ Successfully created user with ID: ${userId}`);
  }

  let orgId = 'b0000000-0000-0000-0000-000000000001';

  // Check if the demo organization exists
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();

  if (orgError) {
    console.warn('⚠️ Warning checking organization:', orgError);
  }

  if (!orgData) {
    console.log(`Demo organization ${orgId} not found, fetching the first available organization...`);
    const { data: allOrgs, error: allOrgsError } = await supabase
      .from('organizations')
      .select('id, name')
      .limit(1);

    if (allOrgsError) {
      console.error('❌ Error fetching organizations:', allOrgsError);
      process.exit(1);
    }

    if (!allOrgs || allOrgs.length === 0) {
      console.error('❌ Error: No organizations found in the database. Please run migrations and seeds first.');
      process.exit(1);
    }

    orgId = allOrgs[0].id;
    console.log(`Using organization: ${allOrgs[0].name} (${orgId})`);
  } else {
    console.log(`✓ Found demo organization: ${orgData.name} (${orgId})`);
  }

  // Create or update profile record
  console.log(`Setting up profile for user ${userId}...`);
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name: 'Demo User',
      locale: 'fr-BE',
      last_active_organization_id: orgId,
    });

  if (profileError) {
    console.warn('⚠️ Warning setting profile:', profileError);
  } else {
    console.log('✓ Profile set successfully.');
  }

  // Link the user to the organization
  console.log(`Linking user ${userId} to organization ${orgId} as owner...`);
  const { error: membershipError } = await supabase
    .from('organization_memberships')
    .upsert({
      organization_id: orgId,
      user_id: userId,
      role: 'owner',
      status: 'active',
    });

  if (membershipError) {
    console.error('❌ Error linking user to organization:', membershipError);
    process.exit(1);
  }

  console.log(`✓ Membership set to owner & active.`);

  console.log('\n=========================================');
  console.log('🎉 Demo User Setup Complete!');
  console.log('=========================================');
  console.log(`Email:      ${email}`);
  console.log(`Password:   ${password}`);
  console.log(`Org ID:     ${orgId}`);
  console.log(`Role:       owner`);
  console.log(`Status:     active`);
  console.log('\nInstructions:');
  console.log('1. Start the app with: npm run dev');
  console.log('2. Navigate to: http://localhost:3000');
  console.log('3. Log in with the credentials above.');
  console.log('=========================================\n');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
