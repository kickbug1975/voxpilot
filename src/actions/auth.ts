'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function signUpAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;

  if (!email || !password || !fullName) {
    return { error: 'Tous les champs sont requis.' };
  }

  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        }
      }
    });

    if (error) {
      return { error: error.message };
    }

    if (data.user) {
      // 1. Create profile
      const { error: profileError } = await admin.from('profiles').insert({
        id: data.user.id,
        full_name: fullName,
        last_active_organization_id: '4a41f810-76e3-4400-b6c2-32d33746a94d', // Production org (Maison Fumesse)
      });

      if (profileError) {
        console.error('Error creating profile:', profileError);
      }

      // 2. Associate with production organization "Maison Fumesse" as owner/admin
      const { error: membershipError } = await admin.from('organization_memberships').insert({
        organization_id: '4a41f810-76e3-4400-b6c2-32d33746a94d',
        user_id: data.user.id,
        role: 'owner',
        status: 'active',
      });

      if (membershipError) {
        console.error('Error creating membership:', membershipError);
      }

      return { success: true };
    }

    return { error: 'Erreur inconnue lors de l\'inscription.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
    return { error: message };
  }
}
