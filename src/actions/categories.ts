'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
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

export async function createCategory(orgSlug: string, name: string, parentId: string | null = null) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    if (!name) throw new Error('Le nom de la catégorie est obligatoire.');

    const { data, error } = await supabase
      .from('product_categories')
      .insert({
        organization_id: orgId,
        name,
        parent_id: parentId || null,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true, data };
  } catch (err) {
    console.error('Error creating category:', err);
    const message = err instanceof Error ? err.message : 'Impossible de créer la catégorie.';
    return { error: message };
  }
}

export async function updateCategory(orgSlug: string, id: string, name: string, parentId: string | null = null) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    if (!name) throw new Error('Le nom de la catégorie est obligatoire.');

    // Prevent cyclic relationship
    if (id === parentId) {
      throw new Error('Une catégorie ne peut pas être son propre parent.');
    }

    const { data, error } = await supabase
      .from('product_categories')
      .update({
        name,
        parent_id: parentId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true, data };
  } catch (err) {
    console.error('Error updating category:', err);
    const message = err instanceof Error ? err.message : 'Impossible de modifier la catégorie.';
    return { error: message };
  }
}

export async function deleteCategory(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('organization_id', orgId)
      .eq('id', id);

    if (error) throw error;

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true };
  } catch (err) {
    console.error('Error deleting category:', err);
    const message = err instanceof Error ? err.message : 'Impossible de supprimer la catégorie.';
    return { error: message };
  }
}
