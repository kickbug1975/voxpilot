'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { encrypt, decrypt } from '@/lib/encryption';
import { sendEmail } from '@/lib/emailSender';
import { z } from 'zod';

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

// Helper to verify that the user has owner or admin role
async function verifyAdminOrOwnerRole(supabase: SupabaseClient, orgId: string, userId: string): Promise<string> {
  const { data: membership, error } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !membership) {
    throw new Error("Accès non autorisé : vous n'êtes pas membre actif de cette organisation.");
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    throw new Error("Action non autorisée : seuls les administrateurs et propriétaires peuvent modifier ces paramètres.");
  }

  return membership.role;
}

// Helper to get IP prefix and UA for audit logs
async function getClientMetadata() {
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
    let cleanIp = ip.trim();
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
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';

    let browser = 'Unknown Browser';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edge')) browser = 'Edge';

    uaFamily = `${browser} on ${os}`;
  }

  return { ipPrefix, uaFamily };
}

// Helper to hash token
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface OrgSettingsInput {
  name: string;
  vat_number: string | null;
  phone: string | null;
  commercial_email: string | null;
  timezone: string;
  default_margin_rate: number;
  default_rounding_rule: string;
  default_quote_validity_days: number;
  cost_increase_alert_rate: number;
  sales_can_view_costs: boolean;
  sales_can_override_floor: boolean;
}

/**
 * Met à jour les paramètres de l'organisation
 */
export async function updateOrgSettings(orgSlug: string, data: OrgSettingsInput) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Utilisateur non connecté.');

    const orgId = await getOrgId(supabase, orgSlug);
    await verifyAdminOrOwnerRole(supabase, orgId, user.id);

    // Perform update
    const { error: updateError } = await admin
      .from('organizations')
      .update({
        name: data.name,
        vat_number: data.vat_number,
        phone: data.phone,
        commercial_email: data.commercial_email,
        timezone: data.timezone,
        default_margin_rate: data.default_margin_rate,
        default_rounding_rule: data.default_rounding_rule,
        default_quote_validity_days: data.default_quote_validity_days,
        cost_increase_alert_rate: data.cost_increase_alert_rate,
        sales_can_view_costs: data.sales_can_view_costs,
        sales_can_override_floor: data.sales_can_override_floor,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    if (updateError) throw updateError;

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'update_settings',
      entity_type: 'organizations',
      entity_id: orgId,
      metadata: { changes: data },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    revalidatePath(`/${orgSlug}/settings`);
    revalidatePath(`/${orgSlug}`);
    return { success: true };
  } catch (err) {
    console.error('Error updating org settings:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors de la mise à jour.' };
  }
}

/**
 * Invite un nouveau collaborateur par e-mail
 */
export async function inviteTeamMember(orgSlug: string, email: string, role: string) {
  try {
    if (!email || !role) throw new Error("L'e-mail et le rôle sont obligatoires.");
    if (!['owner', 'admin', 'manager', 'sales', 'viewer'].includes(role)) {
      throw new Error('Rôle invalide.');
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Utilisateur non connecté.');

    const orgId = await getOrgId(supabase, orgSlug);
    await verifyAdminOrOwnerRole(supabase, orgId, user.id);

    // Fetch org details for the simulation message
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    const orgName = org?.name || 'BlueMargin';

    // Check if user is already a member
    // Find auth user by email
    let existingUserId: string | null = null;
    try {
      const { data: userData } = await admin.auth.admin.listUsers();
      const match = userData?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (match) {
        existingUserId = match.id;
      }
    } catch (e) {
      // User not found in auth
    }

    if (existingUserId) {
      const { data: membership } = await admin
        .from('organization_memberships')
        .select('*')
        .eq('organization_id', orgId)
        .eq('user_id', existingUserId)
        .maybeSingle();

      if (membership) {
        throw new Error('Cet utilisateur est déjà membre de l\'organisation.');
      }
    }

    // Check if invitation already exists
    const { data: existingInvite } = await admin
      .from('organization_invitations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('email', email.trim().toLowerCase())
      .is('accepted_at', null)
      .maybeSingle();

    if (existingInvite) {
      throw new Error('Une invitation est déjà en cours pour cette adresse e-mail.');
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); // 7 days

    const { error: inviteError } = await admin
      .from('organization_invitations')
      .insert({
        organization_id: orgId,
        email: email.trim().toLowerCase(),
        role,
        token_hash: tokenHash,
        expires_at: expiresAt,
        invited_by: user.id
      });

    if (inviteError) throw inviteError;

    // Envoi de l'e-mail via le service dynamique emailSender
    let origin = 'http://localhost:3000';
    try {
      const headersList = await headers();
      const host = headersList.get('host') || 'localhost:3000';
      const protocol = headersList.get('x-forwarded-proto') || 'http';
      origin = `${protocol}://${host}`;
    } catch (e) {
      console.warn('[EMAIL] headers() appelé hors contexte de requête. Utilisation de l\'origine par défaut.');
    }
    const inviteUrl = `${origin}/invite/${token}`;

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Rejoignez l'organisation ${orgName} sur VoxPilot</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">
          Bonjour,<br/><br/>
          Vous avez été invité(e) par un administrateur à rejoindre l'organisation <strong>${orgName}</strong> sur VoxPilot en tant que <strong>${role}</strong>.<br/>
          Pour accepter cette invitation et configurer votre compte, cliquez sur le bouton ci-dessous :
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${inviteUrl}" style="background-color: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
            Accepter l'invitation
          </a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Si le bouton ne fonctionne pas, vous pouvez copier et coller le lien suivant dans votre navigateur :<br/>
          <a href="${inviteUrl}" style="color: #0284c7;">${inviteUrl}</a>
        </p>
      </div>
    `;

    await sendEmail({
      userId: user.id,
      organizationId: orgId,
      to: [email.trim().toLowerCase()],
      subject: `Invitation à rejoindre l'organisation ${orgName} sur BlueMargin`,
      html: htmlBody,
      customMessageId: token
    });

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'invite_member',
      entity_type: 'organization_invitations',
      metadata: { email, role, expiresAt },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true, token };
  } catch (err) {
    console.error('Error inviting team member:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'invitation.' };
  }
}

/**
 * Renvoie une invitation (prolonge la validité et régénère le jeton)
 */
export async function resendInvitation(orgSlug: string, inviteId: string) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Utilisateur non connecté.');

    const orgId = await getOrgId(supabase, orgSlug);
    await verifyAdminOrOwnerRole(supabase, orgId, user.id);

    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();
    const orgName = orgData?.name || 'votre organisation';

    // Fetch original invitation
    const { data: invite, error: inviteError } = await admin
      .from('organization_invitations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) throw new Error('Invitation introuvable.');
    if (invite.accepted_at) throw new Error('Cette invitation a déjà été acceptée.');

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const { error: updateError } = await admin
      .from('organization_invitations')
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        invited_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', inviteId);

    if (updateError) throw updateError;
    // Envoi de l'e-mail via le service dynamique emailSender
    let origin = 'http://localhost:3000';
    try {
      const headersList = await headers();
      const host = headersList.get('host') || 'localhost:3000';
      const protocol = headersList.get('x-forwarded-proto') || 'http';
      origin = `${protocol}://${host}`;
    } catch (e) {
      console.warn('[EMAIL] headers() appelé hors contexte de requête. Utilisation de l\'origine par défaut.');
    }
    const inviteUrl = `${origin}/invite/${token}`;

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Relance : Rejoignez l'organisation ${orgName} sur VoxPilot</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">
          Bonjour,<br/><br/>
          Ceci est un rappel de votre invitation à rejoindre l'organisation <strong>${orgName}</strong> sur VoxPilot.<br/>
          Pour accepter l'invitation, veuillez cliquer sur le bouton ci-dessous :
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${inviteUrl}" style="background-color: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
            Accepter l'invitation
          </a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Si le bouton ne fonctionne pas, vous pouvez copier et coller le lien suivant dans votre navigateur :<br/>
          <a href="${inviteUrl}" style="color: #0284c7;">${inviteUrl}</a>
        </p>
      </div>
    `;

    await sendEmail({
      userId: user.id,
      organizationId: orgId,
      to: [invite.email],
      subject: `Relance : Invitation à rejoindre BlueMargin`,
      html: htmlBody,
      customMessageId: token
    });

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'resend_invite',
      entity_type: 'organization_invitations',
      entity_id: inviteId,
      metadata: { email: invite.email, expiresAt },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true, token };
  } catch (err) {
    console.error('Error resending invitation:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors du renvoi.' };
  }
}

/**
 * Révoque (annule) une invitation en attente
 */
export async function revokeInvitation(orgSlug: string, inviteId: string) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Utilisateur non connecté.');

    const orgId = await getOrgId(supabase, orgSlug);
    await verifyAdminOrOwnerRole(supabase, orgId, user.id);

    // Fetch invitation for audit log details
    const { data: invite } = await admin
      .from('organization_invitations')
      .select('email')
      .eq('organization_id', orgId)
      .eq('id', inviteId)
      .single();

    const { error: deleteError } = await admin
      .from('organization_invitations')
      .delete()
      .eq('organization_id', orgId)
      .eq('id', inviteId);

    if (deleteError) throw deleteError;

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'revoke_invite',
      entity_type: 'organization_invitations',
      entity_id: inviteId,
      metadata: { email: invite?.email || 'unknown' },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true };
  } catch (err) {
    console.error('Error revoking invitation:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors de la révocation.' };
  }
}

/**
 * Modifie le rôle d'un membre de l'équipe
 */
export async function updateMemberRole(orgSlug: string, targetUserId: string, newRole: string) {
  try {
    if (!targetUserId || !newRole) throw new Error("L'utilisateur et le rôle sont requis.");
    if (!['owner', 'admin', 'manager', 'sales', 'viewer'].includes(newRole)) {
      throw new Error('Rôle invalide.');
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Utilisateur non connecté.');

    const orgId = await getOrgId(supabase, orgSlug);
    await verifyAdminOrOwnerRole(supabase, orgId, user.id);

    // Prevent modifying yourself
    if (targetUserId === user.id) {
      throw new Error("Vous ne pouvez pas modifier votre propre rôle. Demandez à un autre propriétaire.");
    }

    // Check target current role
    const { data: targetMembership, error: targetError } = await admin
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .single();

    if (targetError || !targetMembership) throw new Error("Membre introuvable.");

    // If target is owner, only another owner can demote him (and only if there are other owners)
    if (targetMembership.role === 'owner') {
      const { data: memberships } = await admin
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', orgId)
        .eq('role', 'owner')
        .eq('status', 'active');

      const ownerCount = memberships?.length || 0;
      if (ownerCount <= 1) {
        throw new Error("Impossible de modifier le rôle du propriétaire car il est le seul propriétaire de l'organisation.");
      }
    }

    const { error: updateError } = await admin
      .from('organization_memberships')
      .update({
        role: newRole,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId);

    if (updateError) throw updateError;

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'update_member_role',
      entity_type: 'organization_memberships',
      entity_id: targetUserId,
      metadata: { target_user_id: targetUserId, old_role: targetMembership.role, new_role: newRole },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true };
  } catch (err) {
    console.error('Error updating member role:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors de la mise à jour du rôle.' };
  }
}

/**
 * Active ou désactive un membre de l'équipe
 */
export async function updateMemberStatus(orgSlug: string, targetUserId: string, status: 'active' | 'disabled') {
  try {
    if (!targetUserId || !status) throw new Error("L'utilisateur et le statut sont requis.");

    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Utilisateur non connecté.');

    const orgId = await getOrgId(supabase, orgSlug);
    await verifyAdminOrOwnerRole(supabase, orgId, user.id);

    // Prevent disabling yourself
    if (targetUserId === user.id) {
      throw new Error("Vous ne pouvez pas activer/désactiver votre propre compte.");
    }

    // Check target membership details
    const { data: targetMembership, error: targetError } = await admin
      .from('organization_memberships')
      .select('role, status')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .single();

    if (targetError || !targetMembership) throw new Error("Membre introuvable.");

    // If target is owner, prevent disabling the last active owner
    if (targetMembership.role === 'owner' && status === 'disabled') {
      const { data: activeOwners } = await admin
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', orgId)
        .eq('role', 'owner')
        .eq('status', 'active');

      if ((activeOwners?.length || 0) <= 1) {
        throw new Error("Impossible de désactiver le propriétaire car il est le seul propriétaire actif.");
      }
    }

    const { error: updateError } = await admin
      .from('organization_memberships')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId);

    if (updateError) throw updateError;

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: status === 'active' ? 'enable_member' : 'disable_member',
      entity_type: 'organization_memberships',
      entity_id: targetUserId,
      metadata: { target_user_id: targetUserId, status },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    revalidatePath(`/${orgSlug}/settings`);
    return { success: true };
  } catch (err) {
    console.error('Error updating member status:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue.' };
  }
}

/**
 * Récupère une invitation publique via son jeton brut
 */
export async function getPublicInvitation(token: string) {
  try {
    if (!token) throw new Error('Jeton requis.');
    const admin = createAdminClient();
    const tokenHash = hashToken(token);

    const { data: invite, error } = await admin
      .from('organization_invitations')
      .select('*, organizations(name, slug)')
      .eq('token_hash', tokenHash)
      .single();

    if (error || !invite) {
      return { error: "Cette invitation est invalide ou a été révoquée." };
    }

    // Check expiry
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return { error: "Cette invitation a expiré (validité de 7 jours dépassée)." };
    }

    if (invite.accepted_at) {
      return { error: "Cette invitation a déjà été acceptée." };
    }

    return { data: invite };
  } catch (err) {
    console.error('Error loading public invitation:', err);
    return { error: err instanceof Error ? err.message : 'Erreur de chargement de l\'invitation.' };
  }
}

/**
 * Accepte une invitation d'équipe pour l'utilisateur actuellement connecté
 */
export async function acceptInvitation(token: string) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Veuillez vous connecter pour accepter cette invitation.');

    const tokenHash = hashToken(token);

    // Look up invitation
    const { data: invite, error: inviteError } = await admin
      .from('organization_invitations')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();

    if (inviteError || !invite) throw new Error("Invitation introuvable ou invalide.");
    if (invite.accepted_at) throw new Error("Cette invitation a déjà été acceptée.");
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error("L'invitation a expiré.");
    }

    // Check if user is already a member
    const { data: existingMembership } = await admin
      .from('organization_memberships')
      .select('*')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMembership) {
      // Mark invite as accepted anyway if they are already active
      await admin
        .from('organization_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id);
        
      throw new Error("Vous êtes déjà membre de cette organisation.");
    }

    // 1. Create membership
    const { error: membershipError } = await admin
      .from('organization_memberships')
      .insert({
        organization_id: invite.organization_id,
        user_id: user.id,
        role: invite.role,
        status: 'active',
        invited_by: invite.invited_by,
        invited_at: invite.created_at,
        joined_at: new Date().toISOString()
      });

    if (membershipError) throw membershipError;

    // 2. Mark invitation as accepted
    await admin
      .from('organization_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invite.id);

    // 3. Update user profile last active organization
    await admin
      .from('profiles')
      .update({
        last_active_organization_id: invite.organization_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Fetch org slug for redirect
    const { data: org } = await admin
      .from('organizations')
      .select('slug')
      .eq('id', invite.organization_id)
      .single();

    const redirectSlug = org?.slug || 'dashboard';

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: invite.organization_id,
      actor_user_id: user.id,
      action: 'accept_invite',
      entity_type: 'organization_memberships',
      entity_id: user.id,
      metadata: { invite_id: invite.id, role: invite.role },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    return { success: true, redirectSlug };
  } catch (err) {
    console.error('Error accepting invitation:', err);
    return { error: err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'acceptation de l\'invitation.' };
  }
}

export interface CrmSettingsInput {
  crm_visibility_mode: 'all_customers' | 'assigned_customers';
  default_quote_follow_up_delay_days: number;
  inactive_customer_delay_days: number;
  require_next_action_after_activity: boolean;
  allow_sales_reassignment: boolean;
  crm_activity_outcomes_enabled: boolean;
  auto_create_quote_follow_up_task: boolean;
  require_lost_reason: boolean;
}

export async function updateCrmSettings(orgSlug: string, data: CrmSettingsInput) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Utilisateur non connecté.');

    const orgId = await getOrgId(supabase, orgSlug);
    await verifyAdminOrOwnerRole(supabase, orgId, user.id);

    // Fetch current setting before update
    const { data: currentOrg } = await supabase
      .from('organizations')
      .select('crm_visibility_mode')
      .eq('id', orgId)
      .single();

    // Perform update
    const { error: updateError } = await admin
      .from('organizations')
      .update({
        crm_visibility_mode: data.crm_visibility_mode,
        default_quote_follow_up_delay_days: data.default_quote_follow_up_delay_days,
        inactive_customer_delay_days: data.inactive_customer_delay_days,
        require_next_action_after_activity: data.require_next_action_after_activity,
        allow_sales_reassignment: data.allow_sales_reassignment,
        crm_activity_outcomes_enabled: data.crm_activity_outcomes_enabled,
        auto_create_quote_follow_up_task: data.auto_create_quote_follow_up_task,
        require_lost_reason: data.require_lost_reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    if (updateError) throw updateError;

    // Log to audit log
    const { ipPrefix, uaFamily } = await getClientMetadata();
    await admin.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'update_settings',
      entity_type: 'organizations',
      entity_id: orgId,
      metadata: { ...data },
      ip_prefix: ipPrefix,
      user_agent_family: uaFamily
    });

    // Specific audit action when visibility mode changes
    if (currentOrg && currentOrg.crm_visibility_mode !== data.crm_visibility_mode) {
      await admin.from('audit_logs').insert({
        organization_id: orgId,
        actor_user_id: user.id,
        action: 'visibility_changed',
        entity_type: 'organizations',
        entity_id: orgId,
        metadata: {
          old_mode: currentOrg.crm_visibility_mode,
          new_mode: data.crm_visibility_mode
        },
        ip_prefix: ipPrefix,
        user_agent_family: uaFamily
      });
    }

    revalidatePath(`/${orgSlug}/settings`);
    revalidatePath(`/${orgSlug}/customers`);
    revalidatePath(`/${orgSlug}/agenda`);

    return { success: true };
  } catch (err) {
    console.error('Error updating CRM settings:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier les paramètres CRM.' };
  }
}

export async function getUserSmtpConfig() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    const { data, error } = await supabase
      .from('user_email_configs')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) return { data: null };

    const decryptedPassword = decrypt(data.smtp_pass);

    return {
      data: {
        smtpHost: data.smtp_host,
        smtpPort: data.smtp_port,
        smtpUser: data.smtp_user,
        smtpPass: decryptedPassword,
        senderName: data.sender_name
      }
    };
  } catch (err) {
    console.error('Error fetching user SMTP config:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger la configuration SMTP.' };
  }
}

const smtpConfigSchema = z.object({
  smtpHost: z.string().trim().min(1, "Le serveur SMTP est requis"),
  smtpPort: z.number().int().min(1).max(65535, "Le port SMTP doit être compris entre 1 et 65535"),
  smtpUser: z.string().trim().email("L'adresse e-mail doit être valide"),
  smtpPass: z.string().min(1, "Le mot de passe de messagerie est requis"),
  senderName: z.string().trim().min(1, "Le nom de l'expéditeur est requis")
});

export async function saveUserSmtpConfig(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    const smtpHost = formData.get('smtpHost') as string;
    const smtpPortRaw = formData.get('smtpPort') as string;
    const smtpUser = formData.get('smtpUser') as string;
    const smtpPass = formData.get('smtpPass') as string;
    const senderName = formData.get('senderName') as string;

    const smtpPort = parseInt(smtpPortRaw, 10);

    const validation = smtpConfigSchema.safeParse({
      smtpHost,
      smtpPort: isNaN(smtpPort) ? undefined : smtpPort,
      smtpUser,
      smtpPass,
      senderName
    });

    if (!validation.success) {
      const errorMsg = validation.error.issues.map(issue => issue.message).join(', ');
      throw new Error(`Données de configuration SMTP invalides : ${errorMsg}`);
    }

    const validated = validation.data;
    const encryptedPassword = encrypt(validated.smtpPass);

    const { error } = await supabase
      .from('user_email_configs')
      .upsert({
        user_id: user.id,
        smtp_host: validated.smtpHost,
        smtp_port: validated.smtpPort,
        smtp_user: validated.smtpUser,
        smtp_pass: encryptedPassword,
        sender_name: validated.senderName,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('Error saving user SMTP config:', err);
    return { error: err instanceof Error ? err.message : 'Impossible d\'enregistrer la configuration SMTP.' };
  }
}

export async function disconnectMicrosoftAccount() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Utilisateur non connecté.');
    }

    const { error } = await supabase
      .from('user_microsoft_tokens')
      .delete()
      .eq('user_id', user.id);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('Error disconnecting Microsoft account:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de déconnecter le compte Microsoft.' };
  }
}

