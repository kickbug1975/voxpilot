import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  
  // Get active session user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch first active membership
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('organizations(slug)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1);

  if (memberships && memberships.length > 0) {
    const org = (memberships[0].organizations as unknown) as { slug: string } | null;
    if (org?.slug) {
      redirect(`/${org.slug}`);
    }
  }

  // Check profiles fallback
  const { data: profile } = await supabase
    .from('profiles')
    .select('organizations(slug)')
    .eq('id', user.id)
    .single();

  const profileOrg = (profile?.organizations as unknown) as { slug: string } | null;
  if (profileOrg?.slug) {
    redirect(`/${profileOrg.slug}`);
  }

  // Fallback if no org is found
  redirect('/organizations/new');
}
