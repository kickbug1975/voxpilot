const token = '1|PQpKnvPZdXHXq7nIZDYABn5O8pEeNYpQwvPyadRMbe21b451';
const baseUrl = 'http://69.62.107.47:8000/api/v1';

async function listApps() {
  console.log('🔍 Récupération de la liste des applications Coolify...');
  try {
    const res = await fetch(`${baseUrl}/applications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Coolify API returned status ${res.status}`);
    }
    const apps = await res.json() as any[];
    console.log(`\n✅ ${apps.length} application(s) trouvée(s) :`);
    apps.forEach(app => {
      console.log(`- Nom: ${app.name}`);
      console.log(`  UUID: ${app.uuid}`);
      console.log(`  FQDN: ${app.fqdn}`);
      console.log(`  Status: ${app.status}`);
      console.log(`  Repository: ${app.git_repository}/${app.git_branch}`);
      console.log('-----------------------------');
    });
  } catch (err: any) {
    console.error('❌ Échec de la récupération des applications :', err.message);
  }
}

listApps().catch(console.error);
