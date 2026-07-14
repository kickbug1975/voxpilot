import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { encrypt } from '@/lib/encryption';


export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const errorDescription = req.nextUrl.searchParams.get('error_description');

  let orgSlug = 'default';
  
  try {
    if (state) {
      const parts = state.split(':');
      if (parts[1]) {
        orgSlug = parts[1];
      }
    }

    if (error) {
      console.error('[MICROSOFT_AUTH_CALLBACK] OAuth Error:', error, errorDescription);
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?error=microsoft-auth-failed&desc=${encodeURIComponent(errorDescription || '')}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?error=missing-params`);
    }

    const [stateUserId] = state.split(':');

    // 1. Verify user session in CRM
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== stateUserId) {
      console.error('[MICROSOFT_AUTH_CALLBACK] Unauthorized or User Session Mismatch.');
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?error=session-mismatch`);
    }

    const clientId = env.MICROSOFT_CLIENT_ID;
    const tenantId = env.MICROSOFT_TENANT_ID || 'common';
    const clientSecret = env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/microsoft`;

    if (!clientId || !clientSecret) {
      console.error('[MICROSOFT_AUTH_CALLBACK] Microsoft Client ID or Secret missing in configuration.');
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?error=config-missing`);
    }

    // 2. Exchange authorization code for tokens
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const tokenErrText = await tokenResponse.text();
      console.error('[MICROSOFT_AUTH_CALLBACK] Token Exchange Failed:', tokenErrText);
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?error=token-exchange-failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // 3. Fetch user email from Microsoft Graph /me
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    let microsoftEmail = user.email || '';
    if (graphResponse.ok) {
      const graphData = await graphResponse.json();
      microsoftEmail = graphData.mail || graphData.userPrincipalName || user.email || '';
    } else {
      console.warn('[MICROSOFT_AUTH_CALLBACK] Failed to fetch user profile from Microsoft Graph.');
    }

    // 4. Save tokens securely in user_microsoft_tokens table using Admin Client (bypasses RLS for write-back)
    const admin = createAdminClient();
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    const { error: dbError } = await admin
      .from('user_microsoft_tokens')
      .upsert({
        user_id: user.id,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expires_at: expiresAt,
        email: microsoftEmail,
        updated_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error('[MICROSOFT_AUTH_CALLBACK] Database Save Error:', dbError);
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?error=db-save-failed`);
    }

    // 5. Redirect back to organization settings page with success parameter
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?success=microsoft-connected`);
  } catch (err) {
    console.error('[MICROSOFT_AUTH_CALLBACK] General callback exception:', err);
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${orgSlug}/settings?error=callback-exception`);
  }
}
