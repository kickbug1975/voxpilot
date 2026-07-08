const token = '1|PQpKnvPZdXHXq7nIZDYABn5O8pEeNYpQwvPyadRMbe21b451';
const baseUrl = 'http://69.62.107.47:8000/api/v1';
const serviceUuid = 'ry1fsse3n60gqteaiew0ct3z'; // evolution-api

async function getService() {
  console.log(`🔍 Récupération de la configuration du service Coolify ${serviceUuid}...`);
  try {
    const res = await fetch(`${baseUrl}/services/${serviceUuid}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Coolify API returned status ${res.status}`);
    }
    const serviceInfo = await res.json() as any;
    console.log(`\n✅ Service trouvé : ${serviceInfo.name}`);
    console.log(JSON.stringify(serviceInfo, null, 2));
  } catch (err: any) {
    console.error('❌ Échec :', err.message);
  }
}

getService().catch(console.error);
