'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';
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

// Get user role in organization
async function getUserRole(supabase: SupabaseClient, orgId: string, userId: string): Promise<string> {
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  return membership?.role || 'viewer';
}

/**
 * Log an audit event in the database
 */
export async function logAuditEvent(
  orgId: string,
  actorUserId: string | null,
  action: string,
  entityType: string | null,
  entityId: string | null,
  metadata: any
) {
  let ip = 'Unknown';
  let ua = 'Unknown';
  try {
    const headersList = await headers();
    ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'Unknown';
    ua = headersList.get('user-agent') || 'Unknown';
  } catch (e) {
    // ignore outside of request context (like in test suites)
  }

  // Anonymize IP
  let ipPrefix = 'Unknown';
  if (ip !== 'Unknown') {
    let cleanIp = ip.split(',')[0].trim();
    if (cleanIp.includes('::ffff:')) {
      cleanIp = cleanIp.replace('::ffff:', '');
    }
    if (cleanIp.includes('.')) {
      const parts = cleanIp.split('.');
      if (parts.length === 4) {
        ipPrefix = `${parts[0]}.${parts[1]}.${parts[2]}.0`;
      }
    } else if (cleanIp.includes(':')) {
      const parts = cleanIp.split(':');
      ipPrefix = `${parts.slice(0, 4).join(':')}:0000:0000:0000:0000`;
    }
  }

  // Simplify User-Agent
  let uaFamily = 'Unknown';
  if (ua !== 'Unknown') {
    let os = 'Unknown OS';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    let browser = 'Unknown Browser';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';

    uaFamily = `${browser} on ${os}`;
  }

  try {
    const admin = createAdminClient();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: actorUserId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

/**
 * Fetch all audit logs for the organization
 */
export async function getAuditLogs(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    // Only owner and admin can view audit logs
    const userRole = await getUserRole(supabase, orgId, user.id);
    if (!['owner', 'admin'].includes(userRole)) {
      throw new Error('Non autorisé. Seuls les administrateurs et propriétaires peuvent voir les audits.');
    }

    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch profiles for the actor_user_ids to avoid PostgREST foreign key relationship errors
    const actorIds = Array.from(new Set((logs || []).map(l => l.actor_user_id).filter(Boolean))) as string[];
    const profilesMap = new Map<string, string>();

    if (actorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', actorIds);

      if (!profilesError && profiles) {
        profiles.forEach(p => {
          profilesMap.set(p.id, p.full_name || '');
        });
      }
    }

    const logsWithProfiles = (logs || []).map(log => ({
      ...log,
      profiles: log.actor_user_id ? { full_name: profilesMap.get(log.actor_user_id) || null } : null
    }));

    return { data: logsWithProfiles };
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors de la récupération.' };
  }
}
