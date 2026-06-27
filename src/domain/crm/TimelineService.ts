import { SupabaseClient } from '@supabase/supabase-js';

export interface TimelineEntry {
  entry_key: string;
  source: 'activity' | 'crm_event' | 'quote_event';
  event_type: string;
  title: string;
  body: string | null;
  actor_user_id: string | null;
  actor_name: string;
  contact_id: string | null;
  quote_id: string | null;
  task_id: string | null;
  occurred_at: string;
  metadata: any;
}

export class TimelineService {
  /**
   * Récupère la timeline consolidée d'un client.
   * Filtres optionnels: limit, date pivot avant, sources de données.
   */
  static async getCustomerTimeline(
    supabase: SupabaseClient,
    customerId: string,
    options: {
      limit?: number;
      before?: string | null;
      sources?: ('activities' | 'crm_events' | 'quote_events')[];
    } = {}
  ): Promise<TimelineEntry[]> {
    const { data, error } = await supabase.rpc('get_customer_timeline', {
      p_customer_id: customerId,
      p_limit: options.limit || 30,
      p_before: options.before || null,
      p_sources: options.sources || null,
    });

    if (error) throw error;
    return (data || []) as TimelineEntry[];
  }
}
