const token = '1|PQpKnvPZdXHXq7nIZDYABn5O8pEeNYpQwvPyadRMbe21b451';
const baseUrl = 'http://69.62.107.47:8000/api/v1';
const appUuid = 'tt8vuvzasc9ma1fk78u3z9m0'; // whatsapp-app

async function getEnvs() {
  console.log(`🔍 Récupération des variables d'environnement Coolify pour ${appUuid}...`);
  try {
    const res = await fetch(`${baseUrl}/applications/${appUuid}/envs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Coolify API returned status ${res.status}`);
    }
    const envs = await res.json() as any[];
    console.log(`\n✅ ${envs.length} variable(s) configurée(s) :`);
    envs.forEach(e => {
      console.log(`${e.key}=${e.value} (is_buildtime: ${e.is_buildtime}, is_literal: ${e.is_literal})`);
    });
  } catch (err: any) {
    console.error('❌ Échec :', err.message);
  }
}

getEnvs().catch(console.error);
