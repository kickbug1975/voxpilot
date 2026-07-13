import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé. Veuillez vous connecter.' }, { status: 401 });
    }

    const clientId = env.MICROSOFT_CLIENT_ID;
    const tenantId = env.MICROSOFT_TENANT_ID || 'common';
    const redirectUri = `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/microsoft`;

    if (!clientId) {
      return NextResponse.json({ error: 'MICROSOFT_CLIENT_ID n\'est pas configuré.' }, { status: 500 });
    }

    const orgSlug = req.nextUrl.searchParams.get('orgSlug') || '';

    // Scopes to request
    const scopes = [
      'offline_access',
      'openid',
      'profile',
      'Mail.Send',
      'Mail.Send.Shared',
      'Mail.Read',
      'Mail.Read.Shared',
      'Contacts.ReadWrite'
    ].join(' ');

    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_mode', 'query');
    authUrl.searchParams.append('scope', scopes);
    authUrl.searchParams.append('state', `${user.id}:${orgSlug}`); // Link user ID and organization slug

    // Redirect the user to Microsoft's OAuth login screen
    return NextResponse.redirect(authUrl.toString());
  } catch (err) {
    console.error('[MICROSOFT_AUTH_REDIRECT] Error:', err);
    return NextResponse.json({ error: 'Impossible d\'initier la redirection Microsoft OAuth.' }, { status: 500 });
  }
}
