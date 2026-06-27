'use server';

import { createClient } from '@/lib/supabase/server';
import { TimelineService } from '@/domain/crm/TimelineService';

export async function getCustomerTimeline(
  customerId: string,
  options: {
    limit?: number;
    before?: string | null;
    sources?: any[];
  } = {}
) {
  try {
    const supabase = await createClient();
    const data = await TimelineService.getCustomerTimeline(supabase, customerId, options);
    return { data };
  } catch (err) {
    console.error('Error fetching customer timeline:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger l\'historique d\'activité.' };
  }
}
