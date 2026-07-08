const token = '1|PQpKnvPZdXHXq7nIZDYABn5O8pEeNYpQwvPyadRMbe21b451';
const baseUrl = 'http://69.62.107.47:8000/api/v1';

async function getEnvs(appUuid: string, appName: string) {
  console.log(`🔍 Récupération des variables Coolify pour ${appName} (${appUuid})...`);
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
      console.log(`${e.key}=${e.value}`);
    });
    console.log('=============================================');
  } catch (err: any) {
    console.error(`❌ Échec pour ${appName} :`, err.message);
  }
}

async function run() {
  await getEnvs('lrj1h3ent36f5z9y0fnj6tyd', 'voxpilot');
  await getEnvs('ry1fsse3n60gqteaiew0ct3z', 'evolution-api');
}

run().catch(console.error);
