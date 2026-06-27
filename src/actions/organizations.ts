'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function createOrganizationAction(prevState: any, formData: FormData) {
  const name = formData.get('name') as string;
  const slugInput = formData.get('slug') as string;

  if (!name || !slugInput) {
    return { error: 'Le nom et le slug de l\'organisation sont obligatoires.' };
  }

  // Slugify input: lowercase, replace spaces and special characters with hyphens
  const slug = slugInput
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length < 3) {
    return { error: 'Le slug de l\'organisation doit faire au moins 3 caractères alphanumériques.' };
  }

  try {
    const supabase = await createClient();

    // 1. Get logged-in user (verifies token via normal client)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('[DEBUG] User in createOrganizationAction:', user?.id, user?.email);
    if (userError) {
      console.error('[DEBUG] getUser error:', userError);
    }
    if (!user) {
      return { error: 'Vous devez être connecté pour créer une organisation.' };
    }

    // Initialize admin client to bypass RLS for organization bootstrapping
    const admin = createAdminClient();

    // 2. Check if slug is unique
    const { data: existingOrg } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingOrg) {
      return { error: 'Ce slug d\'organisation est déjà utilisé. Veuillez en choisir un autre.' };
    }

    // 3. Create the organization using admin client
    const { data: newOrg, error: orgError } = await admin
      .from('organizations')
      .insert({
        name,
        slug,
        default_margin_rate: 0.20,
        default_rounding_rule: 'up_0_05',
        default_quote_validity_days: 14,
        cost_increase_alert_rate: 0.05,
        sales_can_view_costs: true,
        sales_can_override_floor: false,
        created_by: user.id,
      })
      .select('id, slug')
      .single();

    if (orgError || !newOrg) {
      console.error('[DEBUG] Error creating organization:', orgError);
      return { error: 'Impossible de créer l\'organisation.' };
    }

    // 4. Create owner membership using admin client
    const { error: membershipError } = await admin
      .from('organization_memberships')
      .insert({
        organization_id: newOrg.id,
        user_id: user.id,
        role: 'owner',
        status: 'active',
      });

    if (membershipError) {
      console.error('Error creating organization membership:', membershipError);
      return { error: 'Erreur lors de l\'association de l\'organisation à votre profil.' };
    }

    // 5. Update user profile last_active_organization_id using admin client
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        last_active_organization_id: newOrg.id,
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error updating user profile:', profileError);
    }

    revalidatePath('/');
    return { success: true, slug: newOrg.slug };
  } catch (err) {
    console.error('Unexpected error in createOrganizationAction:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur inattendue est survenue.' };
  }
}
